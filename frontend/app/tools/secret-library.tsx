// Geheime Bibliothek — PIN/FaceID + Fotos via expo-media-library
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, TouchableOpacity,
  FlatList, ActivityIndicator, Platform, Dimensions, Modal, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { storage } from "@/src/utils/storage";
import { useTranslation } from "react-i18next";
import MediaViewerModal from "@/src/components/MediaViewerModal";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";

const FREE_SECRET_LIMIT = 3;

const PIN_STORAGE_KEY = "cleanu.secret_pin";
const ITEMS_STORAGE_KEY = "cleanu.secret_items";
const FACEID_KEY = "cleanu.secret_faceid_enabled";
const PIN_LENGTH = 4;
const SECRET_DIR = FileSystem.documentDirectory + "cleanu_secret/";

const { width } = Dimensions.get("window");
const COLS = 3;
const TILE = Math.floor((width - 16 * 2 - 4 * (COLS - 1)) / COLS);
const PICKER_COLS = 3;
const PICKER_TILE = Math.floor((width - 4 * (PICKER_COLS - 1)) / PICKER_COLS);

interface SecretItem { id: string; uri: string; type: "image" | "video"; addedAt: string; thumbnailUri?: string }

type Phase = "intro" | "create_pin" | "confirm_pin" | "locked" | "unlocked";

// Module-Level Cache — überlebt Component-Remount → kein Neu-Laden beim Zurückgehen
let _itemsCache: SecretItem[] | null = null;
function invalidateCache() { _itemsCache = null; }

// Thumbnails für Videos ohne thumbnailUri im Hintergrund generieren
async function generateMissingThumbnails(
  items: SecretItem[],
  onUpdate?: (updated: SecretItem[]) => void
) {
  if (Platform.OS === "web") return;
  const missing = items.filter(i => i.type === "video" && !i.thumbnailUri);
  if (missing.length === 0) return;
  let changed = false;
  const updated = [...items];
  for (const item of missing) {
    try {
      const { createVideoThumbnail } = require("react-native-compressor");
      const thumb = await createVideoThumbnail(item.uri, { quality: 0.5 });
      if (thumb?.path) {
        const idx = updated.findIndex(i => i.id === item.id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], thumbnailUri: thumb.path };
          changed = true;
        }
      }
    } catch {}
  }
  if (changed) {
    _itemsCache = updated;
    await saveItems(updated);
    onUpdate?.(updated);
  }
}

// ── Storage helpers ───────────────────────────────────────
async function ensureDir() {
  if (Platform.OS === "web") return;
  const info = await FileSystem.getInfoAsync(SECRET_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(SECRET_DIR, { intermediates: true });
}

// ── URI Remapping: Fix für stale URIs nach App-Update/Reinstall ──────────────
// iOS ändert die App-UUID im documentDirectory bei Reinstall.
// Stored URIs enthalten die alte UUID → Bilder unsichtbar.
// Fix: Alles nach "cleanu_secret/" extrahieren und mit aktuellem documentDirectory rekonstruieren.
function remapUri(storedUri: string | undefined): string | undefined {
  if (!storedUri) return undefined;
  const MARKER = "cleanu_secret/";
  const idx = storedUri.indexOf(MARKER);
  if (idx !== -1) {
    // Rekonstruiere: current documentDirectory + "cleanu_secret/" + filename
    return FileSystem.documentDirectory + storedUri.substring(idx);
  }
  return storedUri;
}

function remapItemUris(items: SecretItem[]): SecretItem[] {
  return items.map(item => ({
    ...item,
    uri: remapUri(item.uri) ?? item.uri,
    thumbnailUri: remapUri(item.thumbnailUri),
  }));
}

async function loadItems(): Promise<SecretItem[]> {
  if (Platform.OS === "web") return [];
  try {
    const raw = await storage.getItem<string>(ITEMS_STORAGE_KEY, "[]");
    const parsed = JSON.parse(raw ?? "[]") as SecretItem[];
    // Remappen: stale URIs (nach Reinstall/Update) auf aktuelle documentDirectory korrigieren
    const remapped = remapItemUris(parsed);
    // Wenn sich etwas geändert hat → persistieren damit nächstes Laden sofort korrekt ist
    const hasChanges = remapped.some((item, i) =>
      item.uri !== parsed[i]?.uri || item.thumbnailUri !== parsed[i]?.thumbnailUri
    );
    if (hasChanges && remapped.length > 0) {
      await storage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(remapped));
      console.log(`[SecretLibrary] Remapped ${remapped.length} item URIs after reinstall/update`);
    }
    return remapped;
  } catch { return []; }
}

async function saveItems(items: SecretItem[]) {
  _itemsCache = items;
  await storage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
}

// ── Validierung: Items mit fehlenden Dateien entfernen ─────────────────────
// Passiert bei echtem Reinstall (Sandbox geleert) — verhindert leere Tiles
async function validateItemsExistOnDisk(items: SecretItem[]): Promise<SecretItem[]> {
  if (Platform.OS === "web" || items.length === 0) return items;
  try {
    const dirFiles = await FileSystem.readDirectoryAsync(SECRET_DIR).catch(() => [] as string[]);
    const valid = items.filter(item => {
      const filename = item.uri.split("/").pop();
      return filename ? dirFiles.includes(filename) : false;
    });
    if (valid.length !== items.length) {
      console.log(`[SecretLibrary] Removed ${items.length - valid.length} stale items (files missing on disk)`);
      await saveItems(valid);
    }
    return valid;
  } catch { return items; }
}

