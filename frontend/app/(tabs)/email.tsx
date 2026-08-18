// E-Mail Tab — Echtzeit-Scan + Gmail Labels API + Filter-System

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, FlatList,
  ActivityIndicator, Animated as RNAnimated, Switch, TextInput,
  Modal, KeyboardAvoidingView, Platform, TouchableOpacity, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue, withTiming, withSpring, withSequence, withRepeat, withDelay,
  useAnimatedStyle, Easing,
} from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";
import i18n from "@/src/i18n";

// ── Credentials ──────────────────────────────────────────────
const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
  "289642101774-vut787knc4vsami25i08u2a219fba80h.apps.googleusercontent.com";
const REDIRECT_URI =
  "com.googleusercontent.apps.289642101774-vut787knc4vsami25i08u2a219fba80h:/oauthredirect";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.modify";

// ── Types ──────────────────────────────────────────────────────
type Screen = "login" | "scanning" | "categories" | "emailList" | "unsubscribe" | "emailView";
type CatKey = "CATEGORY_SOCIAL" | "CATEGORY_PROMOTIONS" | "CATEGORY_UPDATES" | "CATEGORY_FORUMS" | "SPAM";
type ScanStatus = "pending" | "scanning" | "done";
type AgeFilter = "all" | "week" | "month" | "year";

interface FilterState {
  ageFilter: AgeFilter;
  deleteStarred: boolean;
  deleteRead: boolean;
  deleteUnread: boolean;
  excludeKeywords: boolean;
  keywords: string[];
}

interface ScanRow { id: CatKey; label: string; icon: string; color: string; total: number; unread: number; status: ScanStatus }
interface CatState { total: number; unread: number; checked: boolean; animated: number }
interface EmailMsg { id: string; from: string; subject: string; snippet: string; listUnsubscribe?: string }
interface UnsubSender { domain: string; name: string; email: string; count: number; messageIds: string[]; unsubUrl?: string }

// ── Constants ─────────────────────────────────────────────────
const DEFAULT_FILTER: FilterState = {
  ageFilter: "all",
  deleteStarred: false,
  deleteRead: true,
  deleteUnread: true,
  excludeKeywords: false,
  keywords: [],
};

const CAT_CONFIG: { id: CatKey; labelKey: string; icon: string; color: string }[] = [
  { id: "CATEGORY_SOCIAL",     labelKey: "cat_social",      icon: "people",        color: "#007AFF" },
  { id: "CATEGORY_PROMOTIONS", labelKey: "cat_promotions",  icon: "pricetag",      color: "#FF9500" },
  { id: "CATEGORY_UPDATES",    labelKey: "cat_updates",     icon: "notifications", color: "#5856D6" },
  { id: "CATEGORY_FORUMS",     labelKey: "cat_forums",      icon: "chatbubbles",   color: "#34C759" },
  { id: "SPAM",                labelKey: "cat_spam",        icon: "warning",       color: "#FF3B30" },
];

const DEMO_COUNTS = [12_847, 8_392, 4_521, 1_386, 543, 247, 58];
const TOKEN_KEY = "cleanu.gmail_token";
const REFRESH_KEY = "cleanu.gmail_refresh";
const EMAIL_KEY = "cleanu.gmail_email";
const INSTALL_FLAG_KEY = "cleanu.install_flag"; // AsyncStorage (geleert bei Deinstallation)
const CATS_CACHE_KEY = "cleanu.email_cats_v1";  // Scan-Cache
const TOTAL_CACHE_KEY = "cleanu.email_total_v1";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Reinstall-Detection ───────────────────────────────────────
// iOS Keychain (SecureStore) überlebt App-Löschung → manuell löschen bei Neuinstallation
// AsyncStorage wird bei Deinstallation geleert → perfekt als Installations-Flag
async function clearTokensOnReinstall(): Promise<void> {
  try {
    const installFlag = await storage.getItem(INSTALL_FLAG_KEY, null as string | null);
    if (!installFlag) {
      // Keine Flag = Erstinstallation oder Neuinstallation → Keychain bereinigen
      await storage.secureRemove(TOKEN_KEY);
      await storage.secureRemove(REFRESH_KEY);
      await storage.secureRemove(EMAIL_KEY);
      await storage.setItem(INSTALL_FLAG_KEY, "1");
    }
  } catch {
    try { await storage.setItem(INSTALL_FLAG_KEY, "1"); } catch {}
  }
}

// ── Filter helpers ────────────────────────────────────────────
function buildFilterQuery(filter: FilterState): string {
  const parts: string[] = [];
  if (filter.ageFilter === "week")  parts.push("older_than:7d");
  if (filter.ageFilter === "month") parts.push("older_than:1m");
  if (filter.ageFilter === "year")  parts.push("older_than:1y");
  if (!filter.deleteStarred) parts.push("-is:starred");
  if (filter.deleteRead && !filter.deleteUnread)  parts.push("is:read");
  if (!filter.deleteRead && filter.deleteUnread)  parts.push("is:unread");
  if (filter.excludeKeywords) {
    filter.keywords.filter(k => k.trim()).forEach(kw => {
      parts.push(`-subject:"${kw.trim()}"`);
    });
  }
  return parts.join(" ");
}

function isFilterActive(f: FilterState): boolean {
  return (
    f.ageFilter !== "all" ||
    f.deleteStarred !== false ||
    f.deleteRead !== true ||
    f.deleteUnread !== true ||
    (f.excludeKeywords && f.keywords.length > 0)
  );
}

