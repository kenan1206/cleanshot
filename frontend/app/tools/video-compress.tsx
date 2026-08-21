// Video-Komprimierung — 2-Spalten Grid + Tap-Preview + % Fortschritt + Stop + Delete-Sheet
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  Modal, TouchableOpacity, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { VideoCompressor } from "@/src/utils/videoCompressor";
import AssetThumbnail from "@/src/components/AssetThumbnail";
import VideoPreviewPlayer from "@/src/components/VideoPreviewPlayer";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";

type VideoItem = {
  id: string; uri: string; filename: string; duration: number;
  width: number; height: number; sizeMB: number;
  selected: boolean; status: "idle" | "compressing" | "done" | "error";
  progress: number; savedMB: number;
};

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

function formatDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoCompress() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const { user, trackUsage, trackFeatureUse } = useApp();
  const rc = useRevenueCat();
  const FREE_TOOL_USES = 2;
  const isPremium = rc.isSubscribed || !!user?.is_premium;
  const vcUsed = user?.free_video_compress_used ?? 0;
  const vcRemaining = Math.max(0, FREE_TOOL_USES - vcUsed);
  const vcLocked = !isPremium && vcUsed >= FREE_TOOL_USES;

  const COLS = 2;
  const GAP = 8;
  const CELL = Math.floor((width - 16 * 2 - GAP) / COLS);
  const THUMB_H = Math.round(CELL * 0.68);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [done, setDone] = useState(false);
  const [totalSavedMB, setTotalSavedMB] = useState(0);
  const [permDenied, setPermDenied] = useState(false);
  const [overallProgress, setOverallProgress] = useState({ done: 0, total: 0 });
  const [currentItemPct, setCurrentItemPct] = useState(0);
  const [compressedIds, setCompressedIds] = useState<string[]>([]);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<VideoItem | null>(null);
  const cancelRef = useRef(false);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { setPermDenied(true); setLoading(false); return; }
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video, first: 200,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      const items: VideoItem[] = result.assets.map((a) => ({
        id: a.id, uri: a.uri, filename: a.filename ?? `video_${a.id}`,
        duration: a.duration, width: a.width, height: a.height,
        sizeMB: Math.max(1, (a.duration / 60) * 10),
        selected: false, status: "idle", progress: 0, savedMB: 0,
      }));
      items.sort((a, b) => b.sizeMB - a.sizeMB);
      setVideos(items);
    } catch (e) { console.warn("video load error", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const toggleItem = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v)));
  };

  const toggleAll = () => {
    const allSel = videos.filter(v => v.status === "idle").every((v) => v.selected);
    setVideos((prev) => prev.map((v) => v.status === "idle" ? { ...v, selected: !allSel } : v));
  };

  const selectedVideos = videos.filter((v) => v.selected && v.status === "idle");

  const startCompression = async () => {
    if (selectedVideos.length === 0) return;

    // Free-tier gate: check BEFORE starting — locked OR selection would exceed free quota
    if (!isPremium) {
      const freeRemaining = Math.max(0, FREE_TOOL_USES - vcUsed);
      if (freeRemaining <= 0 || selectedVideos.length > freeRemaining) {
        router.push({ pathname: "/paywall", params: { reason: "feature", feature: "video_compress" } });
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCompressing(true);
    cancelRef.current = false;
    setOverallProgress({ done: 0, total: selectedVideos.length });
    setCurrentItemPct(0);

    // Yield to UI thread so the spinner renders before heavy native work begins
    // (eliminates the ~3s freeze on the "Komprimieren" button press)
    await new Promise<void>((r) => setTimeout(r, 80));

    let saved = 0;
    let doneCount = 0;
    const compressed: string[] = [];

    for (const video of selectedVideos) {
      if (cancelRef.current) break;
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, status: "compressing" } : v)));
      setCurrentItemPct(0);

      try {
        const compressedUri = await VideoCompressor.compress(
          video.uri, { compressionMethod: "auto", maxSize: 1280 },
          (progress: number) => {
            const pct = Math.round(progress * 100);
            setCurrentItemPct(pct);
            setVideos((prev) => prev.map((v) => v.id === video.id ? { ...v, progress: pct } : v));
          }
        );
        if (cancelRef.current) break;
        await MediaLibrary.createAssetAsync(compressedUri);
        const savedMB = video.sizeMB * 0.4;
        saved += savedMB;
        doneCount++;
        compressed.push(video.id);
        setCurrentItemPct(0);
        setOverallProgress({ done: doneCount, total: selectedVideos.length });
        setVideos((prev) => prev.map((v) => v.id === video.id ? { ...v, status: "done", progress: 100, savedMB } : v));
      } catch (e) {
        console.warn("compression failed for", video.id, e);
        setVideos((prev) => prev.map((v) => v.id === video.id ? { ...v, status: "error", progress: 0 } : v));
      }
    }

    setTotalSavedMB(saved);
    setCompressedIds(compressed);
    setCompressing(false);
    setCurrentItemPct(0);

    // Track one use per successfully compressed video (not per session)
    if (doneCount > 0) { trackFeatureUse("video_compress", doneCount).catch(() => {}); }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (doneCount > 0) setShowDeleteSheet(true);
    else setDone(true);
  };

  const handleCancelCompression = () => {
    cancelRef.current = true;
    setVideos((prev) => prev.map((v) => v.status === "compressing" ? { ...v, status: "idle", progress: 0 } : v));
  };

  const handleDeleteOriginals = async () => {
    setShowDeleteSheet(false);
    if (compressedIds.length > 0) {
      // Space freed by removing the original (larger) videos.
      const freedMB = videos
        .filter((v) => compressedIds.includes(v.id))
        .reduce((sum, v) => sum + v.sizeMB, 0);

      // Free-tier gate — nur noch MB-basiert (100 MB gratis).
      if (!isPremium) {
        const wouldExceedMB = (user?.free_mb_used ?? 0) + freedMB > 100;
        if (wouldExceedMB) {
          router.push({ pathname: "/paywall", params: { reason: "limit" } });
          return;
        }
      }

      try {
        await MediaLibrary.deleteAssetsAsync(compressedIds);
        // Record so it shows up in Verlauf and counts against the free quota.
        await trackUsage(freedMB, compressedIds.length, "videos");
      } catch (e) { console.warn(e); }
    }
    setDone(true);
  };

  const handleKeepOriginals = () => { setShowDeleteSheet(false); setDone(true); };

  if (permDenied) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("video_compress_screen.header_title")} />
      <View style={s.center}><Ionicons name="videocam-off-outline" size={56} color="#C7C7CC" />
        <Text style={s.emptyTitle}>{t("video_compress_screen.no_access_title")}</Text>
        <Text style={s.emptySub}>{t("video_compress_screen.no_access_sub")}</Text>
      </View>
    </View>
  );

  if (loading) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("video_compress_screen.header_title")} />
      <View style={s.center}><ActivityIndicator size="large" color="#007AFF" />
        <Text style={s.loadingText}>{t("video_compress_screen.loading_videos")}</Text>
      </View>
    </View>
  );

  if (!loading && videos.length === 0) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("video_compress_screen.header_title")} />
      <View style={s.center}><Ionicons name="checkmark-circle" size={64} color="#34C759" />
        <Text style={s.emptyTitle}>{t("video_compress_screen.no_videos_title")}</Text>
        <Text style={s.emptySub}>{t("video_compress_screen.no_videos_sub")}</Text>
      </View>
    </View>
  );

  if (done && !compressing) {
    const doneCount = videos.filter((v) => v.status === "done").length;
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} title={t("video_compress_screen.header_title")} />
        <View style={s.center}>
          <Ionicons name="checkmark-circle" size={72} color="#34C759" />
          <Text style={s.successTitle}>{t("video_compress_screen.done_title")}</Text>
          <Text style={s.successSub}>{t("video_compress_screen.done_sub", { count: doneCount })}</Text>
          <View style={s.savedBadge}>
            <Text style={s.savedText}>{t("video_compress_screen.saved_badge", { size: formatSize(totalSavedMB) })}</Text>
          </View>
          <Pressable onPress={() => { setDone(false); loadVideos(); }} style={s.doneBtn} testID="compress-done-btn">
            <Text style={s.doneBtnText}>{t("video_compress_screen.more_btn")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} title={t("video_compress_screen.header_title")} />

      {/* Gratis-Nutzungen Badge */}
      <View style={s.usesBar}>
        {isPremium ? (
          <View style={[s.usesPill, s.usesPillPro]} testID="tool-uses-pill">
            <Ionicons name="diamond" size={13} color="#fff" />
            <Text style={[s.usesText, { color: "#fff" }]}>{t("tools.pro_unlimited")}</Text>
          </View>
        ) : (
          <View style={[s.usesPill, vcLocked && s.usesPillLocked]} testID="tool-uses-pill">
            <Ionicons name={vcLocked ? "lock-closed" : "flash"} size={13} color={vcLocked ? "#FF9500" : "#007AFF"} />
            <Text style={[s.usesText, vcLocked && { color: "#FF9500" }]}>
              {t("tools.free_uses_left", { count: vcRemaining })}
            </Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <Text style={s.statsText}>
          {t("video_compress_screen.stats_text", { count: videos.length, size: formatSize(videos.reduce((sum, v) => sum + v.sizeMB, 0)) })}
        </Text>
        <Pressable onPress={toggleAll} testID="select-all-btn">
          <Text style={s.selectAll}>
            {videos.filter(v => v.status === "idle").every((v) => v.selected)
              ? t("video_compress_screen.deselect_all")
              : t("video_compress_screen.select_all")}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        numColumns={COLS}
        contentContainerStyle={[s.grid, { paddingBottom: insets.bottom + 100 }]}
        columnWrapperStyle={{ gap: GAP }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: v }) => (
          <View style={{ width: CELL, marginBottom: GAP }}>
            {/* Thumbnail — Tap = Preview */}
            <Pressable
              onPress={() => !compressing && v.status === "idle" && setPreviewVideo(v)}
              testID={`video-preview-${v.id}`}
              style={{ position: "relative" }}
            >
              <View style={[s.thumbBox, { height: THUMB_H }]}>
                <AssetThumbnail
                  asset={{ id: v.id, uri: v.uri, width: v.width, height: v.height, fileSize: 0, mediaType: "video" }}
                  style={{ width: CELL, height: THUMB_H, borderRadius: 12 }}
                />
                {/* Duration badge */}
                <View style={s.durBadge}><Text style={s.durText}>{formatDur(v.duration)}</Text></View>

                {/* Play overlay — shows preview intent */}
                {v.status === "idle" && !v.selected && (
                  <View style={s.playHint}><Ionicons name="eye-outline" size={22} color="rgba(255,255,255,0.85)" /></View>
                )}

                {/* Compressing overlay */}
                {v.status === "compressing" && (
                  <View style={s.compressingOverlay}>
                    <Text style={s.overlayPct}>{v.progress}%</Text>
                    <View style={s.overlayTrack}>
                      <View style={[s.overlayFill, { width: `${v.progress}%` }]} />
                    </View>
                  </View>
                )}

                {/* Done overlay */}
                {v.status === "done" && (
                  <View style={s.doneOverlay}>
                    <Ionicons name="checkmark-circle" size={32} color="#34C759" />
                    <Text style={s.doneSaved}>−{formatSize(v.savedMB)}</Text>
                  </View>
                )}

                {/* Checkbox */}
                {v.status === "idle" && (
                  <Pressable
                    onPress={() => toggleItem(v.id)}
                    hitSlop={8}
                    testID={`video-check-${v.id}`}
                    style={[s.checkCircle, v.selected && s.checkCircleOn]}
                  >
                    {v.selected && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </Pressable>
                )}
              </View>
            </Pressable>
            {/* Info */}
            <Text style={s.cellName} numberOfLines={1}>{v.filename}</Text>
            <Text style={s.cellMeta}>~{formatSize(v.sizeMB)} · {v.width}×{v.height}</Text>
          </View>
        )}
      />

      {/* FAB */}
      {vcLocked ? (
        <Pressable
          onPress={() => router.push({ pathname: "/paywall", params: { reason: "feature", feature: "video_compress" } })}
          testID="tool-upgrade-fab"
          style={[s.fab, { backgroundColor: "#FF9500", bottom: insets.bottom + 16 }]}
        >
          <Ionicons name="lock-closed" size={18} color="#fff" />
          <Text style={s.fabText}>{t("tools.upgrade_unlimited")}</Text>
        </Pressable>
      ) : selectedVideos.length > 0 && !compressing ? (
        <Pressable onPress={startCompression} testID="start-compress-btn"
          style={[s.fab, { bottom: insets.bottom + 16 }]}>
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={s.fabText}>{t("video_compress_screen.compress_btn", { count: selectedVideos.length })}</Text>
        </Pressable>
      ) : null}

      {compressing && (
        <View style={[s.compressingBanner, { bottom: insets.bottom + 16 }]}>
          <View style={s.bannerLeft}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={s.compressingText}>
              {t("video_compress_screen.compressing_banner", {
                done: overallProgress.done, total: overallProgress.total,
                pct: overallProgress.total > 0
                  ? Math.round(((overallProgress.done * 100) + currentItemPct) / overallProgress.total)
                  : 0,
              })}
            </Text>
          </View>
          <TouchableOpacity testID="cancel-compress-btn" onPress={handleCancelCompression} style={s.cancelBtn} hitSlop={8}>
            <Ionicons name="stop-circle" size={26} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Video Preview Modal ── */}
      <Modal visible={!!previewVideo} animationType="slide" transparent={false} presentationStyle="fullScreen" onRequestClose={() => setPreviewVideo(null)}>
        {previewVideo && (
          <VideoPreviewModal
            video={previewVideo}
            isSelected={previewVideo.selected}
            onSelect={() => { toggleItem(previewVideo.id); setPreviewVideo(null); }}
            onClose={() => setPreviewVideo(null)}
          />
        )}
      </Modal>

      {/* Delete Sheet */}
      <Modal visible={showDeleteSheet} transparent animationType="slide" onRequestClose={handleKeepOriginals}>
        <Pressable style={s.sheetOverlay} onPress={handleKeepOriginals} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.sheetHandle} />
          <Ionicons name="checkmark-circle" size={40} color="#34C759" style={{ alignSelf: "center", marginBottom: 10 }} />
          <Text style={s.sheetTitle}>{t("video_compress_screen.delete_originals_title")}</Text>
          <Text style={s.sheetSub}>{t("video_compress_screen.delete_originals_sub")}</Text>
          <TouchableOpacity testID="delete-originals-btn" style={s.sheetDeleteBtn} onPress={handleDeleteOriginals}>
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={s.sheetDeleteText}>{t("video_compress_screen.delete_originals_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="keep-originals-btn" style={s.sheetKeepBtn} onPress={handleKeepOriginals}>
            <Text style={s.sheetKeepText}>{t("video_compress_screen.keep_originals_btn")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.backBtn} testID="back-btn">
        <Ionicons name="chevron-back" size={24} color="#007AFF" />
      </Pressable>
      <Text style={s.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ── Video Preview Modal — ph:// URI direkt (wie LiveVideoThumb) ──────────────
function VideoPreviewModal({
  video, isSelected, onSelect, onClose,
}: {
  video: VideoItem; isSelected: boolean; onSelect: () => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View style={[pv.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} hitSlop={10} testID="preview-close-btn">
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={pv.title} numberOfLines={1}>{video.filename}</Text>
          <Text style={pv.sub}>{formatDur(video.duration)} · ~{formatSize(video.sizeMB)} · {video.width}×{video.height}</Text>
        </View>
      </View>

      {/* ph:// URI direkt — kein getAssetInfoAsync nötig, wie LiveVideoThumb.native.tsx */}
      <View style={{ flex: 1, backgroundColor: "#111" }}>
        <VideoPreviewPlayer uri={video.uri} />
      </View>

      <View style={{ backgroundColor: "#000", paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 14, gap: 10 }}>
        <TouchableOpacity testID="preview-select-btn" style={[pv.selectBtn, isSelected && pv.selectBtnOn]} onPress={onSelect}>
          <Ionicons name={isSelected ? "checkmark-circle" : "radio-button-off-outline"} size={22} color={isSelected ? "#fff" : "#007AFF"} />
          <Text style={[pv.selectText, isSelected && { color: "#fff" }]}>{isSelected ? t("video_compress_screen.selected_label") : t("video_compress_screen.select_to_compress")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pv.closeActionBtn} onPress={onClose}>
          <Text style={pv.closeActionText}>{t("common.close")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pv = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10 },
  title: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorText: { color: "rgba(255,255,255,0.7)", fontSize: 15, marginTop: 16, textAlign: "center", fontWeight: "600" },
  errorSub: { color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 6, textAlign: "center" },
  selectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16, borderWidth: 2, borderColor: "#007AFF" },
  selectBtnOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  selectText: { fontSize: 16, fontWeight: "700", color: "#007AFF" },
  closeActionBtn: { height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  closeActionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

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
  thumbBox: { borderRadius: 12, overflow: "hidden", backgroundColor: "#F2F2F7", position: "relative" },
  durBadge: { position: "absolute", bottom: 6, left: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  durText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  playHint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  checkCircle: { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#fff", backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  checkCircleOn: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  compressingOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 10, paddingVertical: 8, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  overlayPct: { color: "#fff", fontSize: 13, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  overlayTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  overlayFill: { height: "100%", backgroundColor: "#007AFF", borderRadius: 2 },
  doneOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(52,199,89,0.25)", borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4 },
  doneSaved: { color: "#34C759", fontSize: 12, fontWeight: "800" },
  cellName: { fontSize: 11, color: "#000", fontWeight: "500", marginTop: 5, paddingHorizontal: 2 },
  cellMeta: { fontSize: 10, color: "#8E8E93", marginTop: 2, paddingHorizontal: 2 },
  fab: { position: "absolute", left: 16, right: 16, backgroundColor: "#007AFF", borderRadius: 16, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  compressingBanner: { position: "absolute", left: 16, right: 16, backgroundColor: "#5856D6", borderRadius: 16, height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  bannerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  compressingText: { color: "#fff", fontSize: 13, fontWeight: "700", flexShrink: 1 },
  cancelBtn: { padding: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  loadingText: { fontSize: 15, color: "#8E8E93", marginTop: 16, fontWeight: "500" },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginTop: 16 },
  emptySub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginTop: 8 },
  successTitle: { fontSize: 28, fontWeight: "800", color: "#000", letterSpacing: -0.5, marginTop: 12 },
  successSub: { fontSize: 16, color: "#8E8E93", marginTop: 8 },
  savedBadge: { backgroundColor: "#34C75920", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, marginTop: 16 },
  savedText: { fontSize: 18, fontWeight: "800", color: "#34C759" },
  doneBtn: { marginTop: 24, backgroundColor: "#007AFF", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
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