// ── Recovery: Dateien aus SECRET_DIR wiederherstellen wenn AsyncStorage leer ──
// Nötig wenn migrateItems oder ein Bug die Liste gelöscht hat
async function recoverItemsFromDisk(): Promise<SecretItem[]> {
  if (Platform.OS === "web") return [];
  try {
    const files = await FileSystem.readDirectoryAsync(SECRET_DIR);
    const recovered: SecretItem[] = [];
    for (const filename of files) {
      // Thumbnails überspringen (_thumb.jpg)
      if (filename.includes("_thumb")) continue;
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const type: "image" | "video" = ["mp4", "mov", "m4v", "avi"].includes(ext) ? "video" : "image";
      const uri = `${SECRET_DIR}${filename}`;
      // Thumbnail suchen
      const id = filename.replace(/\.[^.]+$/, "");
      const thumbPath = `${SECRET_DIR}${id}_thumb.jpg`;
      let thumbnailUri: string | undefined;
      try {
        const tfiles = files.filter(f => f === `${id}_thumb.jpg`);
        if (tfiles.length > 0) thumbnailUri = thumbPath;
      } catch {}
      recovered.push({ id, uri, type, addedAt: new Date().toISOString(), thumbnailUri });
    }
    if (recovered.length > 0) {
      await saveItems(recovered);
      console.log(`Recovered ${recovered.length} items from disk`);
    }
    return recovered;
  } catch { return []; }
}

// ── HEIC → JPEG non-destructive (im Hintergrund, niemals Daten löschen) ───
async function migrateHeicToJpeg(items: SecretItem[], onUpdate: (items: SecretItem[]) => void) {
  if (Platform.OS === "web") return;
  const heicItems = items.filter(i => i.type === "image" && /\.heic$/i.test(i.uri));
  if (heicItems.length === 0) return;
  let updated = [...items];
  let changed = false;
  for (const item of heicItems) {
    try {
      const newUri = item.uri.replace(/\.heic$/i, ".jpg");
      const manip = await ImageManipulator.manipulateAsync(
        item.uri, [], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: manip.uri, to: newUri });
      try { await FileSystem.deleteAsync(manip.uri, { idempotent: true }); } catch {}
      // Original erst löschen wenn JPEG bestätigt existiert
      // Kein getInfoAsync (unzuverlässig) — stattdessen readDirectory
      const dir = await FileSystem.readDirectoryAsync(SECRET_DIR).catch(() => [] as string[]);
      const jpegName = newUri.split("/").pop() ?? "";
      if (dir.includes(jpegName)) {
        try { await FileSystem.deleteAsync(item.uri, { idempotent: true }); } catch {}
        const idx = updated.findIndex(i => i.id === item.id);
        if (idx >= 0) { updated[idx] = { ...updated[idx], uri: newUri }; changed = true; }
      }
    } catch { /* HEIC bleibt – besser als Datenverlust */ }
  }
  if (changed) { await saveItems(updated); onUpdate(updated); }
}