// ── Token helpers ─────────────────────────────────────────────
async function validateToken(tok: string): Promise<boolean> {
  try {
    const r = await fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${tok}` },
    });
    return r.ok;
  } catch { return false; }
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: IOS_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });
    const data = await resp.json();
    return data.access_token ?? null;
  } catch { return null; }
}

// ── Utils ─────────────────────────────────────────────────────
function generateVerifier(): string {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let v = "";
  for (let i = 0; i < 64; i++) v += c.charAt(Math.floor(Math.random() * c.length));
  return v;
}

function fmt(n: number): string {
  if (n < 0) return i18n.t("email_screen.count_over_limit");
  return i18n.t("email_screen.count", { count: n, formatted: nf(n) });
}

function nf(n: number): string {
  try { return n.toLocaleString(i18n.language); } catch { return String(n); }
}

// ── Gmail API ─────────────────────────────────────────────────
async function gGet(path: string, token: string) {
  const r = await fetch(`${GMAIL_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Gmail ${r.status}`);
  return r.json();
}

// Kategorie-Queries für Fallback wenn Labels API 0 zurückgibt
const CATEGORY_QUERIES: Record<string, string> = {
  // Soziale Medien: NUR Domain-basiert (KEIN category:social!) damit Facebook/Instagram
  // auch aus Inbox, Promotions etc. gefunden werden — category:social würde sie da NICHT finden
  // Aufgeteilt in 2 kürzere Queries die parallel laufen (siehe fetchSocialEmails)
  CATEGORY_SOCIAL: "MULTI_QUERY", // spezieller Marker — wird in getLabelCount/fetchMessages behandelt
  CATEGORY_PROMOTIONS: "category:promotions",
  CATEGORY_UPDATES:    "category:updates",
  CATEGORY_FORUMS:     "category:forums",
  SPAM:                "label:spam",
};

// Soziale Medien: 2 Queries parallel für maximale Trefferquote
const SOCIAL_QUERIES = [
  // Facebook + Instagram + Meta
  "from:facebookmail.com OR from:facebook.com OR from:instagram.com OR from:metamail.com OR from:meta.com",
  // Alle anderen sozialen Netzwerke
  "from:twitter.com OR from:x.com OR from:xing.com OR from:tiktok.com OR from:linkedin.com OR from:snapchat.com OR from:pinterest.com OR from:youtube.com OR from:discord.com OR from:reddit.com OR from:twitch.tv OR from:threads.net OR from:whatsapp.com",
];

// Für fetchMessages: welche Query statt labelId nutzen wenn label leer ist
const CAT_FETCH_QUERY: Partial<Record<CatKey, string>> = {
  CATEGORY_SOCIAL: CATEGORY_QUERIES.CATEGORY_SOCIAL,
};

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Base64url decode (RFC 4648) ───────────────────────────────
function decodeBase64Url(str: string): string {
  try {
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    try { return decodeURIComponent(escape(binary)); } catch { return binary; }
  } catch { return ""; }
}

interface BodyResult { html: string | null; text: string | null }
function extractBody(payload: any): BodyResult {
  if (!payload) return { html: null, text: null };
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return { html: null, text: decodeBase64Url(payload.body.data) };
  if (payload.mimeType === "text/html" && payload.body?.data)
    return { html: decodeBase64Url(payload.body.data), text: null };
  if (payload.parts) {
    let html: string | null = null, text: string | null = null;
    for (const part of payload.parts) {
      const r = extractBody(part);
      if (r.html && !html) html = r.html;
      if (r.text && !text) text = r.text;
    }
    return { html, text };
  }
  return { html: null, text: null };
}

async function getLabelCount(token: string, labelId: string): Promise<{ total: number; unread: number }> {
  // Labels API → EXAKTE Zahlen
  try {
    const d = await gGet(`/labels/${labelId}`, token);
    const total = d.messagesTotal ?? 0;
    const unread = d.messagesUnread ?? 0;
    if (total > 0) return { total, unread };
  } catch {}

  // Soziale Medien: 2 parallele Domain-Queries (kein category:social → findet auch Mails aus Inbox/Promotions!)
  if (labelId === "CATEGORY_SOCIAL") {
    try {
      const [r1, r2] = await Promise.all([
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[0])}&maxResults=500&fields=messages(id),nextPageToken`, token).catch(() => ({ messages: [] })),
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[1])}&maxResults=500&fields=messages(id),nextPageToken`, token).catch(() => ({ messages: [] })),
      ]);
      const seen = new Set<string>();
      r1.messages?.forEach((m: {id: string}) => seen.add(m.id));
      r2.messages?.forEach((m: {id: string}) => seen.add(m.id));
      const total = seen.size > 0 ? (r1.nextPageToken || r2.nextPageToken ? -1 : seen.size) : 0;
      // Unread
      const [u1, u2] = await Promise.all([
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[0] + " is:unread")}&maxResults=200&fields=messages(id)`, token).catch(() => ({ messages: [] })),
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[1] + " is:unread")}&maxResults=200&fields=messages(id)`, token).catch(() => ({ messages: [] })),
      ]);
      const unreadSeen = new Set<string>();
      u1.messages?.forEach((m: {id: string}) => unreadSeen.add(m.id));
      u2.messages?.forEach((m: {id: string}) => unreadSeen.add(m.id));
      return { total, unread: unreadSeen.size };
    } catch {}
  }

  // Fallback für andere Kategorien
  const q = CATEGORY_QUERIES[labelId];
  if (!q || q === "MULTI_QUERY") return { total: 0, unread: 0 };
  try {
    const [totResp, unreadResp] = await Promise.all([
      gGet(`/messages?q=${encodeURIComponent(q)}&maxResults=500&fields=messages(id),nextPageToken`, token),
      gGet(`/messages?q=${encodeURIComponent(q + " is:unread")}&maxResults=500&fields=messages(id),nextPageToken`, token),
    ]);
    const total = totResp.messages?.length ?? 0;
    const unread = unreadResp.messages?.length ?? 0;
    return { total: totResp.nextPageToken ? -1 : total, unread };
  } catch { return { total: 0, unread: 0 }; }
}

async function fetchMessages(
  token: string,
  label: string,
  pageToken?: string,
  queryOverride?: string,
): Promise<{ emails: EmailMsg[]; nextPageToken?: string }> {
  try {
    // Soziale Medien: 2 Queries parallel (Facebook aus jeder Kategorie!)
    if (label === "CATEGORY_SOCIAL" && !pageToken) {
      const [r1, r2] = await Promise.all([
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[0])}&maxResults=30&fields=messages(id)`, token).catch(() => ({ messages: [] })),
        gGet(`/messages?q=${encodeURIComponent(SOCIAL_QUERIES[1])}&maxResults=30&fields=messages(id)`, token).catch(() => ({ messages: [] })),
      ]);
      const seen = new Set<string>();
      const allIds: string[] = [];
      [...(r1.messages ?? []), ...(r2.messages ?? [])].forEach((m: {id: string}) => {
        if (!seen.has(m.id)) { seen.add(m.id); allIds.push(m.id); }
      });
      if (allIds.length === 0) return { emails: [] };
      const details = await Promise.all(allIds.slice(0, 50).map(async (id) => {
        try {
          const d = await gGet(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,snippet,payload(headers)`, token);
          const hdrs: { name: string; value: string }[] = d.payload?.headers ?? [];
          return { id, from: hdrs.find(h => h.name === "From")?.value ?? "", subject: hdrs.find(h => h.name === "Subject")?.value ?? i18n.t("email_screen.no_subject"), snippet: d.snippet ?? "" } as EmailMsg;
        } catch { return null; }
      }));
      return { emails: details.filter(Boolean) as EmailMsg[] };
    }

    // Standard: labelId oder queryOverride
    const baseUrl = queryOverride
      ? `/messages?q=${encodeURIComponent(queryOverride)}&maxResults=50&fields=messages(id),nextPageToken${pageToken ? `&pageToken=${pageToken}` : ""}`
      : `/messages?labelIds=${label}&maxResults=50&fields=messages(id),nextPageToken${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const list = await gGet(baseUrl, token);
    if (!list.messages) return { emails: [] };
    const details = await Promise.all(
      list.messages.map(async (m: { id: string }) => {
        try {
          const d = await gGet(
            `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe&fields=id,snippet,payload(headers)`,
            token
          );
          const hdrs: { name: string; value: string }[] = d.payload?.headers ?? [];
          return {
            id: m.id,
            from: hdrs.find(h => h.name === "From")?.value ?? "",
            subject: hdrs.find(h => h.name === "Subject")?.value ?? i18n.t("email_screen.no_subject"),
            snippet: d.snippet ?? "",
            listUnsubscribe: hdrs.find(h => h.name === "List-Unsubscribe")?.value,
          } as EmailMsg;
        } catch { return null; }
      })
    );
    return {
      emails: details.filter(Boolean) as EmailMsg[],
      nextPageToken: list.nextPageToken,
    };
  } catch { return { emails: [] }; }
}

// getAllMsgIds respektiert den Filter + optionale Query-Override (für Soziale Medien)
async function getAllMsgIds(token: string, label: string, filter: FilterState, queryOverride?: string): Promise<string[]> {
  if (!filter.deleteRead && !filter.deleteUnread) return [];
  const filterQ = buildFilterQuery(filter);
  const ids: string[] = [];
  let pageToken: string | undefined;
  let safety = 0;
  do {
    let url: string;
    if (queryOverride) {
      // Für Social: Domain-Query + Filter kombinieren
      const combined = filterQ ? `(${queryOverride}) ${filterQ}` : queryOverride;
      url = `/messages?q=${encodeURIComponent(combined)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ""}&fields=messages(id),nextPageToken`;
    } else {
      const qParam = filterQ ? `&q=${encodeURIComponent(filterQ)}` : "";
      url = `/messages?labelIds=${label}&maxResults=500${qParam}${pageToken ? `&pageToken=${pageToken}` : ""}&fields=messages(id),nextPageToken`;
    }
    const d = await gGet(url, token);
    if (d.messages) ids.push(...d.messages.map((m: { id: string }) => m.id));
    pageToken = d.nextPageToken;
    safety++;
    if (safety > 30) break;
  } while (pageToken);
  return ids;
}

async function trashAllInLabel(token: string, label: string, filter: FilterState): Promise<void> {
  const queryOverride = CAT_FETCH_QUERY[label as CatKey];
  const ids = await getAllMsgIds(token, label, filter, queryOverride);
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await fetch(`${GMAIL_BASE}/messages/batchModify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
    });
  }
}

// fetchUnsubscribers: scannt Promotions + Social + Updates + Inbox
// Gruppiert nach Absender-Domain → findet alle Newsletter auch ohne List-Unsubscribe Header
async function fetchUnsubscribers(
  token: string,
  onProgress?: (scanned: number, found: number, total: number) => void
): Promise<UnsubSender[]> {
  try {
    // Alle Kategorien parallel laden (IDs)
    const categorySearches = [
      { q: "category:promotions", max: 500 },
      { q: "category:social",     max: 300 },
      { q: "category:updates",    max: 300 },
      { q: "in:inbox",            max: 200 },
    ];

    const allIdSet: Set<string> = new Set();
    await Promise.all(categorySearches.map(async ({ q, max }) => {
      try {
        const resp = await gGet(`/messages?q=${encodeURIComponent(q)}&maxResults=${max}&fields=messages(id)`, token);
        resp.messages?.forEach((m: { id: string }) => allIdSet.add(m.id));
      } catch {}
    }));

    const idsToProcess = [...allIdSet].slice(0, 1000);
    const totalToScan = idsToProcess.length;
    onProgress?.(0, 0, totalToScan);

    const BATCH = 30;
    const map: Record<string, UnsubSender> = {};
    let scanned = 0;

    for (let i = 0; i < idsToProcess.length; i += BATCH) {
      const batch = idsToProcess.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (id) => {
          try {
            const d = await gGet(
              `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=List-Unsubscribe&fields=id,payload(headers)`,
              token
            );
            const hdrs: { name: string; value: string }[] = d.payload?.headers ?? [];
            const from = hdrs.find(h => h.name === "From")?.value ?? "";
            const unsub = hdrs.find(h => h.name === "List-Unsubscribe")?.value ?? "";
            return from ? { id, from, unsub } : null;
          } catch { return null; }
        })
      );

      results.filter(Boolean).forEach((m: any) => {
        // E-Mail-Adresse extrahieren
        const emailMatch = m.from.match(/<([^>]+@[^>]+)>/) ?? m.from.match(/([^\s<>"]+@[^\s<>"]+)/);
        const emailAddr = (emailMatch?.[1] ?? "").toLowerCase().trim();
        if (!emailAddr || !emailAddr.includes("@")) return;

        // Domain (letzten 2 Teile) für saubere Gruppierung
        const rawDomain = emailAddr.split("@")[1] ?? "";
        const parts = rawDomain.split(".");
        const domain = parts.length >= 2 ? parts.slice(-2).join(".") : rawDomain;
        if (!domain) return;

        // Absender-Name
        const nameMatch = m.from.match(/^"?([^"<@\n]+?)"?\s*</);
        const name = (nameMatch?.[1]?.trim()) || capitalize(parts[0] ?? domain) || "?";

        // Unsubscribe-URL
        const urlMatch = m.unsub?.match(/<(https[^>]+)>/);
        const url = urlMatch?.[1];

        if (!map[domain]) {
          map[domain] = { domain, name, email: emailAddr, count: 0, messageIds: [], unsubUrl: url };
        }
        map[domain].count++;
        map[domain].messageIds.push(m.id);
        if (url && !map[domain].unsubUrl) map[domain].unsubUrl = url;
      });

      scanned += batch.length;
      const found = Object.values(map).filter(s => s.count >= 2).length;
      onProgress?.(scanned, found, totalToScan);
    }

    // Nur Absender mit 2+ E-Mails → das sind echte Newsletter/Wiederhol-Sender
    return Object.values(map)
      .filter(s => s.count >= 2)
      .sort((a, b) => b.count - a.count);
  } catch { return []; }
}

async function archiveMessages(token: string, ids: string[]): Promise<void> {
  await Promise.all(ids.map(id =>
    fetch(`${GMAIL_BASE}/messages/${id}/modify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ removeLabelIds: ["INBOX"] }),
    })
  ));
}

