import React, { useCallback, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable, Platform, Modal, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  FadeIn,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
import GradientBackground from "@/src/components/GradientBackground";
import AppButton from "@/src/components/AppButton";
import AssetThumbnail from "@/src/components/AssetThumbnail";
import { CATEGORY_META } from "@/src/components/CategoryCard";
import { Category, PhotoAsset, formatSize, deleteAssets } from "@/src/utils/photos";
import { scanStore } from "@/src/utils/scanStore";

const { width, height } = Dimensions.get("window");
const CARD_W = width - 40;
const CARD_H = height * 0.62;
const SWIPE_THRESHOLD = width * 0.28;

export default function SwipeCleaner() {
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
  const initialAssets: PhotoAsset[] = useMemo(
    () => (results?.[type as Category]?.groups ?? []).flatMap((g) => g.assets),
    [results, type],
  );

  const [index, setIndex] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<PhotoAsset[]>([]);
  const [saved, setSaved] = useState(0);
  const [freedMB, setFreedMB] = useState(0);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const finishedRef = useRef(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const current = initialAssets[index];
  const nextAsset = initialAssets[index + 1];

  const advance = useCallback(
    (dir: "left" | "right") => {
      const a = current;
      if (!a) return;
      if (dir === "left") {
        setPendingDelete((prev) => [...prev, a]);
        setFreedMB((v) => v + a.estimatedSizeMB);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      } else {
        setSaved((s) => s + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setIndex((i) => i + 1);
      translateX.value = 0;
      translateY.value = 0;
    },
    [current, translateX, translateY],
  );

  // Zurück-Button: warnen wenn noch pending deletes
  const handleBack = useCallback(() => {
    if (pendingDelete.length > 0) {
      setShowAbortConfirm(true);
    } else {
      router.back();
    }
  }, [pendingDelete.length, router]);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX < 0 ? "left" : "right";
        if (dir === "left") {
          translateX.value = withTiming(-width * 1.5, { duration: 200 });
          translateY.value = withTiming(e.translationY, { duration: 200 });
          runOnJS(advance)("left");
        } else {
          translateX.value = withTiming(width * 1.5, { duration: 200 });
          translateY.value = withTiming(e.translationY, { duration: 200 });
          runOnJS(advance)("right");
        }
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const topCardStyle = useAnimatedStyle(() => {
    const rot = interpolate(translateX.value, [-width, 0, width], [-12, 0, 12], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotateZ: `${rot}deg` },
      ],
    };
  });

  const keepBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD / 2, SWIPE_THRESHOLD], [0, 0.5, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0.8, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const deleteBadgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, -SWIPE_THRESHOLD / 2, 0], [1, 0.5, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0.8], Extrapolation.CLAMP),
      },
    ],
  }));

  const nextCardStyle = useAnimatedStyle(() => {
    const dist = Math.abs(translateX.value);
    const scale = interpolate(dist, [0, width * 0.6], [0.94, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const commit = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const totalMB = pendingDelete.reduce((s, a) => s + a.estimatedSizeMB, 0);
    if (pendingDelete.length === 0) {
      router.replace({ pathname: "/success", params: { mb: "0", count: "0", limit_reached: "0", category: String(type) } });
      return;
    }

    // Free-tier gating — nur noch MB-basiert (100 MB gratis)
    if (!isPremium) {
      const wouldExceedMB = (user?.free_mb_used ?? 0) + totalMB > 100;
      if (wouldExceedMB) {
        finishedRef.current = false;
        trackEvent("free_limit_hit", { category: type, source: "swipe" });
        const remainingMB = Math.max(0, 100 - Math.round(user?.free_mb_used ?? 0));
        router.push({ pathname: "/paywall", params: { reason: "limit", file_mb: Math.round(totalMB), remaining_mb: remainingMB } });
        return;
      }
    }

    trackEvent("delete_start", { category: type, count: pendingDelete.length, mb: totalMB, source: "swipe" });
    const ids = pendingDelete.map((a) => a.id);
    const ok = await deleteAssets(ids);
    if (!ok) {
      finishedRef.current = false;
      return;
    }
    scanStore.removeIds(new Set(ids));
    const { limit_reached } = await trackUsage(totalMB, pendingDelete.length, String(type));
    trackEvent("delete_success", { category: type, count: pendingDelete.length, mb: totalMB, source: "swipe" });
    router.replace({
      pathname: "/success",
      params: {
        mb: String(Math.round(totalMB * 10) / 10),
        count: String(pendingDelete.length),
        limit_reached: limit_reached ? "1" : "0",
        category: String(type),
      },
    });
  }, [pendingDelete, user, router, trackUsage, trackEvent, type]);

  const done = index >= initialAssets.length;

  return (
    <>
    <GradientBackground>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleBack} testID="swipe-back" hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="close" size={26} color={t.colors.onSurface} />
        </Pressable>
        <View style={{ alignItems: "center", flex: 1 }}>
          <Text style={[t.type.micro, { color: accent }]}>{tr(meta.titleKey).toUpperCase()}</Text>
          <Text style={[t.type.title, { color: t.colors.onSurface }]}>
            {done ? tr("common.done") : tr("swipe.counter", { current: index + 1, total: initialAssets.length })}
          </Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Freed pill */}
      <View style={styles.freedPillWrap}>
        <View
          style={[
            styles.freedPill,
            {
              backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.7)",
              borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <BlurView intensity={30} tint={t.mode === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Ionicons name="rocket" size={14} color={t.colors.success} />
          <Text style={[t.type.caption, { color: t.colors.onSurface, fontWeight: "700" }]}>
            {tr("swipe.freed", { size: formatSize(freedMB) })}
          </Text>
          <View style={styles.pillDivider} />
          <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>{tr("swipe.kept", { count: saved })}</Text>
        </View>
      </View>

      {/* Card stack */}
      <View style={styles.stack} pointerEvents={done ? "none" : "auto"}>
        {done && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.doneWrap}>
            <View style={[styles.doneIcon, { backgroundColor: accent + "22" }]}>
              <Ionicons name="checkmark-circle" size={64} color={accent} />
            </View>
            <Text style={[t.type.h1, { color: t.colors.onSurface, marginTop: 16, textAlign: "center" }]}>
              {tr("swipe.done_title")}
            </Text>
            <Text
              style={[
                t.type.body,
                { color: t.colors.onSurfaceTertiary, marginTop: 8, textAlign: "center", paddingHorizontal: 32 },
              ]}
            >
              {tr("swipe.done_sub", { count: pendingDelete.length, size: formatSize(freedMB) })}
            </Text>
          </Animated.View>
        )}

        {!done && nextAsset && (
          <Animated.View style={[styles.card, nextCardStyle, { position: "absolute" }]}>
            <View style={[styles.cardInner, { backgroundColor: t.colors.surfaceTertiary }]}>
              <AssetThumbnail key={nextAsset.id} asset={nextAsset} style={styles.cardImg} />
            </View>
          </Animated.View>
        )}

        {!done && current && (
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.card, topCardStyle]}>
              <View style={[styles.cardInner, { backgroundColor: t.colors.surfaceTertiary }]}>
                <AssetThumbnail key={current.id} asset={current} style={styles.cardImg} />

                {/* Delete badge (left swipe) */}
                <Animated.View style={[styles.badge, styles.badgeLeft, deleteBadgeStyle]}>
                  <View style={[styles.badgePill, { borderColor: t.colors.error }]}>
                    <Text style={[styles.badgeText, { color: t.colors.error }]}>{tr("swipe.delete_stamp")}</Text>
                  </View>
                </Animated.View>

                {/* Keep badge (right swipe) */}
                <Animated.View style={[styles.badge, styles.badgeRight, keepBadgeStyle]}>
                  <View style={[styles.badgePill, { borderColor: t.colors.success }]}>
                    <Text style={[styles.badgeText, { color: t.colors.success }]}>{tr("swipe.keep_stamp")}</Text>
                  </View>
                </Animated.View>

                {/* Meta */}
                <View style={styles.metaOverlay}>
                  <Text style={styles.metaText}>{formatSize(current.estimatedSizeMB)}</Text>
                  {current.mediaType === "video" && (
                    <View style={styles.videoBadge}>
                      <Ionicons name="videocam" size={12} color="#fff" />
                      <Text style={styles.videoBadgeText}>{Math.round(current.duration)}s</Text>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {!done ? (
          <>
            {/* Floating commit bar — zeigt sich sobald etwas markiert ist */}
            {pendingDelete.length > 0 && (
              <Pressable
                testID="swipe-commit-early"
                onPress={commit}
                style={[sw.earlyCommitBar, { marginBottom: 12 }]}
              >
                <Ionicons name="trash" size={16} color="#fff" />
                <Text style={sw.earlyCommitText}>
                  {pendingDelete.length} Foto{pendingDelete.length > 1 ? "s" : ""} löschen ({formatSize(freedMB)})
                </Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
              </Pressable>
            )}
            <View style={styles.controlRow}>
              <Pressable
                onPress={() => current && advance("left")}
                testID="swipe-delete-btn"
                style={({ pressed }) => [
                  styles.circleBtn,
                  {
                    backgroundColor: t.colors.error,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                  t.shadow(3),
                ]}
              >
                <Ionicons name="trash" size={26} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => advance("right")}
                testID="swipe-keep-btn"
                style={({ pressed }) => [
                  styles.circleBtn,
                  {
                    backgroundColor: t.colors.success,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                  t.shadow(3),
                ]}
              >
                <Ionicons name="heart" size={26} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            <AppButton
              label={pendingDelete.length > 0 ? tr("swipe.commit_delete", { count: pendingDelete.length, size: formatSize(freedMB) }) : tr("swipe.commit_back")}
              onPress={commit}
              variant={pendingDelete.length > 0 ? "danger" : "primary"}
              testID="swipe-commit"
            />
          </View>
        )}
      </View>
    </GradientBackground>

      {/* ── Lösch-Bestätigung Bottom Sheet ── */}
      {/* Abbrechen-Warnung wenn pending deletes vorhanden */}
      <Modal
        visible={showAbortConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAbortConfirm(false)}
      >
        <Pressable style={sw.sheetOverlay} onPress={() => setShowAbortConfirm(false)} />
        <View style={[sw.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={sw.handle} />
          <Ionicons name="trash-outline" size={36} color="#FF3B30" style={{ alignSelf: "center", marginBottom: 12 }} />
          <Text style={sw.sheetTitle}>
            {pendingDelete.length} Foto{pendingDelete.length > 1 ? "s" : ""} zum Löschen markiert
          </Text>
          <Text style={sw.sheetSub}>
            Jetzt löschen oder verwerfen?
          </Text>
          <TouchableOpacity
            style={sw.deleteBtn}
            onPress={() => { setShowAbortConfirm(false); commit(); }}
            testID="abort-confirm-delete"
          >
            <Text style={sw.deleteBtnText}>
              Jetzt löschen ({formatSize(freedMB)})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={sw.cancelBtn}
            onPress={() => { setShowAbortConfirm(false); router.back(); }}
            testID="abort-discard"
          >
            <Text style={[sw.cancelBtnText, { color: "#FF3B30" }]}>Verwerfen &amp; zurück</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  freedPillWrap: {
    alignItems: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  freedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillDivider: {
    width: 1,
    height: 12,
    backgroundColor: "rgba(128,128,128,0.35)",
    marginHorizontal: 4,
  },
  stack: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 28,
  },
  cardInner: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  cardImg: {
    width: "100%",
    height: "100%",
  },
  badge: {
    position: "absolute",
    top: 24,
  },
  badgeLeft: {
    right: 24,
  },
  badgeRight: {
    left: 24,
  },
  badgePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  badgeText: {
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1,
  },
  metaOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 4,
  },
  videoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  videoBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  bottom: {
    paddingTop: 12,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
  },
  circleBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  doneWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  doneIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
});


const sw = StyleSheet.create({
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", alignSelf: "center", marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: "#000", textAlign: "center", marginBottom: 6 },
  sheetSub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginBottom: 24 },
  deleteBtn: { backgroundColor: "#FF3B30", borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  deleteBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancelBtn: { borderRadius: 14, height: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#F2F2F7" },
  cancelBtnText: { color: "#000", fontSize: 16, fontWeight: "600" },
  earlyCommitBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, height: 48, borderRadius: 14, backgroundColor: "#FF3B30", paddingHorizontal: 16 },
  earlyCommitText: { color: "#fff", fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
});
