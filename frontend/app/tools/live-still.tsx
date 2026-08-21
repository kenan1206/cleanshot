// Live → Standbild — 2-Spalten Grid + Tap-Preview + % Fortschritt + Delete-Sheet
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  useWindowDimensions, Modal, TouchableOpacity, ScrollView, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS,
} from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import * as ImageManipulator from "expo-image-manipulator";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import AssetThumbnail from "@/src/components/AssetThumbnail";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
import { startActiveTask, finishActiveTask, cancelActiveTask } from "@/src/utils/activeTask";

type LiveItem = {
  id: string; uri: string; width: number; height: number;
  filename: string; selected: boolean; status: "idle" | "converting" | "done" | "error";
};

export default function LiveStill() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const { user, trackUsage, trackFeatureUse } = useApp();
  const rc = useRevenueCat();
  const FREE_TOOL_USES = 2;
  const isPremium = rc.isSubscribed || !!user?.is_premium;
  const lsUsed = user?.free_live_still_used ?? 0;
  const lsRemaining = Math.max(0, FREE_TOOL_USES - lsUsed);
  const lsLocked = !isPremium && lsUsed >= FREE_TOOL_USES;

  const COLS = 2;
  const GAP = 8;
  const CELL = Math.floor((width - 16 * 2 - GAP) / COLS);

  const [items, setItems] = useState<LiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [permDenied, setPermDenied] = useState(false);
  const [convertProgress, setConvertProgress] = useState({ done: 0, total: 0 });
  const [convertedIds, setConvertedIds] = useState<string[]>([]);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [previewItem, setPreviewItem] = useState<LiveItem | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  // ── Swipe-Down für Preview-Card ──────────────────────────────
  const previewTranslateY = useSharedValue(0);

  const enterSelectMode = useCallback((id?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectMode(true);
    if (id) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: true } : i)));
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setItems((prev) => prev.map((i) => ({ ...i, selected: false })));
  }, []);

  const loadLivePhotos = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { setPermDenied(true); setLoading(false); return; }
      const isLivePhoto = (a: MediaLibrary.Asset): boolean =>
        !!(a.mediaSubtypes?.includes("livePhoto")) || a.duration > 0;
      const liveAssets: MediaLibrary.Asset[] = [];
      let cursor: string | undefined;
      let totalScanned = 0;
      do {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo, first: 500,
          after: cursor, sortBy: [MediaLibrary.SortBy.creationTime],
        });
        liveAssets.push(...page.assets.filter(isLivePhoto));
        cursor = page.endCursor;
        totalScanned += page.assets.length;
        if (!page.hasNextPage || totalScanned >= 5000) break;
      } while (true);
      setItems(liveAssets.map((a) => ({
        id: a.id, uri: a.uri, width: a.width, height: a.height,
        filename: a.filename ?? `photo_${a.id}`, selected: false, status: "idle",
      })));
    } catch (e) { console.warn("live photo scan failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLivePhotos(); }, [loadLivePhotos]);

  // Reset Card-Position wenn neues Preview öffnet
  useEffect(() => {
    if (previewItem) previewTranslateY.value = 0;
  }, [previewItem, previewTranslateY]);

  const toggleAll = () => {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  };

  const toggleItem = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  };

  const selectedItems = items.filter((i) => i.selected && i.status === "idle");

  const startConversion = async () => {
    if (selectedItems.length === 0) return;

    // Free-tier gate: check BEFORE starting — locked OR selection would exceed free quota
    if (!isPremium) {
      const freeRemaining = Math.max(0, FREE_TOOL_USES - lsUsed);
      if (freeRemaining <= 0 || selectedItems.length > freeRemaining) {
        router.push({ pathname: "/paywall", params: { reason: "feature", feature: "live_still" } });
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConverting(true);
    setConvertProgress({ done: 0, total: selectedItems.length });
    await startActiveTask(t("notifications.task_convert"));

    // Yield to UI thread so the spinner renders before heavy work begins
    await new Promise<void>((r) => setTimeout(r, 80));

    let count = 0;
    const converted: string[] = [];
    for (const item of selectedItems) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "converting" } : i)));
      try {
        const info = await MediaLibrary.getAssetInfoAsync(item.id, { shouldDownloadFromNetwork: false });
        const srcUri = info.localUri ?? item.uri;
        const result = await ImageManipulator.manipulateAsync(
          srcUri, [], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
        );
        await MediaLibrary.createAssetAsync(result.uri);
        count++;
        converted.push(item.id);
        setConvertProgress({ done: count, total: selectedItems.length });
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
      } catch (e: any) {
        console.warn("conversion failed for", item.id, e);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "error" } : i)));
        const isNoSpace = /no space|enospc|out of space|640/i.test(e?.message ?? "") || e?.code === "ENOSPC";
        if (isNoSpace) {
          Alert.alert(t("common.storage_full_title"), t("common.storage_full_body"));
          break;
        }
      }
    }
    setDoneCount(count);
    setConvertedIds(converted);
    setConverting(false);

    if (count > 0) {
      await finishActiveTask(
        t("notifications.convert_done_title", { count }),
        t("notifications.convert_done_body"),
      );
    } else {
      cancelActiveTask();
    }

    // Track one use per successfully converted photo (not per session)
    if (count > 0) { trackFeatureUse("live_still", count).catch(() => {}); }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setShowDeleteSheet(true);
  };

  const handleDeleteOriginals = async () => {
    setShowDeleteSheet(false);
    if (convertedIds.length > 0) {
      // Removing the Live Photo original frees roughly the ~3 MB video portion each.
      const freedMB = convertedIds.length * 3;

      // Free-tier gate — nur noch MB-basiert (100 MB gratis).
      if (!isPremium) {
        const wouldExceedMB = (user?.free_mb_used ?? 0) + freedMB > 100;
        if (wouldExceedMB) {
          router.push({ pathname: "/paywall", params: { reason: "limit" } });
          return;
        }
      }

      try {
        await MediaLibrary.deleteAssetsAsync(convertedIds);
        // Record so it shows up in Verlauf and counts against the free quota.
        await trackUsage(freedMB, convertedIds.length, "other");
      } catch (e) { console.warn(e); }
    }
    setDone(true);
  };

  const handleKeepOriginals = () => { setShowDeleteSheet(false); setDone(true); };

  if (permDenied) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("live_still_screen.header_title")} />
      <View style={s.center}>
        <Ionicons name="images-outline" size={56} color="#C7C7CC" />
        <Text style={s.emptyTitle}>{t("live_still_screen.no_access_title")}</Text>
        <Text style={s.emptySub}>{t("live_still_screen.no_access_sub")}</Text>
      </View>
    </View>
  );

  if (loading) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("live_still_screen.header_title")} />
      <View style={s.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={s.loadingText}>{t("live_still_screen.searching")}</Text>
      </View>
    </View>
  );

  if (!loading && items.length === 0) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("live_still_screen.header_title")} />
      <View style={s.center}>
        <Ionicons name="checkmark-circle" size={64} color="#34C759" />
        <Text style={s.emptyTitle}>{t("live_still_screen.none_found_title")}</Text>
        <Text style={s.emptySub}>{t("live_still_screen.none_found_sub")}</Text>
      </View>
    </View>
  );

  if (done && !converting) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("live_still_screen.header_title")} />
      <View style={s.center}>
        <Ionicons name="checkmark-circle" size={72} color="#34C759" />
        <Text style={s.successTitle}>{t("live_still_screen.converted_title")}</Text>
        <Text style={s.successSub}>{t("live_still_screen.converted_sub", { count: doneCount })}</Text>
        <Pressable onPress={() => { setDone(false); loadLivePhotos(); }} style={s.doneBtn} testID="convert-done-btn">
          <Text style={s.doneBtnText}>{t("live_still_screen.more_btn")}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("live_still_screen.header_title")} />

      {!isPremium && (
        <View style={s.usesBar}>
          <View style={[s.usesPill, lsLocked && s.usesPillLocked]} testID="tool-uses-pill">
            <Ionicons name={lsLocked ? "lock-closed" : "flash"} size={13} color={lsLocked ? "#FF9500" : "#007AFF"} />
            <Text style={[s.usesText, lsLocked && { color: "#FF9500" }]}>
              {t("tools.free_uses_left", { count: lsRemaining })}
            </Text>
          </View>
        </View>
      )}

      {/* Stats row */}
      <View style={s.statsRow}>
        <Text style={s.statsText}>{t("live_still_screen.found_count", { count: items.length })}</Text>
        <Pressable onPress={toggleAll} testID="select-all-btn">
          <Text style={s.selectAll}>
            {items.every((i) => i.selected) ? t("live_still_screen.deselect_all") : t("live_still_screen.select_all")}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={COLS}
        contentContainerStyle={[s.grid, { paddingBottom: insets.bottom + 100 }]}
        columnWrapperStyle={{ gap: GAP }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = item.selected && item.status === "idle";
          const isDone = item.status === "done";
          const isConverting = item.status === "converting";
          return (
            <View style={{ width: CELL, marginBottom: GAP }}>
              {/* Thumbnail — Tap = Preview oder Auswählen */}
              <Pressable
                onPress={() => {
                  if (selectMode) { toggleItem(item.id); }
                  else if (!converting && item.status === "idle") { setPreviewItem(item); }
                }}
                testID={`live-preview-${item.id}`}
                style={s.thumbWrap}
              >
                <AssetThumbnail
                  asset={{ id: item.id, uri: item.uri, width: item.width, height: item.height, fileSize: 0, mediaType: "photo" }}
                  style={{ width: CELL, height: CELL, borderRadius: 12 }}
                />
                {/* LIVE badge */}
                {item.status === "idle" && (
                  <View style={s.liveBadge}><Text style={s.liveBadgeText}>LIVE</Text></View>
                )}
                {/* Converting overlay */}
                {isConverting && (
                  <View style={s.convertingOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
                {/* Done overlay */}
                {isDone && (
                  <View style={s.doneOverlay}>
                    <Ionicons name="checkmark-circle" size={32} color="#34C759" />
                  </View>
                )}
                {/* Auswahl-Kreis — Apple Photos Stil */}
                {item.status === "idle" && (
                  <Pressable
                    onPress={() => selectMode ? toggleItem(item.id) : enterSelectMode(item.id)}
                    hitSlop={8}
                    testID={`live-check-${item.id}`}
                    style={[s.checkCircle, isSelected && s.checkCircleOn]}
                  >
                    {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </Pressable>
                )}
              </Pressable>
              {/* Info below */}
              <Text style={s.cellName} numberOfLines={1}>{item.filename}</Text>
            </View>
          );
        }}
      />

      {/* FAB */}
      {lsLocked ? (
        <Pressable
          onPress={() => router.push({ pathname: "/paywall", params: { reason: "feature", feature: "live_still" } })}
          testID="tool-upgrade-fab"
          style={[s.fab, { backgroundColor: "#FF9500", bottom: insets.bottom + 16 }]}
        >
          <Ionicons name="lock-closed" size={18} color="#fff" />
          <Text style={s.fabText}>{t("tools.upgrade_unlimited")}</Text>
        </Pressable>
      ) : selectedItems.length > 0 && !converting ? (
        <Pressable onPress={startConversion} testID="start-convert-btn"
          style={[s.fab, { bottom: insets.bottom + 16 }]}>
          <Ionicons name="aperture" size={20} color="#fff" />
          <Text style={s.fabText}>{t("live_still_screen.convert_btn", { count: selectedItems.length })}</Text>
        </Pressable>
      ) : null}

      {converting && (
        <View style={[s.convertingBanner, { bottom: insets.bottom + 16 }]}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={s.convertingBannerText}>
            {t("live_still_screen.converting_banner", {
              done: convertProgress.done, total: convertProgress.total,
              pct: convertProgress.total > 0 ? Math.round((convertProgress.done / convertProgress.total) * 100) : 0,
            })}
          </Text>
        </View>
      )}

      {/* ── Preview Modal ── */}
      <Modal visible={!!previewItem} animationType="fade" transparent onRequestClose={() => setPreviewItem(null)}>
        <View style={s.previewOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPreviewItem(null)} />
          {previewItem && (() => {
            const closePreview = () => setPreviewItem(null);
            const swipeCard = Gesture.Pan()
              .activeOffsetY([-6, 6])
              .failOffsetX([-20, 20])
              .onUpdate((e) => {
                if (e.translationY > 0) previewTranslateY.value = e.translationY;
              })
              .onEnd((e) => {
                if (e.translationY > 100 || e.velocityY > 500) {
                  previewTranslateY.value = withTiming(800, { duration: 200 }, () => runOnJS(closePreview)());
                } else {
                  previewTranslateY.value = withSpring(0, { damping: 20 });
                }
              });
            const cardStyle = { transform: [{ translateY: previewTranslateY }] };
            return (
              <GestureDetector gesture={swipeCard}>
                <Animated.View style={[s.previewCard, cardStyle]}>
                  <ExpoImage
                    source={{ uri: previewItem.uri }}
                    style={s.previewImg}
                    contentFit="contain"
                  />
                  <View style={s.previewInfo}>
                    <View style={s.livePill}><Text style={s.livePillText}>{t("live_still_screen.live_badge_label")}</Text></View>
                    <Text style={s.previewName} numberOfLines={2}>{previewItem.filename}</Text>
                    <Text style={s.previewMeta}>{previewItem.width} × {previewItem.height}</Text>
                  </View>
                  <View style={s.previewActions}>
                    <TouchableOpacity
                      style={[s.previewSelectBtn, previewItem.selected && s.previewSelectBtnOn]}
                      onPress={() => { toggleItem(previewItem.id); setPreviewItem(null); }}
                      testID="preview-select-btn"
                    >
                      <Ionicons name={previewItem.selected ? "checkmark-circle" : "radio-button-off-outline"} size={20} color={previewItem.selected ? "#fff" : "#007AFF"} />
                      <Text style={[s.previewSelectText, previewItem.selected && { color: "#fff" }]}>
                        {previewItem.selected ? t("live_still_screen.selected_label") : t("live_still_screen.select_label")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.previewCloseBtn} onPress={closePreview}>
                      <Text style={s.previewCloseTxt}>{t("common.close")}</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </GestureDetector>
            );
          })()}
        </View>
      </Modal>

      {/* Delete Sheet */}
      <Modal visible={showDeleteSheet} transparent animationType="slide" onRequestClose={handleKeepOriginals}>
        <Pressable style={s.sheetOverlay} onPress={handleKeepOriginals} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Ionicons name="checkmark-circle" size={40} color="#34C759" style={{ alignSelf: "center", marginBottom: 10 }} />
          <Text style={s.sheetTitle}>{t("live_still_screen.delete_originals_title")}</Text>
          <Text style={s.sheetSub}>{t("live_still_screen.delete_originals_sub")}</Text>
          <TouchableOpacity testID="delete-originals-btn" style={s.sheetDeleteBtn} onPress={handleDeleteOriginals}>
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={s.sheetDeleteText}>{t("live_still_screen.delete_originals_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="keep-originals-btn" style={s.sheetKeepBtn} onPress={handleKeepOriginals}>
            <Text style={s.sheetKeepText}>{t("live_still_screen.keep_originals_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function Header({ onBack, title, selectMode = false, onEnterSelect, onExitSelect, onToggleAll, allSelected }: {
  onBack: () => void; title: string;
  selectMode?: boolean; onEnterSelect?: () => void; onExitSelect?: () => void;
  onToggleAll?: () => void; allSelected?: boolean;
}) {
  return (
    <View style={s.header}>
      {selectMode ? (
        <Pressable onPress={onExitSelect} hitSlop={12} style={s.backBtn} testID="exit-select-btn">
          <Ionicons name="close" size={26} color="#1C1C1E" />
        </Pressable>
      ) : (
        <Pressable onPress={onBack} style={s.backBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={24} color="#007AFF" />
        </Pressable>
      )}
      <Text style={s.headerTitle}>{title}</Text>
      {selectMode ? (
        <Pressable onPress={onToggleAll} hitSlop={12} style={s.backBtn} testID="toggle-all-btn">
          <Text style={{ color: "#007AFF", fontSize: 14, fontWeight: "600" }}>
            {allSelected ? "Keine" : "Alle"}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={onEnterSelect} hitSlop={12} style={s.backBtn} testID="enter-select-btn">
          <Ionicons name="checkmark-circle-outline" size={24} color="#007AFF" />
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.1)" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#000" },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#F2F2F7" },
  usesBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  usesPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, backgroundColor: "#EAF2FF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  usesPillLocked: { backgroundColor: "#FFF4E5" },
  usesPillPro: { backgroundColor: "#007AFF" },
  usesText: { fontSize: 12, fontWeight: "700", color: "#007AFF" },
  statsText: { fontSize: 13, color: "#8E8E93", fontWeight: "500" },
  selectAll: { fontSize: 14, color: "#007AFF", fontWeight: "600" },
  grid: { padding: 16 },
  thumbWrap: { position: "relative" },
  liveBadge: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  checkCircle: { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  checkCircleOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  convertingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  doneOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(52,199,89,0.25)", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cellName: { fontSize: 11, color: "#8E8E93", marginTop: 4, paddingHorizontal: 2 },
  fab: { position: "absolute", left: 16, right: 16, backgroundColor: "#007AFF", borderRadius: 16, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  convertingBanner: { position: "absolute", left: 16, right: 16, backgroundColor: "#34C759", borderRadius: 16, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  convertingBannerText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  loadingText: { fontSize: 15, color: "#8E8E93", marginTop: 16, fontWeight: "500" },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginTop: 16 },
  emptySub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginTop: 8 },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#000", marginTop: 16, letterSpacing: -0.5 },
  successSub: { fontSize: 16, color: "#8E8E93", marginTop: 8, textAlign: "center" },
  doneBtn: { marginTop: 24, backgroundColor: "#007AFF", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  // Preview Modal
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "flex-end" },
  previewCard: { width: "100%", backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  previewImg: { width: "100%", height: 320, backgroundColor: "#000" },
  previewInfo: { padding: 16, paddingBottom: 8 },
  livePill: { alignSelf: "flex-start", backgroundColor: "#007AFF15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  livePillText: { fontSize: 11, fontWeight: "800", color: "#007AFF", letterSpacing: 0.5 },
  previewName: { fontSize: 15, fontWeight: "600", color: "#000", marginBottom: 4 },
  previewMeta: { fontSize: 13, color: "#8E8E93" },
  previewActions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  previewSelectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 2, borderColor: "#007AFF", backgroundColor: "#fff" },
  previewSelectBtnOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  previewSelectText: { fontSize: 15, fontWeight: "700", color: "#007AFF" },
  previewCloseBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: 50, borderRadius: 14, backgroundColor: "#F2F2F7" },
  previewCloseTxt: { fontSize: 15, fontWeight: "600", color: "#000" },
  // Sheets
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 6 },
  sheetSub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 20, lineHeight: 20 },
  sheetDeleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF3B30", borderRadius: 14, height: 52, marginBottom: 10 },
  sheetDeleteText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetKeepBtn: { backgroundColor: "#F2F2F7", borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  sheetKeepText: { color: "#000", fontSize: 16, fontWeight: "600" },
});