function parseSender(from: string) {
  const m = from.match(/^"?([^"<]+)"?\s*(?:<.*>)?$/);
  const name = m?.[1]?.trim() || from.split("@")[0] || "?";
  return { name, initial: name.charAt(0).toUpperCase() };
}

// ── Google G Logo ─────────────────────────────────────────────
function GoogleG({ size = 22 }: { size?: number }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: r, height: r, backgroundColor: "#4285F4" }} />
        <View style={{ width: r, height: r, backgroundColor: "#EA4335" }} />
        <View style={{ width: r, height: r, backgroundColor: "#34A853" }} />
        <View style={{ width: r, height: r, backgroundColor: "#FBBC05" }} />
      </View>
      <View style={{ position: "absolute", top: size * 0.22, left: size * 0.22, width: size * 0.56, height: size * 0.56, borderRadius: size * 0.28, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: size * 0.28, fontWeight: "900", color: "#4285F4", lineHeight: size * 0.32 }}>G</Text>
      </View>
    </View>
  );
}

// ── Scan Row Item ─────────────────────────────────────────────
function ScanRowItem({ row }: { row: ScanRow }) {
  const { t } = useTranslation();
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(12)).current;

  useEffect(() => {
    if (row.status !== "pending") {
      RNAnimated.parallel([
        RNAnimated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 9 }),
      ]).start();
    }
  }, [row.status]);

  if (row.status === "pending") return null;

  return (
    <RNAnimated.View style={[s.scanRow, { opacity, transform: [{ translateY }] }]}>
      <View style={[s.scanIcon, { backgroundColor: `${row.color}18` }]}>
        <Ionicons name={row.icon as any} size={18} color={row.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.scanLabel}>{row.label}</Text>
        {row.status === "scanning"
          ? <Text style={s.scanCountPending}>{t("email_screen.scanning_row")}</Text>
          : <Text style={s.scanCount}>{fmt(row.total)}</Text>
        }
      </View>
      {row.status === "done" && <Ionicons name="checkmark-circle" size={20} color="#34C759" />}
      {row.status === "scanning" && <ActivityIndicator size="small" color={row.color} />}
    </RNAnimated.View>
  );
}