// ── Photo Picker Modal ────────────────────────────────────
function PhotoPickerModal({
  visible, onClose, onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (assets: MediaLibrary.Asset[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  useEffect(() => {
    if (!visible) { setSelected(new Set()); return; }
    (async () => {
      setLoading(true);
      try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) { setPermDenied(true); setLoading(false); return; }
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          first: 300,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]], // neueste zuerst
        });
        setAssets(result.assets);
      } catch (e) {
        console.warn("picker load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const toggle = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={[pm.root, { paddingTop: insets.top > 0 ? insets.top : 44 }]}>
        {/* Header */}
        <View style={pm.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8} testID="picker-cancel">
            <Text style={pm.cancelText}>{t("secret_library_screen.picker_cancel")}</Text>
          </TouchableOpacity>
          <Text style={pm.title}>{t("secret_library_screen.picker_title")}</Text>
          <TouchableOpacity
            onPress={() => { const picked = assets.filter(a => selected.has(a.id)); onAdd(picked); onClose(); }}
            disabled={selected.size === 0}
            style={[pm.addBtn, selected.size === 0 && { opacity: 0.4 }]}
            testID="picker-add"
          >
            <Text style={pm.addBtnText}>
              {selected.size > 0 ? t("secret_library_screen.picker_add_count", { count: selected.size }) : t("secret_library_screen.picker_add")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={pm.center}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ color: "#8E8E93", marginTop: 12, fontSize: 14 }}>{t("secret_library_screen.picker_loading")}</Text>
          </View>
        ) : permDenied ? (
          <View style={pm.center}>
            <Ionicons name="images-outline" size={48} color="#C7C7CC" />
            <Text style={pm.permTitle}>{t("secret_library_screen.picker_no_access_title")}</Text>
            <Text style={pm.permText}>{t("secret_library_screen.picker_no_access_sub")}</Text>
          </View>
        ) : assets.length === 0 ? (
          <View style={pm.center}>
            <Text style={pm.permTitle}>{t("secret_library_screen.picker_no_photos")}</Text>
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={a => a.id}
            numColumns={PICKER_COLS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            renderItem={({ item }) => {
              const sel = selected.has(item.id);
              return (
                <TouchableOpacity
                  onPress={() => toggle(item.id)}
                  activeOpacity={0.85}
                  style={{ width: PICKER_TILE, height: PICKER_TILE, margin: 1 }}
                  testID={`picker-asset-${item.id}`}
                >
                  <ExpoImage
                    source={{ uri: item.uri }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                  {item.mediaType === MediaLibrary.MediaType.video && (
                    <View style={pm.videoBadge}><Ionicons name="play" size={10} color="#fff" /></View>
                  )}
                  {sel && (
                    <View style={pm.selOverlay}>
                      <View style={pm.selCheck}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────
export default function SecretLibrary() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useApp();
  const rc = useRevenueCat();
  const isPremium = !!user?.is_premium || rc.isSubscribed;
  const [phase, setPhase] = useState<Phase>("intro");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [items, setItems] = useState<SecretItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addFeedback, setAddFeedback] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number>(-1);
  const [deleteCandidate, setDeleteCandidate] = useState<SecretItem | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [showResetSheet, setShowResetSheet] = useState(false);
  const [showFaceIdPrompt, setShowFaceIdPrompt] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);

  const checkExistingPin = useCallback(async () => {
    const existingPin = await storage.getItem<string>(PIN_STORAGE_KEY, "");
    const bio = await LocalAuthentication.hasHardwareAsync();
    const bioEnrolled = await LocalAuthentication.isEnrolledAsync();
    const faceEnabled = await storage.getItem<string>(FACEID_KEY, "false");
    setHasBiometrics(bio && bioEnrolled);
    setFaceIdEnabled(faceEnabled === "true");
    // Cache bei jedem Screen-Mount invalidieren → stellt sicher dass URI-Remap greift
    invalidateCache();
    setPhase(existingPin ? "locked" : "intro");
  }, []);

  useEffect(() => { checkExistingPin(); }, [checkExistingPin]);

  const loadSecretItems = useCallback(async () => {
    // Cache vorhanden → sofort anzeigen (aber trotzdem Validierung im Hintergrund)
    if (_itemsCache !== null) {
      setItems(_itemsCache);
      setLoading(false);
      generateMissingThumbnails(_itemsCache, setItems);
      return;
    }
    setLoading(true);
    try {
      await ensureDir();
      let stored = await loadItems(); // URIs werden hier bereits remappt

      // Recovery: wenn AsyncStorage leer ist aber Dateien auf Disk → wiederherstellen
      if (stored.length === 0) {
        stored = await recoverItemsFromDisk();
      } else {
        // Validierung: Items mit fehlenden Dateien entfernen (echter Reinstall-Schutz)
        stored = await validateItemsExistOnDisk(stored);
        // Falls nach Validierung alles weg → versuche Recovery von Disk
        if (stored.length === 0) {
          stored = await recoverItemsFromDisk();
        }
      }

      _itemsCache = stored;
      setItems(stored);

      // HEIC→JPEG im Hintergrund (non-destructive, kein Datenverlust)
      migrateHeicToJpeg(stored, (updated) => {
        _itemsCache = updated;
        setItems(updated);
      });
      generateMissingThumbnails(stored, setItems);
    } catch (e) {
      console.warn("loadSecretItems failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddAssets = useCallback(async (picked: MediaLibrary.Asset[]) => {
    if (picked.length === 0 || adding) return;

    // Freemium-Schutz: max FREE_SECRET_LIMIT Items für Free-Nutzer
    let allowedPicked = picked;
    if (!isPremium) {
      const slotsLeft = Math.max(0, FREE_SECRET_LIMIT - items.length);
      if (slotsLeft === 0) {
        router.push("/paywall" as any);
        return;
      }
      allowedPicked = picked.slice(0, slotsLeft);
    }

    setAdding(true);
    setAddFeedback("");
    let addedCount = 0;
    let failedCount = 0;
    let lastErrMsg = "";

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout (${label})`)), ms)
        ),
      ]);

    try {
      await ensureDir();
      const newItems: SecretItem[] = [];

      for (const asset of allowedPicked) {
        try {
          const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const type: "image" | "video" =
            asset.mediaType === MediaLibrary.MediaType.video ? "video" : "image";

          if (type === "image") {
            // ── Bild: direkt via ImageManipulator aus ph:// → JPEG ──
            // Kein getAssetInfoAsync nötig — ImageManipulator liest ph:// nativ
            const destUri = `${SECRET_DIR}${id}.jpg`;
            let converted = false;
            try {
              const result = await withTimeout(
                ImageManipulator.manipulateAsync(
                  asset.uri, [], { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
                ),
                20000, "manipulate"
              );
              await FileSystem.copyAsync({ from: result.uri, to: destUri });
              try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch {}
              converted = true;
            } catch {}

            if (!converted) {
              // Fallback: getAssetInfoAsync → localUri → direktes Kopieren
              try {
                const localId = asset.uri.startsWith("ph://") ? asset.uri.slice(5) : asset.id;
                const assetInfo = await withTimeout(
                  MediaLibrary.getAssetInfoAsync(localId as any, { shouldDownloadFromNetwork: true }),
                  25000, "getAssetInfo"
                );
                const srcUri = (assetInfo as any)?.localUri;
                if (srcUri) {
                  const origExt = srcUri.split(".").pop()?.toLowerCase() ?? "heic";
                  const fallbackUri = destUri.replace(/\.jpg$/, `.${origExt}`);
                  await FileSystem.copyAsync({ from: srcUri, to: fallbackUri });
                  // try JPEG-Konvertierung vom local path
                  try {
                    const r2 = await ImageManipulator.manipulateAsync(
                      fallbackUri, [], { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    await FileSystem.copyAsync({ from: r2.uri, to: destUri });
                    try { await FileSystem.deleteAsync(r2.uri, { idempotent: true }); } catch {}
                    try { await FileSystem.deleteAsync(fallbackUri, { idempotent: true }); } catch {}
                    converted = true;
                  } catch {
                    // Wenn JPEG-Konvertierung scheitert → Original behalten
                    const finalUri = fallbackUri;
                    const check2 = await FileSystem.getInfoAsync(finalUri);
                    if (check2.exists) {
                      newItems.push({ id, uri: finalUri, type, addedAt: new Date().toISOString() });
                      addedCount++;
                    } else { failedCount++; }
                    continue;
                  }
                } else { failedCount++; continue; }
              } catch { failedCount++; continue; }
            }

            const check = await FileSystem.getInfoAsync(destUri);
            if (!check.exists) { failedCount++; continue; }
            newItems.push({ id, uri: destUri, type, addedAt: new Date().toISOString() });
            addedCount++;
            continue;
          }

          // ── Video: getAssetInfoAsync → localUri ──
          let srcUri: string | undefined;
          if (Platform.OS !== "web") {
            const localId = asset.uri.startsWith("ph://") ? asset.uri.slice(5) : asset.id;
            const assetInfo = await withTimeout(
              MediaLibrary.getAssetInfoAsync(localId as any, { shouldDownloadFromNetwork: true }),
              25000, "getAssetInfo"
            );
            srcUri = (assetInfo as any)?.localUri;
            if (!srcUri) {
              const { Image: CI } = require("react-native-compressor");
              srcUri = await withTimeout(
                CI.compress(asset.uri, { compressionMethod: "manual", quality: 0.95, returnableOutputType: "uri" }),
                25000, "compress"
              );
            }
          }

          if (!srcUri) { failedCount++; continue; }

          const destExt = (asset.filename ?? "").split(".").pop()?.toLowerCase() ?? "mov";
          const destUri = `${SECRET_DIR}${id}.${destExt}`;
          await FileSystem.copyAsync({ from: srcUri, to: destUri });

          if (srcUri.includes("com.hackemist") || srcUri.includes("cache")) {
            try { await FileSystem.deleteAsync(srcUri, { idempotent: true }); } catch {}
          }

          const check = await FileSystem.getInfoAsync(destUri);
          if (!check.exists) { failedCount++; continue; }

          // Video-Thumbnail → permanent in SECRET_DIR speichern
          let thumbnailUri: string | undefined;
          if (Platform.OS !== "web") {
            try {
              const { createVideoThumbnail } = require("react-native-compressor");
              const thumb = await createVideoThumbnail(destUri, { quality: 0.6 });
              if (thumb?.path) {
                const thumbDest = `${SECRET_DIR}${id}_thumb.jpg`;
                await FileSystem.copyAsync({ from: thumb.path, to: thumbDest });
                try { await FileSystem.deleteAsync(thumb.path, { idempotent: true }); } catch {}
                thumbnailUri = thumbDest;
              }
            } catch (te) { console.warn("Thumbnail failed:", te); }
          }

          newItems.push({ id, uri: destUri, type, addedAt: new Date().toISOString(), thumbnailUri });
          addedCount++;
        } catch (err: any) {
          const msg = (err?.message ?? String(err) ?? "?").substring(0, 100);
          console.warn("Asset Fehler:", asset.id, msg);
          lastErrMsg = msg;
          failedCount++;
        }
      }

      if (newItems.length > 0) {
        const all = [...items, ...newItems];
        await saveItems(all);
        setItems(all);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setAddFeedback(t(addedCount === 1 ? "secret_library_screen.added_feedback_one" : "secret_library_screen.added_feedback_other", { count: addedCount }));
      } else if (failedCount > 0) {
        setAddFeedback(lastErrMsg || t("secret_library_screen.failed_feedback", { count: failedCount }));
      }
      setTimeout(() => setAddFeedback(""), 5000);
    } catch (e: any) {
      const msg = (e?.message ?? String(e) ?? "?").substring(0, 100);
      console.warn("handleAddAssets outer Fehler:", msg);
      setAddFeedback(t("secret_library_screen.error_feedback", { msg }));
      setTimeout(() => setAddFeedback(""), 5000);
    } finally {
      setAdding(false);
    }
  }, [adding, isPremium, items, router, t]);

  const handleDeleteItem = useCallback(async (item: SecretItem) => {
    const newItems = items.filter(i => i.id !== item.id);
    setItems(newItems);
    await saveItems(newItems);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await FileSystem.deleteAsync(item.uri, { idempotent: true });
      if (item.thumbnailUri) await FileSystem.deleteAsync(item.thumbnailUri, { idempotent: true });
    } catch (e) { console.warn("File delete failed:", e); }
  }, [items]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const toDelete = items.filter(i => selectedIds.has(i.id));
    const newItems = items.filter(i => !selectedIds.has(i.id));
    setItems(newItems);
    await saveItems(newItems);
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBulkConfirm(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    for (const item of toDelete) {
      try {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
        if (item.thumbnailUri) await FileSystem.deleteAsync(item.thumbnailUri, { idempotent: true });
      } catch {}
    }
  }, [items, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDigit = async (digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const newPin = pin + digit;
    setPin(newPin); setError("");
    if (newPin.length === PIN_LENGTH) {
      if (phase === "create_pin") {
        setFirstPin(newPin); setPin(""); setPhase("confirm_pin");
      } else if (phase === "confirm_pin") {
        if (newPin === firstPin) {
          await storage.setItem(PIN_STORAGE_KEY, newPin);
          setPin("");
          if (hasBiometrics) {
            // Erst fragen ob Nutzer Face ID möchte
            setShowFaceIdPrompt(true);
          } else {
            setPhase("unlocked"); await loadSecretItems();
          }
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setError(t("secret_library_screen.pin_mismatch_error")); setPin(""); setPhase("create_pin"); setFirstPin("");
        }
      } else if (phase === "locked") {
        const savedPin = await storage.getItem<string>(PIN_STORAGE_KEY, "");
        if (newPin === savedPin) {
          setPin(""); setPhase("unlocked"); await loadSecretItems();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          setError(t("secret_library_screen.pin_wrong_error")); setPin("");
        }
      }
    }
  };

  const handleToggleFaceId = async () => {
    const newVal = !faceIdEnabled;
    if (newVal) {
      // Aktivieren → erst authentifizieren
      try {
        const r = await LocalAuthentication.authenticateAsync({
          promptMessage: t("secret_library_screen.face_id_enable_prompt"),
          fallbackLabel: t("secret_library_screen.face_id_continue"),
        });
        if (r.success) {
          await storage.setItem(FACEID_KEY, "true");
          setFaceIdEnabled(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      } catch {}
    } else {
      await storage.setItem(FACEID_KEY, "false");
      setFaceIdEnabled(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const handleFaceIdChoice = async (enable: boolean) => {    setShowFaceIdPrompt(false);
    await storage.setItem(FACEID_KEY, enable ? "true" : "false");
    setFaceIdEnabled(enable);
    if (enable) {
      try {
        await LocalAuthentication.authenticateAsync({
          promptMessage: t("secret_library_screen.face_id_enable_prompt"),
          fallbackLabel: t("secret_library_screen.face_id_continue"),
        });
      } catch {}
    }
    setPhase("unlocked");
    await loadSecretItems();
  };

  const handleDelete = () => { setPin(p => p.slice(0, -1)); setError(""); };
  const handleBiometrics = async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: t("secret_library_screen.biometrics_prompt"), fallbackLabel: t("secret_library_screen.biometrics_use_pin") });
      if (r.success) { setPhase("unlocked"); await loadSecretItems(); }
    } catch {}
  };
  // Nur PIN zurücksetzen (Dateien bleiben)
  const handleResetPinOnly = async () => {
    await storage.removeItem(PIN_STORAGE_KEY);
    setPin(""); setFirstPin(""); setError("");
    setShowResetSheet(false);
    setPhase("intro");
  };

  // Alles löschen (PIN + alle Dateien)
  const handleDeleteAll = async () => {
    await storage.removeItem(PIN_STORAGE_KEY);
    await saveItems([]);
    _itemsCache = null;
    setShowResetSheet(false);
    // Alle Dateien im Hintergrund löschen
    try {
      const files = await FileSystem.readDirectoryAsync(SECRET_DIR).catch(() => [] as string[]);
      for (const f of files) {
        try { await FileSystem.deleteAsync(`${SECRET_DIR}${f}`, { idempotent: true }); } catch {}
      }
    } catch {}
    setItems([]); setPin(""); setFirstPin(""); setError("");
    setPhase("intro");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // INTRO
  if (phase === "intro") return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("secret_library_screen.header_title")} right={null} />
      <View style={s.center}>
        <View style={s.lockIconWrap}><Ionicons name="lock-closed" size={56} color="#000" /></View>
        <Text style={s.introTitle}>{t("secret_library_screen.intro_title")}</Text>
        <Text style={s.introSub}>{t("secret_library_screen.intro_sub")}</Text>
        <Pressable onPress={() => { setPin(""); setPhase("create_pin"); }} testID="create-pin-btn" style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>{t("secret_library_screen.create_pin_btn")}</Text>
        </Pressable>
      </View>
    </View>
  );

  // PIN SCREENS
  if (phase !== "unlocked") {
    const titleMap = {
      create_pin: t("secret_library_screen.pin_create_title"),
      confirm_pin: t("secret_library_screen.pin_confirm_title"),
      locked: t("secret_library_screen.pin_locked_title"),
    } as any;
    return (
      <>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Header
          onBack={() => router.back()}
          title={titleMap[phase]}
          right={
            phase === "locked" && hasBiometrics ? (
              <TouchableOpacity
                onPress={() => setShowSettingsSheet(true)}
                hitSlop={10}
                testID="pin-settings-btn"
                style={{ padding: 4 }}
              >
                <Ionicons name="settings-outline" size={22} color="#8E8E93" />
              </TouchableOpacity>
            ) : null
          }
        />
        <View style={s.pinArea}>
          <View style={s.lockSmall}><Ionicons name="lock-closed" size={32} color="#000" /></View>
          <Text style={s.pinTitle}>{titleMap[phase]}</Text>
          {!!error && <Text style={s.errorText}>{error}</Text>}
          <View style={s.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[s.dot, i < pin.length ? s.dotFilled : s.dotEmpty]} />
            ))}
          </View>
          <View style={s.numpad}>
            {[["1","2","3"],["4","5","6"],["7","8","9"]].map((row, ri) => (
              <View key={ri} style={s.numRow}>
                {row.map(d => (
                  <Pressable key={d} onPress={() => handleDigit(d)} testID={`pin-digit-${d}`}
                    style={({ pressed }) => [s.numKey, pressed && s.numKeyPressed]}>
                    <Text style={s.numKeyText}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            <View style={s.numRow}>
              {phase === "locked" && hasBiometrics && faceIdEnabled ? (
                <Pressable onPress={handleBiometrics} style={[s.numKey, { backgroundColor: "transparent" }]}>
                  <Ionicons name="scan-outline" size={28} color="#000" />
                </Pressable>
              ) : <View style={[s.numKey, { backgroundColor: "transparent" }]} />}
              <Pressable onPress={() => handleDigit("0")} style={({ pressed }) => [s.numKey, pressed && s.numKeyPressed]}>
                <Text style={s.numKeyText}>0</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={[s.numKey, { backgroundColor: "transparent" }]}>
                <Ionicons name="backspace-outline" size={24} color="#000" />
              </Pressable>
            </View>
          </View>
          {phase === "locked" && (
            <Pressable onPress={() => setShowResetSheet(true)} style={{ marginTop: 24 }}>
              <Text style={{ color: "#8E8E93", fontSize: 13 }}>{t("secret_library_screen.pin_reset_btn")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Reset Sheet auch im PIN-Screen */}
      <Modal visible={showResetSheet} transparent animationType="slide" onRequestClose={() => setShowResetSheet(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowResetSheet(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{t("secret_library_screen.reset_sheet_title")}</Text>
          <TouchableOpacity testID="reset-pin-only-btn" style={s.resetOptionBtn} onPress={handleResetPinOnly} activeOpacity={0.8}>
            <View style={[s.resetOptionIcon, { backgroundColor: "#EEF6FF" }]}>
              <Ionicons name="key-outline" size={22} color="#007AFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.resetOptionTitle}>{t("secret_library_screen.reset_pin_only_title")}</Text>
              <Text style={s.resetOptionSub}>{t("secret_library_screen.reset_pin_only_sub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>
          <View style={s.resetDivider} />
          <TouchableOpacity testID="reset-delete-all-btn" style={s.resetOptionBtn} onPress={handleDeleteAll} activeOpacity={0.8}>
            <View style={[s.resetOptionIcon, { backgroundColor: "#FFF0EF" }]}>
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.resetOptionTitle, { color: "#FF3B30" }]}>{t("secret_library_screen.reset_all_title")}</Text>
              <Text style={s.resetOptionSub}>{t("secret_library_screen.reset_all_sub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.sheetCancelBtn, { marginTop: 10 }]} onPress={() => setShowResetSheet(false)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.cancel_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Face ID Opt-in Prompt */}
      <Modal visible={showFaceIdPrompt} transparent animationType="slide" onRequestClose={() => handleFaceIdChoice(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => handleFaceIdChoice(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
              <Ionicons name="scan-outline" size={32} color="#007AFF" />
            </View>
            <Text style={s.sheetTitle}>{t("secret_library_screen.face_id_prompt_title")}</Text>
            <Text style={[s.sheetSub, { marginBottom: 0 }]}>{t("secret_library_screen.face_id_prompt_sub")}</Text>
          </View>
          <TouchableOpacity testID="faceid-yes-btn" style={[s.sheetDeleteBtn, { backgroundColor: "#007AFF" }]} onPress={() => handleFaceIdChoice(true)}>
            <Text style={s.sheetDeleteText}>{t("secret_library_screen.face_id_prompt_yes")}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="faceid-no-btn" style={[s.sheetCancelBtn, { marginTop: 10 }]} onPress={() => handleFaceIdChoice(false)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.face_id_prompt_no")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ⚙️ Einstellungs-Sheet im PIN-Screen */}
      <Modal visible={showSettingsSheet} transparent animationType="slide" onRequestClose={() => setShowSettingsSheet(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowSettingsSheet(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{t("secret_library_screen.settings_sheet_title")}</Text>
          <TouchableOpacity
            testID="settings-toggle-faceid-btn"
            style={s.resetOptionBtn}
            onPress={async () => {
              setShowSettingsSheet(false);
              await handleToggleFaceId();
            }}
            activeOpacity={0.8}
          >
            <View style={[s.resetOptionIcon, { backgroundColor: faceIdEnabled ? "#EEF6FF" : "#F2F2F7" }]}>
              <Ionicons name="scan-outline" size={22} color={faceIdEnabled ? "#007AFF" : "#8E8E93"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.resetOptionTitle}>{t("secret_library_screen.faceid_toggle_title")}</Text>
              <Text style={s.resetOptionSub}>
                {faceIdEnabled ? t("secret_library_screen.faceid_toggle_on") : t("secret_library_screen.faceid_toggle_off")}
              </Text>
            </View>
            <View style={[s.faceIdBadge, { backgroundColor: faceIdEnabled ? "#34C759" : "#D1D1D6" }]}>
              <Text style={s.faceIdBadgeText}>
                {faceIdEnabled ? t("secret_library_screen.faceid_on_label") : t("secret_library_screen.faceid_off_label")}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[s.sheetCancelBtn, { marginTop: 10 }]} onPress={() => setShowSettingsSheet(false)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.cancel_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      </>
    );
  }

  // UNLOCKED
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header
        onBack={() => {
          if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); }
          else { setPhase("locked"); router.back(); }
        }}
        title={selectMode
          ? (selectedIds.size > 0 ? t("secret_library_screen.select_n_selected", { count: selectedIds.size }) : t("secret_library_screen.select_n_selected", { count: 0 }))
          : t("secret_library_screen.header_title")}
        right={
          selectMode ? (
            <TouchableOpacity onPress={() => { setSelectMode(false); setSelectedIds(new Set()); }} hitSlop={8} testID="select-done-btn">
              <Text style={{ color: "#007AFF", fontSize: 15, fontWeight: "600" }}>{t("common.done")}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {items.length > 0 && (
                <TouchableOpacity onPress={() => setSelectMode(true)} hitSlop={8} testID="select-mode-btn">
                  <Ionicons name="checkmark-circle-outline" size={24} color="#007AFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowResetSheet(true)} hitSlop={8}>
                  <Text style={{ color: "#FF3B30", fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{t("secret_library_screen.reset_action")}</Text>
                </TouchableOpacity>
            </View>
          )
        }
      />

      {loading ? <View style={s.center}><ActivityIndicator size="large" color="#007AFF" /></View> : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          numColumns={COLS}
          contentContainerStyle={[s.grid, { paddingBottom: insets.bottom + 100 }]}
          columnWrapperStyle={{ gap: 4 }}
          testID="secret-library-grid"
          ListHeaderComponent={
            <View style={s.statsBar}>
              <Ionicons name="lock-closed" size={14} color="#34C759" />
              <Text style={s.statsText}>
                {items.length === 0 ? t("secret_library_screen.stats_empty") : t(items.length === 1 ? "secret_library_screen.stats_secured_one" : "secret_library_screen.stats_secured_other", { count: items.length })}
              </Text>
              {!isPremium && (
                <Text style={[s.statsText, { color: items.length >= FREE_SECRET_LIMIT ? "#FF3B30" : "#8E8E93", marginLeft: "auto" }]}>
                  {t("secret_library_screen.stats_free_slots", { count: items.length })}
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Ionicons name="images-outline" size={40} color="#C7C7CC" />
              <Text style={s.emptyText}>{t("secret_library_screen.empty_title")}</Text>
              <Text style={s.emptySubText}>{t("secret_library_screen.empty_sub")}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <View style={{ width: TILE, height: TILE, position: "relative", marginBottom: 4 }}>
                <TouchableOpacity
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    if (selectMode) { toggleSelect(item.id); }
                    else { setViewerIndex(index); }
                  }}
                  onLongPress={() => {
                    if (!selectMode) { setSelectMode(true); toggleSelect(item.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); }
                  }}
                  activeOpacity={0.8}
                  testID={`secret-item-${item.id}`}
                >
                  {item.type === "video" ? (
                    item.thumbnailUri ? (
                      <ExpoImage
                        source={{ uri: item.thumbnailUri }}
                        style={{ width: TILE, height: TILE, borderRadius: 8 }}
                        contentFit="cover"
                        cachePolicy="none"
                      />
                    ) : (
                      <View style={{ width: TILE, height: TILE, borderRadius: 8, backgroundColor: "#1C1C1E", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="videocam" size={28} color="#555" />
                      </View>
                    )
                  ) : (
                    <ExpoImage
                      source={{ uri: item.uri }}
                      style={{ width: TILE, height: TILE, borderRadius: 8 }}
                      contentFit="cover"
                      cachePolicy="none"
                    />
                  )}
                </TouchableOpacity>

                {/* Video-Badge */}
                {item.type === "video" && !selectMode && (
                  <View style={s.videoBadge} pointerEvents="none">
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                )}

                {/* Apple Photos Auswahlkreis — immer sichtbar */}
                <TouchableOpacity
                  style={s.selCircleBtn}
                  onPress={() => {
                    if (!selectMode) {
                      setSelectMode(true);
                      toggleSelect(item.id);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    } else {
                      toggleSelect(item.id);
                    }
                  }}
                  hitSlop={8}
                  testID={`sel-circle-${item.id}`}
                >
                  <View style={[s.selCircleInner, isSelected && s.selCircleInnerOn]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </TouchableOpacity>

                {/* Auswahl-Tint in SelectMode */}
                {selectMode && (
                  <View style={[s.selectOverlay, isSelected && s.selectOverlayOn]} pointerEvents="none" />
                )}

                {/* X-Button — nur im normalen Modus */}
                {!selectMode && (
                  <TouchableOpacity
                    style={s.deleteItemBtn}
                    onPress={() => setDeleteCandidate(item)}
                    hitSlop={10}
                    testID={`delete-item-${item.id}`}
                  >
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {!!addFeedback && (
        <View style={[s.feedbackBar, { bottom: insets.bottom + 88 }]}>
          <Text style={s.feedbackText}>{addFeedback}</Text>
        </View>
      )}

      {/* FAB oder Bulk-Delete-Bar */}
      {selectMode ? (
        <View style={[s.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            testID="select-all-btn"
            style={s.bulkSelectAll}
            onPress={() => {
              if (selectedIds.size === items.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(items.map(i => i.id)));
            }}
          >
            <Text style={s.bulkSelectAllText}>
              {selectedIds.size === items.length ? t("secret_library_screen.bulk_deselect_all") : t("secret_library_screen.bulk_select_all")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="bulk-delete-btn"
            style={[s.bulkDeleteBtn, selectedIds.size === 0 && { opacity: 0.4 }]}
            onPress={() => selectedIds.size > 0 && setShowBulkConfirm(true)}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={s.bulkDeleteText}>
              {selectedIds.size > 0 ? t("secret_library_screen.bulk_delete_count", { count: selectedIds.size }) : t("common.delete")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[s.fabWrap, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            testID="add-photos-btn"
            style={[s.fab, adding && { opacity: 0.7 }]}
            onPress={() => {
              if (!isPremium && items.length >= FREE_SECRET_LIMIT) {
                router.push("/paywall" as any);
                return;
              }
              setShowPicker(true);
            }}
            disabled={adding}
            activeOpacity={0.85}
          >
            {adding ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={22} color="#fff" />}
            <Text style={s.fabText}>{adding ? t("secret_library_screen.adding_progress") : t("secret_library_screen.add_btn")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <PhotoPickerModal visible={showPicker} onClose={() => setShowPicker(false)} onAdd={handleAddAssets} />

      {/* Einzel-Lösch-Bestätigung */}
      <Modal visible={!!deleteCandidate} transparent animationType="slide" onRequestClose={() => setDeleteCandidate(null)}>
        <Pressable style={s.sheetOverlay} onPress={() => setDeleteCandidate(null)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>
            {deleteCandidate?.type === "video" ? t("secret_library_screen.delete_video_title") : t("secret_library_screen.delete_photo_title")}
          </Text>
          <Text style={s.sheetSub}>{t("secret_library_screen.delete_sub")}</Text>
          <TouchableOpacity testID="confirm-delete-btn" style={s.sheetDeleteBtn}
            onPress={() => { handleDeleteItem(deleteCandidate!); setDeleteCandidate(null); }}>
            <Text style={s.sheetDeleteText}>{t("secret_library_screen.delete_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sheetCancelBtn} onPress={() => setDeleteCandidate(null)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.cancel_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Bulk-Lösch-Bestätigung */}
      <Modal visible={showBulkConfirm} transparent animationType="slide" onRequestClose={() => setShowBulkConfirm(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowBulkConfirm(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Ionicons name="trash" size={32} color="#FF3B30" style={{ alignSelf: "center", marginBottom: 8 }} />
          <Text style={s.sheetTitle}>{t("secret_library_screen.bulk_confirm_title", { count: selectedIds.size })}</Text>
          <Text style={s.sheetSub}>{t("secret_library_screen.bulk_confirm_sub")}</Text>
          <TouchableOpacity testID="bulk-confirm-delete-btn" style={s.sheetDeleteBtn} onPress={handleBulkDelete}>
            <Text style={s.sheetDeleteText}>{t("secret_library_screen.bulk_confirm_btn", { count: selectedIds.size })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.sheetCancelBtn} onPress={() => setShowBulkConfirm(false)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.cancel_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <MediaViewerModal items={items} initialIndex={viewerIndex} visible={viewerIndex >= 0} onClose={() => setViewerIndex(-1)} />

      {/* ── Reset Bottom Sheet (Unlocked) ── */}
      <Modal visible={showResetSheet} transparent animationType="slide" onRequestClose={() => setShowResetSheet(false)}>
        <Pressable style={s.sheetOverlay} onPress={() => setShowResetSheet(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{t("secret_library_screen.reset_sheet_title")}</Text>

          {/* Option 1: Nur PIN */}
          <TouchableOpacity
            testID="reset-pin-only-btn"
            style={s.resetOptionBtn}
            onPress={handleResetPinOnly}
            activeOpacity={0.8}
          >
            <View style={[s.resetOptionIcon, { backgroundColor: "#EEF6FF" }]}>
              <Ionicons name="key-outline" size={22} color="#007AFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.resetOptionTitle}>{t("secret_library_screen.reset_pin_only_title")}</Text>
              <Text style={s.resetOptionSub}>{t("secret_library_screen.reset_pin_only_sub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>

          <View style={s.resetDivider} />

          {/* Option 2: Alles löschen */}
          <TouchableOpacity
            testID="reset-delete-all-btn"
            style={s.resetOptionBtn}
            onPress={handleDeleteAll}
            activeOpacity={0.8}
          >
            <View style={[s.resetOptionIcon, { backgroundColor: "#FFF0EF" }]}>
              <Ionicons name="trash-outline" size={22} color="#FF3B30" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.resetOptionTitle, { color: "#FF3B30" }]}>{t("secret_library_screen.reset_all_title")}</Text>
              <Text style={s.resetOptionSub}>{t("secret_library_screen.reset_all_sub")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>

          <TouchableOpacity style={[s.sheetCancelBtn, { marginTop: 10 }]} onPress={() => setShowResetSheet(false)}>
            <Text style={s.sheetCancelText}>{t("secret_library_screen.cancel_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ── Header ────────────────────────────────────────────────
function Header({ onBack, title, right }: { onBack: () => void; title: string; right: React.ReactNode }) {
  return (
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.backBtn} testID="back-btn">
        <Ionicons name="chevron-back" size={24} color="#007AFF" />
      </Pressable>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ minWidth: 60, maxWidth: 120, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.1)" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  lockIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  lockSmall: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  introTitle: { fontSize: 24, fontWeight: "800", color: "#000", textAlign: "center", letterSpacing: -0.5, lineHeight: 30, marginBottom: 12 },
  introSub: { fontSize: 15, color: "#8E8E93", textAlign: "center", lineHeight: 21, marginBottom: 32 },
  primaryBtn: { backgroundColor: "#007AFF", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  pinArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  pinTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginBottom: 8, textAlign: "center" },
  errorText: { color: "#FF3B30", fontSize: 13, textAlign: "center", marginBottom: 8 },
  dotsRow: { flexDirection: "row", gap: 20, marginVertical: 24 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  dotFilled: { backgroundColor: "#007AFF" },
  dotEmpty: { backgroundColor: "#D1D1D6" },
  numpad: { gap: 12, marginTop: 8 },
  numRow: { flexDirection: "row", gap: 20 },
  numKey: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" },
  numKeyPressed: { backgroundColor: "#D1D1D6" },
  numKeyText: { fontSize: 28, fontWeight: "400", color: "#000" },
  grid: { padding: 16 },
  statsBar: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  statsText: { fontSize: 13, color: "#34C759", fontWeight: "600" },
  emptyCard: { backgroundColor: "#F2F2F7", borderRadius: 20, padding: 32, alignItems: "center", gap: 8, marginBottom: 20 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#000" },
  emptySubText: { fontSize: 13, color: "#8E8E93", textAlign: "center" },
  videoBadge: { position: "absolute", bottom: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  deleteItemBtn: { position: "absolute", top: 4, right: 4 },
  fabWrap: { position: "absolute", left: 16, right: 16 },
  fab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#007AFF", borderRadius: 18, height: 56, shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  feedbackBar: { position: "absolute", left: 16, right: 16, backgroundColor: "rgba(0,0,0,0.8)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  feedbackText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", alignSelf: "center", marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 6 },
  sheetSub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 24 },
  sheetDeleteBtn: { backgroundColor: "#FF3B30", borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  sheetDeleteText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetCancelBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F2F7" },
  sheetCancelText: { color: "#000", fontSize: 16, fontWeight: "600" },
  // Select mode
  selectOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.25)" },
  selectOverlayOn: { backgroundColor: "rgba(0,122,255,0.3)" },
  selCircleBtn: { position: "absolute", top: 5, left: 5, zIndex: 20 },
  selCircleInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  selCircleInnerOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  bulkBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  bulkSelectAll: { flex: 1, height: 52, borderRadius: 14, backgroundColor: "#F2F2F7", alignItems: "center", justifyContent: "center" },
  bulkSelectAllText: { fontSize: 15, fontWeight: "600", color: "#3C3C43" },
  bulkDeleteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, borderRadius: 14, backgroundColor: "#FF3B30" },
  bulkDeleteText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  resetOptionBtn: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  resetOptionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  resetOptionTitle: { fontSize: 16, fontWeight: "700", color: "#000", marginBottom: 2 },
  resetOptionSub: { fontSize: 13, color: "#8E8E93" },
  resetDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 4 },
  faceIdBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  faceIdBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
});

const pm = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#1C1C1E", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  cancelText: { fontSize: 16, color: "#007AFF", minWidth: 80 },
  title: { fontSize: 17, fontWeight: "700", color: "#fff" },
  addBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#007AFF", borderRadius: 10, minWidth: 80, alignItems: "center" },
  addBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  permTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  permText: { fontSize: 14, color: "#8E8E93", textAlign: "center", paddingHorizontal: 32 },
  videoBadge: { position: "absolute", bottom: 4, left: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  selOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,122,255,0.35)", alignItems: "flex-end", justifyContent: "flex-start", padding: 4 },
  selCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#007AFF", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
});
