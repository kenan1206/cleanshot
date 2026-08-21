import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TouchableOpacity, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
import GradientBackground from "@/src/components/GradientBackground";
import AssetThumbnail from "@/src/components/AssetThumbnail";
import { Category, PhotoAsset, formatSize, deleteAssets } from "@/src/utils/photos";
import { CATEGORY_META } from "@/src/components/CategoryCard";
import { scanStore } from "@/src/utils/scanStore";
import { startActiveTask, finishActiveTask, cancelActiveTask } from "@/src/utils/activeTask";
import MediaViewerModal, { ViewerMedia } from "@/src/components/MediaViewerModal";

const { width } = Dimensions.get("window");
const GRID_COLS = 3;
const GAP = 6;
const H_PAD = 16;
const TILE = (width - H_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;

// Dynamische Tile-Breite: bei 2 Fotos volle Hälfte, bei 3+ Drittel
// So bleibt NIE leerer Platz rechts
function tileWidth(numInRow: number): number {
  const n = Math.max(1, Math.min(numInRow, 3));
  return (width - H_PAD * 2 - GAP * (n - 1)) / n;
}
// Tile-Höhe: etwas größer als Breite für bessere Vorschau
function tileHeight(numInRow: number): number {
  return tileWidth(numInRow) * (numInRow <= 2 ? 1.15 : 1.05);
}

// A row is either a group header or a chunk of up to GRID_COLS photos. Chunking into
// fixed-size rows lets a plain (single-column) FlatList virtualize the grid — only rows
// near the viewport are ever mounted, so libraries with hundreds/thousands of photos
// don't try to decode every thumbnail at once (which was crashing the app with an
// out-of-memory kill on real devices with large photo libraries).
type Row =
  | { key: string; kind: "header"; label: string }
  | { key: string; kind: "assets"; assets: PhotoAsset[] };

export default function CategoryDetail() {
  const { type } = useLocalSearchParams<{ type: Category }>();
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, trackUsage, trackEvent } = useApp();
  const rc = useRevenueCat();
  const isPremium = rc.isSubscribed || !!user?.is_premium;

  const meta = CATEGORY_META[type as Category] ?? CATEGORY_META.duplicates;
  const accent = t.colors[meta.colorKey];
  const { results } = scanStore.get();
  const cr = results?.[type as Category];

  const flatAssets: PhotoAsset[] = useMemo(() => (cr ? cr.groups.flatMap((g) => g.assets) : []), [cr]);

  const rows: Row[] = useMemo(() => {
    if (!cr) return [];
    const out: Row[] = [];
    cr.groups.forEach((g, gi) => {
      if (cr.groups.length > 1) {
        out.push({ key: `h_${g.key}`, kind: "header", label: tr("categories.group_label", { n: gi + 1, count: g.assets.length, size: formatSize(g.estimatedSizeMB) }) });
      }
      for (let i = 0; i < g.assets.length; i += GRID_COLS) {
        out.push({ key: `r_${g.key}_${i}`, kind: "assets", assets: g.assets.slice(i, i + GRID_COLS) });
      }
    });
    return out;
  }, [cr]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);

  const enterSelectMode = useCallback((id?: string) => {
    setSelectMode(true);
    if (id) {
      Haptics.selectionAsync().catch(() => {});
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  // Alle Assets als ViewerMedia für den Viewer
  const viewerItems: ViewerMedia[] = useMemo(
    () => flatAssets.map((a) => ({
      id: a.id,
      uri: a.uri,
      type: a.mediaType === "video" ? "video" : "image",
    })),
    [flatAssets],
  );

  const toggleAll = () => {
    Haptics.selectionAsync().catch(() => {});
    if (selected.size === flatAssets.length) setSelected(new Set());
    else setSelected(new Set(flatAssets.map((a) => a.id)));
  };

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedAssets = useMemo(
    () => flatAssets.filter((a) => selected.has(a.id)),
    [flatAssets, selected],
  );
  const totalMB = useMemo(() => selectedAssets.reduce((s, a) => s + a.estimatedSizeMB, 0), [selectedAssets]);

  const [deleting, setDeleting] = useState(false);

  const doDelete = useCallback(async () => {
    if (selectedAssets.length === 0) return;

    // Free tier limit — nur noch MB-basiert (100 MB gratis)
    if (!isPremium) {
      const wouldExceedMB = (user?.free_mb_used ?? 0) + totalMB > 100;
      if (wouldExceedMB) {
        trackEvent("free_limit_hit", { category: type });
        const remainingMB = Math.max(0, 100 - Math.round(user?.free_mb_used ?? 0));
        router.push({ pathname: "/paywall", params: { reason: "limit", file_mb: Math.round(totalMB), remaining_mb: remainingMB } });
        return;
      }
    }

    setDeleting(true);
    await startActiveTask(tr("notifications.task_delete"));
    trackEvent("delete_start", { category: type, count: selectedAssets.length, mb: totalMB });
    try {
      const ids = selectedAssets.map((a) => a.id);
      const ok = await deleteAssets(ids);
      if (!ok) {
        cancelActiveTask();
        setDeleting(false);
        return;
      }
      scanStore.removeIds(new Set(ids));
      const { limit_reached } = await trackUsage(totalMB, selectedAssets.length, String(type));
      await finishActiveTask(
        tr("notifications.delete_done_title", { count: selectedAssets.length }),
        tr("notifications.delete_done_body", { size: formatSize(totalMB) }),
      );
      trackEvent("delete_success", { category: type, count: selectedAssets.length, mb: totalMB });
      router.replace({
        pathname: "/success",
        params: {
          mb: String(Math.round(totalMB * 10) / 10),
          count: String(selectedAssets.length),
          limit_reached: limit_reached ? "1" : "0",
          category: String(type), // damit "weiter aufräumen" zurück zur gleichen Kategorie führt
        },
      });
    } catch {
      cancelActiveTask();
      trackEvent("delete_error", { category: type });
    } finally {
      setDeleting(false);
    }
  }, [selectedAssets, totalMB, user, type, router, trackUsage, trackEvent]);

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === "header") {
        return (
          <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginBottom: 8, paddingHorizontal: 4 }]}>
            {item.label}
          </Text>
        );
      }
      return (
        <View style={styles.grid}>
          {item.assets.map((a) => {
            const isSel = selected.has(a.id);
            const n = item.assets.length;
            const tw = tileWidth(n);
            const th = tileHeight(n);
            const assetIdx = flatAssets.indexOf(a);
            return (
              <View
                key={a.id}
                style={[
                  styles.tile,
                  {
                    width: tw,
                    height: th,
                    borderColor: isSel ? accent : "transparent",
                    backgroundColor: t.colors.surfaceTertiary,
                  },
                ]}
              >
                {/* Bild-Tap → Viewer öffnen ODER auswählen (je nach Modus) */}
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    if (selectMode) {
                      Haptics.selectionAsync().catch(() => {});
                      toggle(a.id);
                    } else if (assetIdx >= 0) {
                      setViewerIndex(assetIdx);
                    }
                  }}
                  testID={`thumb-${a.id}`}
                >
                  <AssetThumbnail asset={a} style={styles.tileImg} />
                </Pressable>

                {/* Video-Badge */}
                {a.mediaType === "video" && (
                  <View style={styles.videoTag} pointerEvents="none">
                    <Ionicons name="play" size={10} color="#fff" />
                  </View>
                )}

                {/* ── Auswahl-Kreis (Apple Photos Stil) ── */}
                <TouchableOpacity
                  style={styles.selCircleBtn}
                  onPress={() => enterSelectMode(a.id)}
                  hitSlop={8}
                  testID={`select-${a.id}`}
                >
                  <View style={[styles.selCircle, isSel && { backgroundColor: accent, borderColor: accent }]}>
                    {isSel && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      );
    },
    [selected, selectMode, accent, t, flatAssets, setViewerIndex, toggle],
  );

  return (
    <>
    <GradientBackground>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {selectMode ? (
            <Pressable onPress={exitSelectMode} testID="category-cancel-select" hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="close" size={26} color={t.colors.onSurface} />
            </Pressable>
          ) : (
            <Pressable onPress={() => router.back()} testID="category-back" hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={22} color={t.colors.onSurface} />
            </Pressable>
          )}
          <View style={{ flex: 1, alignItems: "center" }}>
            {selectMode && selected.size > 0 ? (
              <Text style={[t.type.title, { color: t.colors.onSurface }]}>{selected.size} ausgewählt</Text>
            ) : (
              <>
                <Text style={[t.type.micro, { color: accent }]}>{formatSize(cr?.totalSizeMB ?? 0)} · {cr?.totalItems ?? 0} {tr("categories.selected_label", { count: cr?.totalItems ?? 0 }).replace(/^\d+\s*/, "")}</Text>
                <Text style={[t.type.title, { color: t.colors.onSurface }]}>{tr(meta.titleKey)}</Text>
              </>
            )}
          </View>
          {selectMode ? (
            <Pressable onPress={toggleAll} testID="category-select-all" hitSlop={12} style={styles.headerBtn}>
              <Text style={[t.type.caption, { color: accent, fontWeight: "700" }]}>
                {selected.size === flatAssets.length ? "Keine" : "Alle"}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => enterSelectMode()} testID="category-enter-select" hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="checkmark-circle-outline" size={24} color={accent} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={{
            paddingHorizontal: H_PAD,
            paddingBottom: insets.bottom + 140,
            paddingTop: 12,
            gap: 12,
          }}
          testID="category-scroll"
          // Virtualization tuning: only keep a small window of rows mounted so we never
          // try to decode hundreds of thumbnails at once (was causing an OOM kill on
          // real devices with large photo libraries).
          initialNumToRender={9}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80 }} testID="category-empty">
              <View style={[styles.emptyIcon, { backgroundColor: accent + "22" }]}>
                <Ionicons name="checkmark-circle-outline" size={44} color={accent} />
              </View>
              <Text style={[t.type.title, { color: t.colors.onSurface, marginTop: 12 }]}>{tr("categories.all_clean_title")}</Text>
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 6 }]}>
                {tr("categories.all_clean_sub", { category: tr(meta.titleKey).toLowerCase() })}
              </Text>
            </View>
          }
        />

        {/* Floating action bar */}
        {flatAssets.length > 0 && (
          <View style={[styles.actionBar, { bottom: insets.bottom + 16 }]}>
            <View
              style={[
                styles.actionBarInner,
                {
                  backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.75)",
                  borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                },
                t.shadow(3),
              ]}
            >
              <BlurView intensity={40} tint={t.mode === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
              <View style={{ flex: 1, paddingLeft: 20 }}>
                <Text style={[t.type.title, { color: t.colors.onSurface }]}>{formatSize(totalMB)}</Text>
                <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>
                  {tr("categories.selected_label", { count: selected.size })}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, paddingRight: 8, alignItems: "center" }}>
                <Pressable
                  onPress={() => router.push(`/swipe/${String(type)}`)}
                  style={[styles.swipeBtn, { backgroundColor: accent + "22", borderColor: accent + "44" }]}
                  testID="category-open-swipe"
                >
                  <Ionicons name="layers" size={22} color={accent} />
                </Pressable>
                <Pressable
                  onPress={doDelete}
                  disabled={deleting || selected.size === 0}
                  testID="category-delete-btn"
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      backgroundColor: t.colors.error,
                      opacity: selected.size === 0 ? 0.4 : pressed ? 0.85 : 1,
                    },
                    t.shadow(2),
                  ]}
                >
                  <Ionicons name="trash-outline" size={24} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </GradientBackground>
    <MediaViewerModal
      items={viewerItems}
      initialIndex={viewerIndex}
      visible={viewerIndex >= 0}
      onClose={() => setViewerIndex(-1)}
    />
  </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  tile: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 3,
  },
  tileImg: {
    width: "100%",
    height: "100%",
  },
  // Apple-Photos Auswahl-Kreis
  selCircleBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  selCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBar: {
    position: "absolute",
    left: 16,
    right: 16,
  },
  actionBarInner: {
    height: 72,
    borderRadius: 36,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  swipeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  deleteBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