// ── Filter Modal ──────────────────────────────────────────────
function FilterModal({
  visible, filter, onApply, onClose,
}: {
  visible: boolean;
  filter: FilterState;
  onApply: (f: FilterState) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [local, setLocal] = useState<FilterState>(filter);
  const [newKw, setNewKw] = useState("");
  const [showKwInput, setShowKwInput] = useState(false);

  useEffect(() => {
    if (visible) { setLocal(filter); setNewKw(""); setShowKwInput(false); }
  }, [visible]); // eslint-disable-line

  const addKw = () => {
    const kw = newKw.trim();
    if (kw && !local.keywords.includes(kw)) setLocal(p => ({ ...p, keywords: [...p.keywords, kw] }));
    setNewKw(""); setShowKwInput(false);
  };

  const AGE_OPTIONS: { key: AgeFilter; label: string }[] = [
    { key: "all",   label: t("email_screen.age_all") },
    { key: "week",  label: t("email_screen.age_week") },
    { key: "month", label: t("email_screen.age_month") },
    { key: "year",  label: t("email_screen.age_year") },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={fm.root}>
        {/* Header */}
        <View style={[fm.header, { paddingTop: insets.top > 0 ? insets.top + 8 : 20 }]}>
          <TouchableOpacity testID="filter-close-btn" onPress={onClose} style={fm.closeBtn} hitSlop={8}>
            <View style={fm.closeCircle}>
              <Ionicons name="close" size={16} color="#666" />
            </View>
          </TouchableOpacity>
          <Text style={fm.headerTitle}>{t("email_screen.filter_title")}</Text>
          <View style={{ width: 44 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[fm.scroll, { paddingBottom: insets.bottom + 90 }]}
            keyboardShouldPersistTaps="handled"
          >
            {/* ZEIT */}
            <Text style={fm.sectionLabel}>{t("email_screen.section_time")}</Text>
            <View style={fm.card}>
              {AGE_OPTIONS.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.key}
                  testID={`filter-age-${opt.key}`}
                  style={[fm.radioRow, idx < AGE_OPTIONS.length - 1 && fm.rowDivider]}
                  onPress={() => setLocal(p => ({ ...p, ageFilter: opt.key }))}
                  activeOpacity={0.7}
                >
                  <Text style={fm.rowLabel}>{opt.label}</Text>
                  <View style={[fm.radio, local.ageFilter === opt.key && fm.radioSelected]}>
                    {local.ageFilter === opt.key && <View style={fm.radioDot} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* FAVORIT */}
            <Text style={fm.sectionLabel}>{t("email_screen.section_favorite")}</Text>
            <View style={fm.card}>
              <View style={fm.toggleRow}>
                <Text style={fm.rowLabel}>{t("email_screen.toggle_starred")}</Text>
                <Switch
                  testID="filter-toggle-starred"
                  value={local.deleteStarred}
                  onValueChange={v => setLocal(p => ({ ...p, deleteStarred: v }))}
                  trackColor={{ false: "#E0E0E0", true: "#007AFF" }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* GELESEN & UNGELESEN */}
            <Text style={fm.sectionLabel}>{t("email_screen.section_read_unread")}</Text>
            <View style={fm.card}>
              <View style={[fm.toggleRow, fm.rowDivider]}>
                <Text style={fm.rowLabel}>{t("email_screen.toggle_read")}</Text>
                <Switch
                  testID="filter-toggle-read"
                  value={local.deleteRead}
                  onValueChange={v => setLocal(p => ({ ...p, deleteRead: v }))}
                  trackColor={{ false: "#E0E0E0", true: "#007AFF" }}
                  thumbColor="#fff"
                />
              </View>
              <View style={fm.toggleRow}>
                <Text style={fm.rowLabel}>{t("email_screen.toggle_unread")}</Text>
                <Switch
                  testID="filter-toggle-unread"
                  value={local.deleteUnread}
                  onValueChange={v => setLocal(p => ({ ...p, deleteUnread: v }))}
                  trackColor={{ false: "#E0E0E0", true: "#007AFF" }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* SCHLÜSSELWÖRTER */}
            <Text style={fm.sectionLabel}>{t("email_screen.section_keywords")}</Text>
            <View style={fm.card}>
              <View style={fm.toggleRow}>
                <Text style={[fm.rowLabel, { flex: 1, marginRight: 8 }]}>
                  {t("email_screen.toggle_keywords")}
                </Text>
                <Switch
                  testID="filter-toggle-keywords"
                  value={local.excludeKeywords}
                  onValueChange={v => setLocal(p => ({ ...p, excludeKeywords: v }))}
                  trackColor={{ false: "#E0E0E0", true: "#007AFF" }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {local.excludeKeywords && (
              <>
                {local.keywords.length > 0 && (
                  <View style={fm.kwChips}>
                    {local.keywords.map(kw => (
                      <View key={kw} style={fm.kwChip}>
                        <Text style={fm.kwChipText}>{kw}</Text>
                        <TouchableOpacity
                          testID={`kw-remove-${kw}`}
                          onPress={() => setLocal(p => ({ ...p, keywords: p.keywords.filter(k => k !== kw) }))}
                          hitSlop={8}
                        >
                          <Ionicons name="close-circle" size={16} color="#8E8E93" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {showKwInput ? (
                  <View style={fm.kwInputRow}>
                    <TextInput
                      testID="filter-kw-input"
                      style={fm.kwInput}
                      value={newKw}
                      onChangeText={setNewKw}
                      placeholder={t("email_screen.keyword_placeholder")}
                      placeholderTextColor="#C7C7CC"
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={addKw}
                    />
                    <TouchableOpacity testID="kw-add-confirm" onPress={addKw} style={fm.kwAddBtn}>
                      <Text style={fm.kwAddBtnText}>{t("email_screen.keyword_add_confirm")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    testID="kw-add-open"
                    style={fm.kwAddRow}
                    onPress={() => setShowKwInput(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={18} color="#007AFF" />
                    <Text style={fm.kwAddText}>{t("email_screen.keyword_add_open")}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Apply Button */}
        <View style={[fm.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            testID="filter-apply-btn"
            style={fm.applyBtn}
            onPress={() => { onApply(local); onClose(); }}
            activeOpacity={0.85}
          >
            <Text style={fm.applyBtnText}>{t("email_screen.filter_apply_btn")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── UnsubCard (Konkurrent-Clone mit Favicon + Behalten/Abmelden) ──
function UnsubCard({ item, onUnsub, onKeep, processing }: { item: UnsubSender; onUnsub: () => void; onKeep: () => void; processing?: boolean }) {
  const { t } = useTranslation();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${item.domain}&sz=128`;
  const [logoErr, setLogoErr] = useState(false);
  const initial = item.name.charAt(0).toUpperCase();
  const colors = ["#007AFF","#FF9500","#34C759","#AF52DE","#FF3B30","#5856D6","#5AC8FA","#FF2D55"];
  const color = colors[initial.charCodeAt(0) % colors.length];

  return (
    <View style={[uc.card, processing && { opacity: 0.6 }]} testID={`unsub-${item.domain}`}>
      <View style={uc.row}>
        {!logoErr ? (
          <ExpoImage
            source={{ uri: faviconUrl }}
            style={uc.logo}
            onError={() => setLogoErr(true)}
          />
        ) : (
          <View style={[uc.logo, uc.logoFallback, { backgroundColor: color }]}>
            <Text style={uc.logoInitial}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={uc.name} numberOfLines={1}>{item.name}</Text>
          <Text style={uc.email} numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={uc.countBadge}>
          <Text style={uc.countText}>{t("email_screen.item_count", { count: item.count })}</Text>
        </View>
      </View>
      <View style={uc.btnRow}>
        <TouchableOpacity testID={`keep-btn-${item.domain}`} style={uc.keepBtn} onPress={onKeep} disabled={processing} activeOpacity={0.8}>
          <Text style={uc.keepBtnText}>{t("common.keep")}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID={`unsub-btn-${item.domain}`} style={[uc.unsubBtn, processing && { opacity: 0.7 }]} onPress={onUnsub} disabled={processing} activeOpacity={0.8}>
          {processing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={uc.unsubBtnText}>{t("email_screen.unsubscribe_action")}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main EmailTab ─────────────────────────────────────────────
export default function EmailTab() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>("login");
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanTotal, setScanTotal] = useState(0);
  const [cats, setCats] = useState<Partial<Record<CatKey, CatState>>>({});
  const [activeCat, setActiveCat] = useState<CatKey | null>(null);
  const [emails, setEmails] = useState<EmailMsg[]>([]);
  const [emailPageToken, setEmailPageToken] = useState<string | undefined>();
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingEmails, setDeletingEmails] = useState(false);
  const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<"bulk" | "selected" | null>(null);
  const [unsubs, setUnsubs] = useState<UnsubSender[]>([]);
  const [loadingUnsubs, setLoadingUnsubs] = useState(false);
  const [unsubProcessing, setUnsubProcessing] = useState<string | null>(null);
  const [unsubProgress, setUnsubProgress] = useState({ scanned: 0, found: 0, total: 0 });
  const [demoIdx, setDemoIdx] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [cleaningCats, setCleaningCats] = useState(false);

  // Email View State
  const [viewingEmail, setViewingEmail] = useState<EmailMsg | null>(null);
  const [emailBodyHtml, setEmailBodyHtml] = useState<string | null>(null);
  const [emailBodyText, setEmailBodyText] = useState<string | null>(null);
  const [emailDate, setEmailDate] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  const badgeScale = useSharedValue(1);
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));
  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  // Radar-Ring Animationen
  const r1s = useSharedValue(0.5); const r1o = useSharedValue(0);
  const r2s = useSharedValue(0.5); const r2o = useSharedValue(0);
  const r3s = useSharedValue(0.5); const r3o = useSharedValue(0);
  const ring1Style = useAnimatedStyle(() => ({ transform: [{ scale: r1s.value }], opacity: r1o.value }));
  const ring2Style = useAnimatedStyle(() => ({ transform: [{ scale: r2s.value }], opacity: r2o.value }));
  const ring3Style = useAnimatedStyle(() => ({ transform: [{ scale: r3s.value }], opacity: r3o.value }));

  // Demo counter
  useEffect(() => {
    const t = setInterval(() => {
      setDemoIdx(i => (i + 1) % DEMO_COUNTS.length);
      badgeScale.value = withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 8 }));
    }, 2000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  // Auto-Login
  useEffect(() => {
    (async () => {
      // ZUERST: Tokens löschen wenn App neu installiert wurde (Keychain überlebt Deinstallation)
      await clearTokensOnReinstall();

      const stored = await storage.secureGet(TOKEN_KEY, null as string | null);
      const storedRefresh = await storage.secureGet(REFRESH_KEY, null as string | null);
      const email = await storage.secureGet(EMAIL_KEY, null as string | null);
      if (!stored && !storedRefresh) return;
      let tokenToUse = stored;
      if (stored) {
        const valid = await validateToken(stored);
        if (!valid) {
          tokenToUse = storedRefresh ? await refreshAccessToken(storedRefresh) : null;
          if (tokenToUse) await storage.secureSet(TOKEN_KEY, tokenToUse);
        }
      } else if (storedRefresh) {
        tokenToUse = await refreshAccessToken(storedRefresh);
        if (tokenToUse) await storage.secureSet(TOKEN_KEY, tokenToUse);
      }
      if (!tokenToUse) {
        await storage.secureRemove(TOKEN_KEY);
        await storage.secureRemove(REFRESH_KEY);
        return;
      }
      setUserEmail(email ?? "");
      setToken(tokenToUse);

      // ── Cache laden: direkt Kategorien zeigen, kein Scan-Screen ──
      try {
        const cachedCatsStr = await storage.getItem(CATS_CACHE_KEY, null as string | null);
        const cachedTotal = await storage.getItem(TOTAL_CACHE_KEY, null as string | null);
        if (cachedCatsStr) {
          const cachedCats = JSON.parse(cachedCatsStr) as Partial<Record<CatKey, CatState>>;
          setCats(cachedCats);
          setScanTotal(parseInt(cachedTotal ?? "0", 10));
          setScreen("categories");
          // Stilles Refresh im Hintergrund — Zahlen aktualisieren ohne Scan-Screen
          runSilentRefresh(tokenToUse);
          return;
        }
      } catch {}

      // Kein Cache → erster Login → voller Scan-Screen
      await runScan(tokenToUse);
    })();
  }, []); // eslint-disable-line

  // Pulse + Radar-Ring Animationen starten wenn scan läuft
  useEffect(() => {
    if (screen !== "scanning") {
      r1s.value = 0.5; r1o.value = 0;
      r2s.value = 0.5; r2o.value = 0;
      r3s.value = 0.5; r3o.value = 0;
      return;
    }
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }), withTiming(1, { duration: 800 })),
      -1, true
    );
    // Radar-Ringe: 3 Wellen mit Versatz
    const RING_DUR = 2000;
    r1s.value = withRepeat(withTiming(2.2, { duration: RING_DUR, easing: Easing.out(Easing.quad) }), -1);
    r1o.value = withRepeat(withSequence(withTiming(0.5, { duration: RING_DUR * 0.1 }), withTiming(0, { duration: RING_DUR * 0.9 })), -1);
    r2s.value = withDelay(650, withRepeat(withTiming(2.2, { duration: RING_DUR, easing: Easing.out(Easing.quad) }), -1));
    r2o.value = withDelay(650, withRepeat(withSequence(withTiming(0.4, { duration: RING_DUR * 0.1 }), withTiming(0, { duration: RING_DUR * 0.9 })), -1));
    r3s.value = withDelay(1300, withRepeat(withTiming(2.2, { duration: RING_DUR, easing: Easing.out(Easing.quad) }), -1));
    r3o.value = withDelay(1300, withRepeat(withSequence(withTiming(0.3, { duration: RING_DUR * 0.1 }), withTiming(0, { duration: RING_DUR * 0.9 })), -1));
  }, [screen]); // eslint-disable-line

  const runScan = useCallback(async (accessToken: string) => {
    setScreen("scanning");
    const initial: ScanRow[] = CAT_CONFIG.map(c => ({ ...c, label: t(`email_screen.${c.labelKey}`), total: 0, unread: 0, status: "pending" as ScanStatus }));
    setScanRows(initial);
    setScanTotal(0);
    const finalCats: Partial<Record<CatKey, CatState>> = {};
    let runningTotal = 0;
    for (let i = 0; i < CAT_CONFIG.length; i++) {
      const cat = CAT_CONFIG[i];
      setScanRows(prev => prev.map(r => r.id === cat.id ? { ...r, status: "scanning" } : r));
      await new Promise(r => setTimeout(r, 200));
      const { total, unread } = await getLabelCount(accessToken, cat.id);
      setScanRows(prev => prev.map(r => r.id === cat.id ? { ...r, total, unread, status: "done" } : r));
      runningTotal += total;
      setScanTotal(runningTotal);
      finalCats[cat.id] = { total, unread, checked: total > 0, animated: total };
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 800));
    setCats(finalCats);
    setScanTotal(runningTotal);
    setScreen("categories");
    // Cache speichern
    try {
      await storage.setItem(CATS_CACHE_KEY, JSON.stringify(finalCats));
      await storage.setItem(TOTAL_CACHE_KEY, String(runningTotal));
    } catch {}
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [t]);

  // Stilles Refresh im Hintergrund (kein Scan-Screen)
  const runSilentRefresh = useCallback(async (accessToken: string) => {
    try {
      const finalCats: Partial<Record<CatKey, CatState>> = {};
      let runningTotal = 0;
      for (const cat of CAT_CONFIG) {
        const { total, unread } = await getLabelCount(accessToken, cat.id);
        finalCats[cat.id] = { total, unread, checked: total > 0, animated: total };
        runningTotal += total;
      }
      setCats(finalCats);
      setScanTotal(runningTotal);
      await storage.setItem(CATS_CACHE_KEY, JSON.stringify(finalCats));
      await storage.setItem(TOTAL_CACHE_KEY, String(runningTotal));
    } catch {}
  }, []);

  const handleLoginSuccess = useCallback(async (accessToken: string) => {
    setToken(accessToken);
    await storage.secureSet(TOKEN_KEY, accessToken);
    try {
      const ui = await fetch("https://www.googleapis.com/userinfo/v2/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json());
      setUserEmail(ui.email ?? "");
      await storage.secureSet(EMAIL_KEY, ui.email ?? "");
    } catch {}
    await runScan(accessToken);
  }, [runScan]);

  const handleGoogleSignIn = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    setLoginError(null);
    try {
      const verifier = generateVerifier();
      const state = Math.random().toString(36).slice(2);
      const params = new URLSearchParams({
        client_id: IOS_CLIENT_ID, redirect_uri: REDIRECT_URI,
        response_type: "code", scope: GMAIL_SCOPES, state,
        code_challenge: verifier, code_challenge_method: "plain",
        access_type: "offline", prompt: "select_account",
      });
      const result = await WebBrowser.openAuthSessionAsync(`${GOOGLE_AUTH}?${params}`, REDIRECT_URI);
      if (result.type !== "success") { setSigningIn(false); return; }
      const codeMatch = result.url.match(/[?&]code=([^&]+)/);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
      if (!code) { setLoginError(t("email_screen.login_error_no_code")); setSigningIn(false); return; }
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: IOS_CLIENT_ID, redirect_uri: REDIRECT_URI, grant_type: "authorization_code", code_verifier: verifier }).toString(),
      });
      const tokenData = await tokenResp.json();
      if (!tokenData.access_token) throw new Error(tokenData.error_description ?? t("email_screen.login_error_token_failed"));
      if (tokenData.refresh_token) await storage.secureSet(REFRESH_KEY, tokenData.refresh_token);
      await handleLoginSuccess(tokenData.access_token);
    } catch (e: any) {
      setScreen("login"); setLoginError(e?.message ?? t("email_screen.login_error_generic"));
    } finally { setSigningIn(false); }
  }, [signingIn, handleLoginSuccess, t]);

  const handleSignOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.secureRemove(REFRESH_KEY);
    await storage.secureRemove(EMAIL_KEY);
    setToken(null); setUserEmail(""); setCats({}); setScanRows([]); setScanTotal(0);
    setFilterState(DEFAULT_FILTER);
    setScreen("login"); setLoginError(null);
  }, []);

  const handleCatTap = useCallback(async (catId: CatKey) => {
    if (!token) return;
    setActiveCat(catId);
    setScreen("emailList");
    setLoadingEmails(true);
    setEmails([]);
    setEmailPageToken(undefined);
    // Für Soziale Medien: IMMER Domain-Query nutzen (Label ist bei den meisten Accounts leer)
    const queryOverride = CAT_FETCH_QUERY[catId]; // undefined für andere Kategorien
    const result = await fetchMessages(token, catId, undefined, queryOverride);
    setEmails(result.emails);
    setEmailPageToken(result.nextPageToken);
    setLoadingEmails(false);
  }, [token]);

  const openEmailView = useCallback(async (email: EmailMsg) => {
    if (!token) return;
    setViewingEmail(email);
    setEmailBodyHtml(null);
    setEmailBodyText(null);
    setEmailDate(null);
    setLoadingBody(true);
    setScreen("emailView");
    try {
      const d = await gGet(`/messages/${email.id}?format=full&fields=payload,internalDate`, token);
      if (d.internalDate) {
        const date = new Date(parseInt(d.internalDate));
        setEmailDate(date.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      }
      const { html, text } = extractBody(d.payload);
      setEmailBodyHtml(html);
      setEmailBodyText(text);
    } catch {}
    setLoadingBody(false);
  }, [token]);

  const toggleEmail = useCallback((id: string) => {
    setSelectedEmailIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!emailPageToken || loadingMore || !token || !activeCat) return;
    setLoadingMore(true);
    const queryOverride = CAT_FETCH_QUERY[activeCat]; // IMMER Domain-Query für Social
    const result = await fetchMessages(token, activeCat, emailPageToken, queryOverride);
    setEmails(prev => [...prev, ...result.emails]);
    setEmailPageToken(result.nextPageToken);
    setLoadingMore(false);
  }, [emailPageToken, loadingMore, token, activeCat]);

  const toggleCat = useCallback((catId: CatKey) => {
    setCats(p => ({ ...p, [catId]: { ...p[catId]!, checked: !p[catId]?.checked } }));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const openUnsubscribe = useCallback(async () => {
    if (!token) return;
    setScreen("unsubscribe");
    setLoadingUnsubs(true);
    setUnsubs([]);
    setUnsubProgress({ scanned: 0, found: 0, total: 0 });
    const senders = await fetchUnsubscribers(token, (scanned, found, total) => {
      setUnsubProgress({ scanned, found, total });
    });
    setUnsubs(senders);
    setLoadingUnsubs(false);
  }, [token]);

  const handleUnsub = useCallback(async (sender: UnsubSender) => {
    if (!token) return;
    setUnsubProcessing(sender.domain);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await archiveMessages(token, sender.messageIds);
      setUnsubs(p => p.filter(s => s.domain !== sender.domain));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (sender.unsubUrl) await WebBrowser.openBrowserAsync(sender.unsubUrl);
    } finally {
      setUnsubProcessing(null);
    }
  }, [token]);
  const totalChecked = CAT_CONFIG.reduce((sum, c) => sum + (cats[c.id]?.checked ? (cats[c.id]?.total ?? 0) : 0), 0);
  const filterActive = isFilterActive(filterState);

  // ── SCANNING SCREEN ─────────────────────────────────────────
  if (screen === "scanning") {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Text style={s.title}>{t("email_screen.title")}</Text>
        </View>

        {/* Hero-Bereich: Radar + Counter */}
        <View style={ss.heroArea}>
          <View style={ss.radarWrap}>
            {/* Radar-Ringe */}
            <Animated.View style={[ss.radarRing, ring3Style]} />
            <Animated.View style={[ss.radarRing, ring2Style]} />
            <Animated.View style={[ss.radarRing, ring1Style]} />
            {/* Center Circle mit Pulse */}
            <Animated.View style={[ss.centerPulse, pulseStyle]}>
              <View style={ss.centerCircle}>
                <Ionicons name="mail" size={44} color="#007AFF" />
              </View>
            </Animated.View>
          </View>

          {/* Live-Zähler */}
          {scanTotal > 0 ? (
            <Text style={ss.liveCounter}>{nf(scanTotal)}</Text>
          ) : (
            <View style={{ height: 48 }} />
          )}
          <Text style={ss.liveLabel}>{t("email_screen.scanning_title")}</Text>
          <Text style={ss.liveSub}>{t("email_screen.scanning_subtitle")}</Text>
        </View>

        {/* Kategorie-Zeilen */}
        <View style={ss.rowsWrap}>
          {scanRows.map(row => <ScanRowItem key={row.id} row={row} />)}
        </View>
      </View>
    );
  }

  // ── EMAIL LIST ───────────────────────────────────────────────
  if (screen === "emailList" && activeCat) {
    const catInfo = CAT_CONFIG.find(c => c.id === activeCat)!;
    const catTotal = cats[activeCat]?.total ?? 0;
    const avatarColors = ["#007AFF","#FF9500","#34C759","#AF52DE","#FF3B30","#5AC8FA"];
    const allSelected = emails.length > 0 && emails.every(e => selectedEmailIds.has(e.id));

    const doDeleteAll = async () => {
      setShowDeleteConfirm(null);
      setDeletingEmails(true);
      await trashAllInLabel(token!, activeCat, filterState);
      setCats(prev => ({ ...prev, [activeCat]: { ...prev[activeCat]!, total: 0, unread: 0, animated: 0 } }));
      setScanTotal(prev => Math.max(0, prev - catTotal));
      setDeletingEmails(false); setEmails([]); setSelectedEmailIds(new Set());
      setScreen("categories");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };

    const doDeleteSelected = async () => {
      setShowDeleteConfirm(null);
      if (selectedEmailIds.size === 0) return;
      setDeletingEmails(true);
      const ids = [...selectedEmailIds];
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        await fetch(`${GMAIL_BASE}/messages/batchModify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ids: chunk, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
        });
      }
      setEmails(prev => prev.filter(e => !selectedEmailIds.has(e.id)));
      setSelectedEmailIds(new Set());
      setCats(prev => ({ ...prev, [activeCat]: { ...prev[activeCat]!, total: Math.max(0, (prev[activeCat]?.total ?? 0) - ids.length) } }));
      setDeletingEmails(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };


    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.listHeader}>
          <Pressable testID="email-list-back" onPress={() => { setScreen("categories"); setSelectedEmailIds(new Set()); }} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
            <Text style={s.backText}>{t("common.back")}</Text>
          </Pressable>
          <Text style={s.listTitle}>{t(`email_screen.${catInfo.labelKey}`)}</Text>
          {/* Alle auswählen */}
          <TouchableOpacity
            testID="select-all-btn"
            onPress={() => {
              if (allSelected) setSelectedEmailIds(new Set());
              else setSelectedEmailIds(new Set(emails.map(e => e.id)));
            }}
            style={s.selectAllBtn}
            hitSlop={8}
          >
            <Ionicons name={allSelected ? "checkmark-circle" : "checkmark-circle-outline"} size={16} color="#007AFF" />
            <Text style={s.selectAllText}>{t("common.select_all")}</Text>
          </TouchableOpacity>
        </View>

        {filterActive && (
          <View style={s.filterBanner}>
            <Ionicons name="options" size={13} color="#007AFF" />
            <Text style={s.filterBannerText}>{t("email_screen.filter_active_banner")}</Text>
          </View>
        )}

        {(loadingEmails || deletingEmails) ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={s.loadingText}>{deletingEmails ? t("email_screen.deleting_status") : t("email_screen.loading_emails")}</Text>
          </View>
        ) : (
          <FlatList
            data={emails}
            keyExtractor={m => m.id}
            contentContainerStyle={emails.length === 0 ? s.centered : { paddingBottom: 130 }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              catTotal > emails.length && !loadingEmails && catTotal > 0 ? (
                <View style={s.listHint}>
                  <Text style={s.listHintText}>
                    {t("email_screen.loaded_of_total", { loaded: emails.length, total: fmt(catTotal) })}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loadingMore ? (
                <View style={s.moreLoader}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={s.moreLoaderText}>{t("email_screen.loading_more")}</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Ionicons name="checkmark-circle" size={56} color="#34C759" />
                <Text style={s.emptyTitle}>{t("email_screen.all_clean_title")}</Text>
                <Text style={s.emptySubtext}>{t("email_screen.all_clean_sub")}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const { name, initial } = parseSender(item.from);
              const c = avatarColors[initial.charCodeAt(0) % avatarColors.length];
              const selected = selectedEmailIds.has(item.id);
              return (
                <TouchableOpacity
                  testID={`email-row-${item.id}`}
                  style={[s.emailRow, selected && s.emailRowSelected]}
                  onPress={() => openEmailView(item)}
                  activeOpacity={0.7}
                >
                  {/* Checkbox — separate Touch-Zone zum Auswählen */}
                  <TouchableOpacity
                    testID={`email-check-${item.id}`}
                    style={[s.emailCheckbox, selected && s.emailCheckboxOn]}
                    onPress={() => toggleEmail(item.id)}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                    activeOpacity={0.7}
                  >
                    {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </TouchableOpacity>
                  {/* Avatar */}
                  <View style={[s.avatar, { backgroundColor: c }]}>
                    <Text style={s.avatarLetter}>{initial}</Text>
                  </View>
                  {/* Content — 2 Zeilen wie beim Konkurrent */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.emailFrom} numberOfLines={1}>{name}</Text>
                    <Text style={s.emailSubject} numberOfLines={1}>{item.subject}</Text>
                    {!!item.snippet && (
                      <Text style={s.emailSnippet} numberOfLines={1}>{item.snippet}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Delete Bar — zeigt entweder ausgewählte oder alle */}
        {!loadingEmails && !deletingEmails && (emails.length > 0 || catTotal > 0) && (
          <View style={[s.deleteBar, { paddingBottom: insets.bottom + 12 }]}>
            {selectedEmailIds.size > 0 ? (
              <Pressable testID="delete-selected-btn" style={s.deleteBtn}
                onPress={() => setShowDeleteConfirm("selected")}>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={s.deleteBtnText}>
                  {t("email_screen.delete_selected", { count: selectedEmailIds.size })}
                </Text>
              </Pressable>
            ) : catTotal > 0 ? (
              <Pressable testID="delete-all-btn" style={s.deleteBtn}
                onPress={() => setShowDeleteConfirm("bulk")}>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={s.deleteBtnText}>
                  {t("email_screen.delete_all_btn", { total: fmt(catTotal) })}{filterActive ? t("email_screen.filtered_suffix") : ""}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Delete Confirmation Bottom Sheet */}
        {showDeleteConfirm !== null && (
          <View style={s.confirmOverlay}>
            <Pressable style={s.confirmDismiss} onPress={() => setShowDeleteConfirm(null)} />
            <View style={[s.confirmSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.confirmHandle} />
              <Ionicons name="trash" size={32} color="#FF3B30" style={{ alignSelf: "center", marginBottom: 8 }} />
              <Text style={s.confirmTitle}>
                {showDeleteConfirm === "bulk"
                  ? t("email_screen.confirm_delete_bulk_title", { total: fmt(catTotal) })
                  : t("email_screen.confirm_delete_selected", { count: selectedEmailIds.size })}
              </Text>
              <Text style={s.confirmSubtext}>
                {t("email_screen.confirm_delete_subtext")}
              </Text>
              <View style={s.confirmBtns}>
                <TouchableOpacity testID="confirm-cancel-btn" style={s.confirmCancelBtn}
                  onPress={() => setShowDeleteConfirm(null)}>
                  <Text style={s.confirmCancelText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="confirm-delete-btn" style={s.confirmDeleteBtn}
                  onPress={showDeleteConfirm === "bulk" ? doDeleteAll : doDeleteSelected}>
                  <Text style={s.confirmDeleteText}>{t("common.delete")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── UNSUBSCRIBE SCREEN ───────────────────────────────────────
  if (screen === "unsubscribe") {
    // totalEmails jetzt inline berechnet im Header
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.listHeader}>
          <Pressable testID="unsub-back" onPress={() => setScreen("categories")} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
            <Text style={s.backText}>{t("common.back")}</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={s.listTitle}>{t("email_screen.unsub_screen_title")}</Text>
            {loadingUnsubs ? (
              <Text style={s.unsubProgressText}>
                {t("email_screen.unsub_scanning_progress", {
                  scanned: nf(unsubProgress.scanned),
                  total: unsubProgress.total > 0 ? nf(unsubProgress.total) : "…",
                })}
              </Text>
            ) : unsubs.length > 0 ? (
              <Text style={s.unsubProgressText}>
                {t("email_screen.unsub_found_summary", {
                  count: nf(unsubs.reduce((s, u) => s + u.count, 0)),
                  senders: unsubs.length,
                })}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 70 }} />
        </View>

        {loadingUnsubs && unsubs.length === 0 ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={s.loadingText}>{t("email_screen.unsub_searching")}</Text>
            {unsubProgress.scanned > 0 && (
              <Text style={s.unsubScanText}>
                {t("email_screen.unsub_scan_progress", { scanned: unsubProgress.scanned, found: unsubProgress.found })}
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={unsubs}
            keyExtractor={u => u.domain}
            contentContainerStyle={unsubs.length === 0 ? s.centered : { paddingBottom: insets.bottom + 20 }}
            ListHeaderComponent={
              loadingUnsubs ? (
                <View style={s.unsubScanningBanner}>
                  <ActivityIndicator size="small" color="#007AFF" />
                  <Text style={s.unsubScanningText}>
                    {t("email_screen.unsub_scanning_banner", { scanned: unsubProgress.scanned })}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              !loadingUnsubs ? (
                <View style={s.emptyBox}>
                  <Ionicons name="checkmark-circle" size={56} color="#34C759" />
                  <Text style={s.emptyTitle}>{t("email_screen.unsub_none_found_title")}</Text>
                  <Text style={s.emptySubtext}>
                    {unsubProgress.total > 0
                      ? t("email_screen.unsub_none_in_total", { total: nf(unsubProgress.total) })
                      : t("email_screen.unsub_none_found_sub")}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <UnsubCard item={item} processing={unsubProcessing === item.domain} onUnsub={() => handleUnsub(item)} onKeep={() => {
                setUnsubs(p => p.filter(s => s.domain !== item.domain));
              }} />
            )}
          />
        )}
      </View>
    );
  }

  // ── CATEGORIES ───────────────────────────────────────────────
  if (screen === "categories") {
    const initial = userEmail?.charAt(0)?.toUpperCase() ?? "?";
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header with filter button */}
        <View style={s.catHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t("email_screen.title")}</Text>
            <Text style={s.catHeaderSub}>
              {t("email_screen.subtitle")}
            </Text>
          </View>
          <View style={s.catHeaderRight}>
            <TouchableOpacity
              testID="filter-open-btn"
              onPress={() => setShowFilterModal(true)}
              style={s.filterBtn}
              hitSlop={8}
            >
              <Ionicons name="options-outline" size={24} color={filterActive ? "#007AFF" : "#1C1C1E"} />
              {filterActive && <View style={s.filterDot} />}
            </TouchableOpacity>
            <TouchableOpacity testID="signout-btn" onPress={handleSignOut} style={s.signOutBtn} hitSlop={8}>
              <Ionicons name="log-out-outline" size={20} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => token && runScan(token)}
              tintColor="#007AFF"
              title={t("email_screen.scanning_title")}
              titleColor="#8E8E93"
            />
          }
        >

          <View style={s.userCard}>
            <View style={s.userAvatar}><Text style={s.userAvatarLetter}>{initial}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.userEmailText} numberOfLines={1}>{userEmail || t("email_screen.google_account_fallback")}</Text>
              <Text style={s.userSubText}>{t("email_screen.connected_status", { count: fmt(scanTotal) })}</Text>
            </View>
            <Pressable onPress={() => runScan(token!)} testID="rescan-btn" style={s.rescanBtn}>
              <Ionicons name="refresh" size={16} color="#007AFF" />
            </Pressable>
          </View>

          <View style={s.catList}>
            {CAT_CONFIG.map((cat, idx) => {
              const state = cats[cat.id];
              const checked = state?.checked ?? false;
              return (
                <Pressable key={cat.id} testID={`cat-row-${cat.id}`}
                  style={({ pressed }) => [s.catRow, pressed && { backgroundColor: "#F5F5F5" }]}
                  onPress={() => handleCatTap(cat.id)}>
                  <Pressable testID={`cat-check-${cat.id}`} style={[s.checkbox, checked && s.checkboxOn]}
                    onPress={() => toggleCat(cat.id)} hitSlop={8}>
                    {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </Pressable>
                  <View style={[s.catIcon, { backgroundColor: `${cat.color}18` }]}>
                    <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.catLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t(`email_screen.${cat.labelKey}`)}</Text>
                    <Text style={s.catCount} numberOfLines={1}>{fmt(state?.total ?? 0)}</Text>
                  </View>
                  {(state?.unread ?? 0) > 0 && (
                    <View style={s.unreadBadge}>
                      <Text style={s.unreadText}>{t("email_screen.unread_badge", { count: nf(state!.unread) })}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                  {idx < CAT_CONFIG.length - 1 && <View style={s.sep} />}
                </Pressable>
              );
            })}
          </View>

          <Pressable testID="unsub-section" style={s.unsubCard} onPress={openUnsubscribe}>
            <View style={s.unsubIcon}><Ionicons name="mail-unread" size={22} color="#FF3B30" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.unsubTitle}>{t("email_screen.unsub_title")}</Text>
              <Text style={s.unsubCountText}>{t("email_screen.unsub_subtitle")}</Text>
            </View>
            <View style={s.unsubBtn}>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </View>
          </Pressable>

          {totalChecked > 0 && (
            <Pressable testID="clean-selected-btn" style={[s.cleanBtn, cleaningCats && { opacity: 0.7 }]}
              disabled={cleaningCats}
              onPress={() => setShowCleanConfirm(true)}>
              {cleaningCats ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash-outline" size={18} color="#fff" />}
              <Text style={s.cleanBtnText}>
                {cleaningCats ? t("email_screen.deleting_status") : (
                  <>{t("email_screen.clean_btn", { total: fmt(totalChecked) })}{filterActive ? t("email_screen.filtered_suffix") : ""}</>
                )}
              </Text>
            </Pressable>
          )}
        </ScrollView>

        <FilterModal
          visible={showFilterModal}
          filter={filterState}
          onApply={setFilterState}
          onClose={() => setShowFilterModal(false)}
        />

        {/* Bestätigung: Ausgewählte Kategorien bereinigen */}
        {showCleanConfirm && (
          <View style={s.confirmOverlay}>
            <Pressable style={s.confirmDismiss} onPress={() => setShowCleanConfirm(false)} />
            <View style={[s.confirmSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.confirmHandle} />
              <Ionicons name="trash" size={32} color="#FF3B30" style={{ alignSelf: "center", marginBottom: 8 }} />
              <Text style={s.confirmTitle}>
                {t("email_screen.confirm_delete_bulk_title", { total: fmt(totalChecked) })}
              </Text>
              <Text style={s.confirmSubtext}>
                {t("email_screen.confirm_delete_subtext")}
              </Text>
              <View style={s.confirmBtns}>
                <TouchableOpacity testID="clean-confirm-cancel-btn" style={s.confirmCancelBtn}
                  onPress={() => setShowCleanConfirm(false)}>
                  <Text style={s.confirmCancelText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="clean-confirm-delete-btn" style={s.confirmDeleteBtn}
                  onPress={async () => {
                    setShowCleanConfirm(false);
                    setCleaningCats(true);
                    try {
                      const checkedCats = CAT_CONFIG.filter(c => cats[c.id]?.checked);
                      for (const cat of checkedCats) {
                        await trashAllInLabel(token!, cat.id, filterState);
                        setCats(prev => ({ ...prev, [cat.id]: { ...prev[cat.id]!, total: 0, unread: 0, animated: 0 } }));
                      }
                      setScanTotal(prev => Math.max(0, prev - totalChecked));
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    } finally {
                      setCleaningCats(false);
                    }
                  }}>
                  <Text style={s.confirmDeleteText}>{t("common.delete")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── EMAIL VIEW SCREEN ────────────────────────────────────────
  if (screen === "emailView" && viewingEmail) {
    const { name, initial } = parseSender(viewingEmail.from);
    const avatarColors = ["#007AFF","#FF9500","#34C759","#AF52DE","#FF3B30","#5AC8FA"];
    const avatarColor = avatarColors[initial.charCodeAt(0) % avatarColors.length];
    const isSelected = selectedEmailIds.has(viewingEmail.id);

    // HTML für WebView aufbereiten
    let wrappedHtml: string | null = null;
    if (emailBodyHtml) {
      wrappedHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3,user-scalable=yes"><style>*{box-sizing:border-box;}body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1C1C1E;}img{max-width:100%;height:auto;}a{color:#007AFF;}table{max-width:100%;overflow:hidden;}</style></head><body>${emailBodyHtml}</body></html>`;
    } else if (emailBodyText) {
      const escaped = emailBodyText.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
      wrappedHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><style>body{margin:0;padding:16px;font-family:-apple-system,sans-serif;font-size:15px;line-height:1.7;color:#1C1C1E;white-space:pre-wrap;word-wrap:break-word;}</style></head><body>${escaped}</body></html>`;
    }

    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.listHeader}>
          <Pressable testID="email-view-back" onPress={() => setScreen("emailList")} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
            <Text style={s.backText}>Zurück</Text>
          </Pressable>
          <Text style={s.listTitle} numberOfLines={1}>E-Mail</Text>
          <View style={{ width: 70 }} />
        </View>

        {/* Absender + Datum */}
        <View style={ev.metaRow}>
          <View style={[ev.senderAvatar, { backgroundColor: avatarColor }]}>
            <Text style={ev.senderInitial}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ev.senderName} numberOfLines={1}>{name}</Text>
            <Text style={ev.senderEmail} numberOfLines={1}>{viewingEmail.from}</Text>
          </View>
          {emailDate ? <Text style={ev.dateText}>{emailDate}</Text> : null}
        </View>

        {/* Betreff */}
        <View style={ev.subjectRow}>
          <Text style={ev.subjectText}>{viewingEmail.subject}</Text>
        </View>

        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.08)" }} />

        {/* Body */}
        <View style={{ flex: 1 }}>
          {loadingBody ? (
            <View style={s.centered}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={s.loadingText}>Wird geladen…</Text>
            </View>
          ) : wrappedHtml ? (
            <WebView
              testID="email-webview"
              source={{ html: wrappedHtml }}
              style={{ flex: 1 }}
              scrollEnabled
              startInLoadingState
              renderLoading={() => (
                <View style={[s.centered, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }]}>
                  <ActivityIndicator size="large" color="#007AFF" />
                </View>
              )}
              javaScriptEnabled={false}
              originWhitelist={["*"]}
            />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={ev.snippetFallback}>{viewingEmail.snippet || "Kein Inhalt verfügbar."}</Text>
            </ScrollView>
          )}
        </View>

        {/* Bottom Action Bar */}
        <View style={[ev.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            testID="email-view-mark-btn"
            style={[ev.markBtn, isSelected && ev.markBtnActive]}
            onPress={() => {
              toggleEmail(viewingEmail.id);
              Haptics.selectionAsync().catch(() => {});
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isSelected ? "checkmark-circle" : "checkmark-circle-outline"}
              size={20}
              color={isSelected ? "#fff" : "#007AFF"}
            />
            <Text style={[ev.markBtnText, isSelected && ev.markBtnTextActive]}>
              {isSelected ? "Markiert ✓" : "Zum Löschen markieren"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="email-view-trash-btn"
            style={ev.trashBtn}
            onPress={() => {
              // Direkt löschen: ID markieren + Bestätigung
              setSelectedEmailIds(prev => {
                const next = new Set(prev);
                next.add(viewingEmail.id);
                return next;
              });
              setScreen("emailList");
              setShowDeleteConfirm("selected");
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="trash" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── LOGIN SCREEN ─────────────────────────────────────────────
  const demoCount = DEMO_COUNTS[demoIdx];
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.loginHeader}><Text style={s.title}>{t("email_screen.title")}</Text></View>
      <ScrollView contentContainerStyle={s.loginScroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={s.heroWrap}>
          <View style={s.envCard}>
            <Ionicons name="mail" size={64} color="#007AFF" />
            <Animated.View style={[s.badge, badgeStyle]}>
              <Text style={s.badgeNum}>{nf(demoCount)}</Text>
            </Animated.View>
          </View>
        </View>
        <Text style={s.heroTitle}>{t("email_screen.hero_title")}</Text>
        <Text style={s.heroSubtitle}>{t("email_screen.hero_sub")}</Text>
        <View style={s.featuresBox}>
          {[
            { icon: "scan", text: t("email_screen.feature_scan"), color: "#007AFF" },
            { icon: "pricetag", text: t("email_screen.feature_promo"), color: "#FF9500" },
            { icon: "mail-unread", text: t("email_screen.feature_unsub"), color: "#FF3B30" },
            { icon: "shield-checkmark", text: t("email_screen.feature_private"), color: "#34C759" },
          ].map(f => (
            <View key={f.icon} style={s.featureRow}>
              <View style={[s.featureIcon, { backgroundColor: `${f.color}18` }]}>
                <Ionicons name={f.icon as any} size={16} color={f.color} />
              </View>
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}
        </View>
        {loginError && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#FF3B30" />
            <Text style={s.errorText}>{loginError}</Text>
          </View>
        )}
      </ScrollView>
      <View style={[s.loginBottom, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable testID="google-signin-btn" onPress={handleGoogleSignIn} disabled={signingIn}
          style={({ pressed }) => [s.googleBtn, (pressed || signingIn) && s.googleBtnPressed]}>
          {signingIn ? <ActivityIndicator size="small" color="#5F6368" /> : <GoogleG size={22} />}
          <Text style={s.googleBtnText}>{signingIn ? t("email_screen.signing_in") : t("email_screen.google_signin_btn")}</Text>
        </Pressable>
        <View style={s.secureRow}>
          <Ionicons name="lock-closed" size={12} color="#34C759" />
          <Text style={s.secureText}>{t("email_screen.secure_text")}</Text>
        </View>
      </View>
    </View>
  );
}

// ── App Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { fontSize: 32, fontWeight: "900", color: "#000", letterSpacing: -0.5 },

  scanCenter: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  scanPulse: { alignSelf: "center", marginBottom: 16 },
  scanCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
  scanningTitle: { fontSize: 20, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 4 },
  scanningSubtitle: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 24 },
  scanRowsWrap: { gap: 2 },
  scanRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#F9F9F9", borderRadius: 12, marginBottom: 6 },
  scanIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  scanLabel: { fontSize: 15, fontWeight: "600", color: "#000" },
  scanCount: { fontSize: 13, color: "#34C759", fontWeight: "600", marginTop: 1 },
  scanCountPending: { fontSize: 13, color: "#8E8E93", marginTop: 1 },
  scanTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#EEF6FF", borderRadius: 12 },
  scanTotalLabel: { fontSize: 14, color: "#8E8E93", fontWeight: "500" },
  scanTotalCount: { fontSize: 17, fontWeight: "800", color: "#007AFF" },

  catHeader: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  catHeaderSub: { fontSize: 12, color: "#8E8E93", lineHeight: 17, marginTop: 3, maxWidth: 260 },
  catHeaderRight: { flexDirection: "row", alignItems: "center", gap: 0, paddingTop: 4 },
  filterBtn: { padding: 8, position: "relative" },
  filterDot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#FF3B30", borderWidth: 1.5, borderColor: "#fff" },
  signOutBtn: { padding: 8 },
  filterBanner: { flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#EEF6FF", borderRadius: 8, alignSelf: "flex-start" },
  filterBannerText: { fontSize: 12, color: "#007AFF", fontWeight: "600" },

  userCard: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 18, backgroundColor: "#F9F9F9", borderRadius: 20 },
  userAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center" },
  userAvatarLetter: { fontSize: 22, fontWeight: "800", color: "#fff" },
  userEmailText: { fontSize: 15, fontWeight: "600", color: "#000" },
  userSubText: { fontSize: 12, color: "#34C759", fontWeight: "600", marginTop: 3 },
  rescanBtn: { padding: 10, borderRadius: 22, backgroundColor: "#EEF6FF" },

  catList: { marginHorizontal: 16, borderRadius: 20, overflow: "hidden", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  catRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 18, gap: 14, backgroundColor: "#fff", position: "relative" },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: "#C7C7CC", alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  catIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 16, fontWeight: "700", color: "#000" },
  catCount: { fontSize: 14, color: "#8E8E93", marginTop: 3 },
  unreadBadge: { backgroundColor: "#FF3B3018", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 4 },
  unreadText: { fontSize: 11, color: "#FF3B30", fontWeight: "700" },
  sep: { position: "absolute", bottom: 0, left: 80, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.07)" },
  unsubCard: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 16, padding: 20, backgroundColor: "#FFF0EF", borderRadius: 20, marginBottom: 20 },
  unsubIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: "rgba(255,59,48,0.15)", alignItems: "center", justifyContent: "center" },
  unsubTitle: { fontSize: 16, fontWeight: "700", color: "#000" },
  unsubCountText: { fontSize: 13, color: "#8E8E93", marginTop: 2 },
  unsubBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center" },
  cleanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 16, height: 58, borderRadius: 18, backgroundColor: "#FF3B30", shadowColor: "#FF3B30", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  cleanBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  loginHeader: { paddingHorizontal: 16, paddingTop: 4 },
  loginScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  heroWrap: { alignItems: "center", marginBottom: 24, marginTop: 8 },
  envCard: { width: 140, height: 110, backgroundColor: "#EEF6FF", borderRadius: 28, alignItems: "center", justifyContent: "center", position: "relative", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  badge: { position: "absolute", top: -12, right: -12, minWidth: 52, height: 32, borderRadius: 16, backgroundColor: "#FF3B30", borderWidth: 2.5, borderColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeNum: { color: "#fff", fontSize: 12, fontWeight: "900" },
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#000", textAlign: "center", letterSpacing: -0.5, lineHeight: 32, marginBottom: 10 },
  heroSubtitle: { fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 20, marginBottom: 24 },
  featuresBox: { backgroundColor: "#F9F9F9", borderRadius: 16, padding: 16, gap: 12, marginBottom: 16 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 14, fontWeight: "500", color: "#1C1C1E", flex: 1 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF0EF", padding: 10, borderRadius: 10, marginBottom: 8 },
  errorText: { fontSize: 13, color: "#FF3B30", flex: 1 },
  loginBottom: { paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)", backgroundColor: "#fff" },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 14, height: 54, paddingHorizontal: 20, gap: 12, borderWidth: 1.5, borderColor: "#DADCE0", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  googleBtnPressed: { backgroundColor: "#F8F8F8", borderColor: "#C0C0C0" },
  googleBtnText: { color: "#3C4043", fontSize: 16, fontWeight: "600" },
  secureRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  secureText: { fontSize: 12, color: "#34C759", fontWeight: "500" },

  listHint: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#F0F0F0" },
  listHintText: { fontSize: 12, color: "#8E8E93", textAlign: "center" },
  moreLoader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  moreLoaderText: { fontSize: 13, color: "#8E8E93" },
  loadingText: { fontSize: 16, fontWeight: "600", color: "#000" },
  listHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  backBtn: { flexDirection: "row", alignItems: "center", padding: 4, width: 70 },
  backText: { fontSize: 16, color: "#007AFF" },
  listTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#000" },
  listCount: { fontSize: 13, color: "#8E8E93", width: 54, textAlign: "right", fontWeight: "500" },

  // Delete Confirmation Sheet
  confirmOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end" },
  confirmDismiss: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  confirmSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16 },
  confirmHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#E5E5EA", alignSelf: "center", marginBottom: 16 },
  confirmTitle: { fontSize: 20, fontWeight: "800", color: "#000", textAlign: "center", marginBottom: 6 },
  confirmSubtext: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 20 },
  confirmBtns: { flexDirection: "row", gap: 12 },
  confirmCancelBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" },
  confirmCancelText: { fontSize: 16, fontWeight: "600", color: "#3C3C43" },
  confirmDeleteBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center" },
  confirmDeleteText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  emailRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  emailRowSelected: { backgroundColor: "#EEF6FF" },
  emailCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#C7C7CC", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  emailCheckboxOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  selectAllBtn: { flexDirection: "row", alignItems: "center", gap: 3, padding: 4 },
  selectAllText: { fontSize: 13, color: "#007AFF", fontWeight: "600" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 18, fontWeight: "800", color: "#fff" },
  emailFrom: { fontSize: 15, fontWeight: "600", color: "#000", marginBottom: 2 },
  emailSubject: { fontSize: 13, color: "#3C3C43" },
  emailSnippet: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  emptyBox: { alignItems: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#000" },
  emptySubtext: { fontSize: 15, color: "#8E8E93", textAlign: "center" },
  deleteBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, backgroundColor: "#FF3B30" },
  deleteBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  unsubInfo: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#F9F9F9", marginBottom: 8 },
  unsubInfoText: { fontSize: 13, color: "#8E8E93", fontWeight: "500" },
  unsubRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  unsubActBtn: { backgroundColor: "#FF3B3018", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  unsubActText: { fontSize: 13, fontWeight: "700", color: "#FF3B30" },
  // Unsubscribe new styles
  unsubProgressText: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  unsubScanText: { fontSize: 13, color: "#8E8E93", marginTop: 8, textAlign: "center" },
  unsubScanningBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EEF6FF", paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8 },
  unsubScanningText: { fontSize: 13, color: "#007AFF", fontWeight: "500" },
});

// ── Filter Modal Styles ────────────────────────────────────────
const fm = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F2F2F7" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#F2F2F7" },
  closeBtn: { padding: 4 },
  closeCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E5E5EA", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#000", textAlign: "center" },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },

  sectionLabel: { fontSize: 12, fontWeight: "600", color: "#8E8E93", letterSpacing: 0.5, marginBottom: 8, marginTop: 20, paddingHorizontal: 4, textTransform: "uppercase" },

  card: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },

  radioRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  rowLabel: { fontSize: 16, color: "#000", flex: 1, lineHeight: 22 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#C7C7CC", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  radioSelected: { borderColor: "#007AFF" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#007AFF" },

  toggleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },

  kwChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  kwChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF6FF", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  kwChipText: { fontSize: 14, color: "#007AFF", fontWeight: "600" },

  kwInputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  kwInput: { flex: 1, fontSize: 16, color: "#000" },
  kwAddBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#007AFF", borderRadius: 10 },
  kwAddBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  kwAddRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#fff", borderRadius: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  kwAddText: { fontSize: 16, color: "#007AFF", fontWeight: "500" },

  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#F2F2F7", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  applyBtn: { backgroundColor: "#007AFF", height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  applyBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});


// ── UnsubCard Styles ───────────────────────────────────────────
const uc = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#fff", borderRadius: 18, padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  logo: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#F0F0F0" },
  logoFallback: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  logoInitial: { fontSize: 20, fontWeight: "800", color: "#fff" },
  name: { fontSize: 16, fontWeight: "700", color: "#000" },
  email: { fontSize: 12, color: "#8E8E93", marginTop: 2 },
  countBadge: { backgroundColor: "#EEF6FF", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  countText: { fontSize: 13, color: "#007AFF", fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 10 },
  keepBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  keepBtnText: { fontSize: 15, fontWeight: "600", color: "#3C4DBF" },
  unsubBtn: { flex: 1, height: 44, borderRadius: 12, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center" },
  unsubBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// ── Email View Styles ──────────────────────────────────────────
const ev = StyleSheet.create({
  metaRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  senderAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  senderInitial: { fontSize: 18, fontWeight: "800", color: "#fff" },
  senderName: { fontSize: 15, fontWeight: "700", color: "#000" },
  senderEmail: { fontSize: 12, color: "#8E8E93", marginTop: 1 },
  dateText: { fontSize: 11, color: "#8E8E93", flexShrink: 0, marginLeft: 4 },
  subjectRow: { paddingHorizontal: 16, paddingVertical: 12 },
  subjectText: { fontSize: 18, fontWeight: "800", color: "#000", lineHeight: 24, letterSpacing: -0.3 },
  snippetFallback: { fontSize: 15, color: "#3C3C43", lineHeight: 22 },
  bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  markBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, backgroundColor: "#EEF6FF", borderWidth: 1.5, borderColor: "#007AFF" },
  markBtnActive: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  markBtnText: { fontSize: 15, fontWeight: "700", color: "#007AFF" },
  markBtnTextActive: { color: "#fff" },
  trashBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center" },
});

// ── Scan Screen Styles ─────────────────────────────────────────
const ss = StyleSheet.create({
  heroArea: { alignItems: "center", paddingTop: 12, paddingBottom: 8 },
  radarWrap: { width: 220, height: 220, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  radarRing: {
    position: "absolute",
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 1.5, borderColor: "#007AFF",
  },
  centerPulse: { position: "absolute" },
  centerCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "#EEF6FF",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#007AFF", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 20, elevation: 8,
  },
  liveCounter: {
    fontSize: 48, fontWeight: "900", color: "#007AFF",
    letterSpacing: -2, lineHeight: 56, textAlign: "center",
  },
  liveLabel: { fontSize: 16, fontWeight: "700", color: "#000", marginTop: 4, textAlign: "center" },
  liveSub: { fontSize: 13, color: "#8E8E93", textAlign: "center", marginTop: 2, marginBottom: 16 },
  rowsWrap: { paddingHorizontal: 20, gap: 2 },
});
