import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";

const DEVICE_ID_KEY = "cleanu.device_id";
// Local mirror of the onboarded flag so the app works offline-first: onboarding must
// never depend on (or wait for) the backend.
const ONBOARDED_KEY = "cleanu.onboarded";
// Locally-persisted usage counters — the source of truth that survives app kills,
// restarts and updates even when the backend sync fails (fire-and-forget can drop).
const COUNTER_KEYS = {
  free_mb_used: "cleanu.free_mb_used",
  free_photos_cleaned: "cleanu.free_photos_cleaned",
  free_video_compress_used: "cleanu.free_video_compress_used",
  free_live_still_used: "cleanu.free_live_still_used",
  free_contacts_used: "cleanu.free_contacts_used",
} as const;

function persistCounters(u: Partial<UserState>) {
  (Object.keys(COUNTER_KEYS) as (keyof typeof COUNTER_KEYS)[]).forEach((k) => {
    const v = u[k];
    if (typeof v === "number") storage.setItem(COUNTER_KEYS[k], v).catch(() => {});
  });
}

async function loadLocalCounters() {
  const [mb, photos, vc, ls, ct] = await Promise.all([
    storage.getItem<number>(COUNTER_KEYS.free_mb_used, 0),
    storage.getItem<number>(COUNTER_KEYS.free_photos_cleaned, 0),
    storage.getItem<number>(COUNTER_KEYS.free_video_compress_used, 0),
    storage.getItem<number>(COUNTER_KEYS.free_live_still_used, 0),
    storage.getItem<number>(COUNTER_KEYS.free_contacts_used, 0),
  ]);
  return {
    free_mb_used: mb ?? 0,
    free_photos_cleaned: photos ?? 0,
    free_video_compress_used: vc ?? 0,
    free_live_still_used: ls ?? 0,
    free_contacts_used: ct ?? 0,
  };
}

export type UserState = {
  device_id: string;
  is_premium: boolean;
  is_lifetime?: boolean;
  trial_ends_at?: string | null;
  free_mb_used: number;
  free_photos_cleaned: number;
  free_video_compress_used?: number;
  free_live_still_used?: number;
  free_contacts_used?: number;
  onboarded: boolean;
  plan?: string;
};

type AppContextValue = {
  ready: boolean;
  user: UserState | null;
  deviceId: string | null;
  refresh: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  trackUsage: (mb: number, photos: number, category?: string) => Promise<{ limit_reached: boolean }>;
  trackFeatureUse: (feature: "video_compress" | "live_still" | "contacts", count?: number) => Promise<{ used: number; limit_reached: boolean }>;
  subscribe: (plan: "weekly" | "lifetime") => Promise<void>;
  restore: () => Promise<boolean>;
  resetFree: () => Promise<void>;
  trackEvent: (name: string, props?: Record<string, unknown>) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function generateDeviceId(): string {
  return "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function getOrCreateDeviceId(): Promise<string> {
  // SecureStore (iOS Keychain) survives app reinstalls — always check here first.
  const secure = await storage.secureGet<string>(DEVICE_ID_KEY, "");
  if (secure) return secure;

  // Migration: existing users may have device_id in AsyncStorage (pre-fix).
  // Move it to SecureStore so they keep their data after the next update/reinstall.
  const legacy = await storage.getItem<string>(DEVICE_ID_KEY, "");
  if (legacy) {
    await storage.secureSet(DEVICE_ID_KEY, legacy);
    await storage.removeItem(DEVICE_ID_KEY); // clean up AsyncStorage
    return legacy;
  }

  // New device: prefer iOS Vendor ID (stable within vendor) then random fallback.
  let id = "";
  try {
    if (Platform.OS === "ios") {
      const v = await Application.getIosIdForVendorAsync();
      if (v) id = v;
    } else if (Platform.OS === "android") {
      const v = Application.getAndroidId?.();
      if (v) id = v;
    }
  } catch { /* ignore */ }
  if (!id) id = generateDeviceId();

  // Save in SecureStore so future reinstalls restore the same ID.
  await storage.secureSet(DEVICE_ID_KEY, id);
  return id;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [user, setUser] = useState<UserState | null>(null);

  // Always-fresh mirror of user so trackUsage can compute optimistic counters
  // without capturing a stale value in its useCallback closure.
  const userRef = useRef<UserState | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Merge a server user into local state, always keeping the HIGHER counter value so
  // a stale/behind backend (or a failed earlier sync) can never reset progress.
  const applyServer = useCallback((su: UserState) => {
    setUser((prev) => {
      const merged: UserState = {
        ...su,
        free_mb_used: Math.max(su.free_mb_used ?? 0, prev?.free_mb_used ?? 0),
        free_photos_cleaned: Math.max(su.free_photos_cleaned ?? 0, prev?.free_photos_cleaned ?? 0),
        free_video_compress_used: Math.max(su.free_video_compress_used ?? 0, prev?.free_video_compress_used ?? 0),
        free_live_still_used: Math.max(su.free_live_still_used ?? 0, prev?.free_live_still_used ?? 0),
        free_contacts_used: Math.max(su.free_contacts_used ?? 0, prev?.free_contacts_used ?? 0),
        // Onboarding: lokale Flag (prev) hat immer Vorrang — Backend darf nicht überschreiben
        onboarded: prev?.onboarded || false,
      };
      persistCounters(merged);
      return merged;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await api.get<UserState>(`/users/${deviceId}`);
      applyServer(res);
    } catch {
      // ignore
    }
  }, [deviceId, applyServer]);

  useEffect(() => {
    (async () => {
      const id = await getOrCreateDeviceId();
      setDeviceId(id);
      const localOnboarded = await storage.getItem<boolean>(ONBOARDED_KEY, false);
      const local = await loadLocalCounters();
      try {
        const res = await api.post<UserState>("/users/init", { device_id: id });
        // Merge server + locally-persisted counters (max wins → never resets on restart).
        const merged: UserState = {
          ...res,
          // Lokale Flag ist Source of Truth für Onboarding:
          // - Frische Installation (AsyncStorage geleert): localOnboarded = false → Onboarding zeigen
          // - Normaler Neustart / Update: localOnboarded = true → Onboarding überspringen
          // Backend-Flag wird NICHT verwendet, damit Reinstall immer Onboarding zeigt
          onboarded: localOnboarded ?? false,
          free_mb_used: Math.max(res.free_mb_used ?? 0, local.free_mb_used),
          free_photos_cleaned: Math.max(res.free_photos_cleaned ?? 0, local.free_photos_cleaned),
          free_video_compress_used: Math.max(res.free_video_compress_used ?? 0, local.free_video_compress_used),
          free_live_still_used: Math.max(res.free_live_still_used ?? 0, local.free_live_still_used),
          free_contacts_used: Math.max(res.free_contacts_used ?? 0, local.free_contacts_used),
        };
        setUser(merged);
        persistCounters(merged);
        // If local was ahead of the server (a prior sync failed), push the reconciled
        // values back so the backend catches up.
        if (
          !merged.is_premium &&
          (local.free_mb_used > (res.free_mb_used ?? 0) ||
            local.free_photos_cleaned > (res.free_photos_cleaned ?? 0))
        ) {
          const dMb = merged.free_mb_used - (res.free_mb_used ?? 0);
          const dPhotos = merged.free_photos_cleaned - (res.free_photos_cleaned ?? 0);
          if (dMb > 0 || dPhotos > 0) {
            api.post("/users/usage", { device_id: id, mb_freed: dMb, photos_cleaned: dPhotos, category: "resync" }).catch(() => {});
          }
        }
      } catch {
        // Backend unreachable — boot from locally-persisted counters so nothing resets.
        setUser({
          device_id: id,
          is_premium: false,
          onboarded: localOnboarded ?? false,
          ...local,
        });
      }
      setReady(true);
    })();
  }, []);

  // Optimistic + non-blocking: flips the flag locally right away and syncs the backend
  // in the background. Awaiting the network here froze the onboarding "Weiter" button.
  const completeOnboarding = useCallback(async () => {
    storage.setItem(ONBOARDED_KEY, true).catch(() => {});
    setUser((prev) =>
      prev
        ? { ...prev, onboarded: true }
        : {
            device_id: deviceId ?? "",
            is_premium: false,
            free_mb_used: 0,
            free_photos_cleaned: 0,
            onboarded: true,
          },
    );
    if (!deviceId) return;
    api
      .post<UserState>("/users/onboarding-complete", { device_id: deviceId })
      .then((res) => setUser({ ...res, onboarded: true }))
      .catch(() => {});
  }, [deviceId]);

  const trackUsage = useCallback(
    async (mb: number, photos: number, category?: string) => {
      // The delete already happened on-device. The success screen + quota update
      // must NEVER depend on the backend round-trip (a 404 / timeout used to throw
      // here and silently swallow the whole "wow, freed X" flow + the counter).
      const cur = userRef.current;
      const isPremium = !!cur?.is_premium;
      const newMb = (cur?.free_mb_used ?? 0) + mb;
      const newPhotos = (cur?.free_photos_cleaned ?? 0) + photos;
      const limitReached = !isPremium && newMb >= 100;

      // 1) Optimistic local update → quota bar fills instantly, gating stays correct.
      if (!isPremium) {
        setUser((prev) => (prev ? { ...prev, free_mb_used: newMb, free_photos_cleaned: newPhotos } : prev));
        persistCounters({ free_mb_used: newMb, free_photos_cleaned: newPhotos });
      }

      // 2) Background sync (records the session for Verlauf + reconciles counters).
      //    Fire-and-forget: it can never block or break the success screen.
      if (deviceId) {
        api
          .post<{ user: UserState; free_limit_reached: boolean }>("/users/usage", {
            device_id: deviceId,
            mb_freed: mb,
            photos_cleaned: photos,
            category,
          })
          .then((res) => {
            if (res?.user) applyServer(res.user);
          })
          .catch(() => {
            // offline / cold backend — local optimistic state already persisted
          });
      }

      return { limit_reached: limitReached };
    },
    [deviceId, applyServer],
  );

  const trackFeatureUse = useCallback(
    async (feature: "video_compress" | "live_still" | "contacts", count = 1) => {
      // Per-tool free usage counter: 2 free uses each, then paywall.
      const field = feature === "video_compress" ? "free_video_compress_used"
                  : feature === "live_still" ? "free_live_still_used"
                  : "free_contacts_used";
      const cur = userRef.current;
      const isPremium = !!cur?.is_premium;
      const used = ((cur?.[field] as number | undefined) ?? 0) + count;
      const limitReached = !isPremium && used >= 2;

      if (!isPremium) {
        setUser((prev) => (prev ? { ...prev, [field]: used } : prev));
        persistCounters({ [field]: used });
      }
      if (deviceId) {
        // Fire once per item so the backend counter stays in sync
        for (let i = 0; i < count; i++) {
          api
            .post<{ user: UserState }>("/users/feature-usage", { device_id: deviceId, feature })
            .then((res) => { if (res?.user) applyServer(res.user); })
            .catch(() => {});
        }
      }
      return { used, limit_reached: limitReached };
    },
    [deviceId, applyServer],
  );

  const subscribe = useCallback(
    async (plan: "weekly" | "lifetime") => {
      if (!deviceId) return;
      const res = await api.post<{ user: UserState }>("/users/subscribe", { device_id: deviceId, plan });
      setUser(res.user);
    },
    [deviceId],
  );

  const restore = useCallback(async () => {
    if (!deviceId) return false;
    const res = await api.post<{ restored: boolean; user: UserState }>("/users/restore", { device_id: deviceId });
    setUser(res.user);
    return res.restored;
  }, [deviceId]);

  const resetFree = useCallback(async () => {
    if (!deviceId) return;
    // Clear locally-persisted counters too, otherwise the max-merge would restore them.
    await Promise.all(
      (Object.keys(COUNTER_KEYS) as (keyof typeof COUNTER_KEYS)[]).map((k) => storage.setItem(COUNTER_KEYS[k], 0)),
    );
    const res = await api.post<UserState>("/users/reset", { device_id: deviceId });
    setUser(res);
  }, [deviceId]);

  const trackEvent = useCallback(
    async (name: string, props: Record<string, unknown> = {}) => {
      if (!deviceId) return;
      try {
        await api.post("/events", { device_id: deviceId, event_name: name, properties: props });
      } catch {
        // fire-and-forget
      }
    },
    [deviceId],
  );

  return (
    <AppContext.Provider
      value={{ ready, user, deviceId, refresh, completeOnboarding, trackUsage, trackFeatureUse, subscribe, restore, resetFree, trackEvent }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
