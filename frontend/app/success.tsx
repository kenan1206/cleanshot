import React, { useEffect } from "react";
import { View, Text, StyleSheet, Share, Linking, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import GradientBackground from "@/src/components/GradientBackground";
import AppButton from "@/src/components/AppButton";
import GlassCard from "@/src/components/GlassCard";
import { formatSize } from "@/src/utils/photos";
import { scanStore } from "@/src/utils/scanStore";
import { ensureNotificationPermission, scheduleCleanUNotifications } from "@/src/utils/notifications";

export default function Success() {
  const { mb, count, limit_reached, category } = useLocalSearchParams<{ mb?: string; count?: string; limit_reached?: string; category?: string }>();
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { trackEvent, user } = useApp();

  const freedMB = parseFloat(String(mb ?? "0"));
  const cleanedCount = parseInt(String(count ?? "0"), 10);
  const limitReached = String(limit_reached ?? "0") === "1";

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    trackEvent("success_screen_view", { mb: freedMB, count: cleanedCount });

    // After a real cleanup: ask for notification permission (first time) and (re)schedule
    // the local reminder set — "hey, du kannst X freigeben", weekly report, etc.
    if (cleanedCount > 0) {
      (async () => {
        const granted = await ensureNotificationPermission();
        if (!granted) return;
        const results = scanStore.get().results;
        const reclaimableMB = results
          ? Object.values(results).reduce((s, r) => s + (r?.totalSizeMB ?? 0), 0)
          : 0;
        await scheduleCleanUNotifications({
          reclaimableMB,
          weekFreedMB: freedMB,
          mbUsed: user?.free_mb_used ?? 0,
        });
      })();
    }
  }, [freedMB, cleanedCount, trackEvent, user]);

  const shareWin = async () => {
    trackEvent("share_win_tap");
    try {
      await Share.share({
        message: tr("success.share_message", { size: formatSize(freedMB) }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <GradientBackground>
      <View style={{ flex: 1, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Animated.View entering={ZoomIn.duration(500)} style={styles.iconWrap}>
            <View style={[styles.iconOuter, { backgroundColor: t.colors.success + "22", borderColor: t.colors.success + "44" }]}>
              <View style={[styles.iconInner, { backgroundColor: t.colors.success }]}>
                <Ionicons name="checkmark" size={64} color="#fff" />
              </View>
            </View>
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.duration(500).delay(200)}
            style={[t.type.micro, { color: t.colors.success, marginTop: 32 }]}
          >
            {tr("success.eyebrow")}
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.duration(500).delay(300)}
            style={[t.type.hero, { color: t.colors.onSurface, marginTop: 4, textAlign: "center" }]}
            testID="success-mb"
          >
            {formatSize(freedMB)}
          </Animated.Text>

          <Animated.View entering={FadeIn.duration(500).delay(500)} style={{ width: "100%", marginTop: 32 }}>
            <GlassCard>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={[t.type.title, { color: t.colors.onSurface }]}>{cleanedCount}</Text>
                  <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>{tr("success.items_removed")}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.stat}>
                  <Text style={[t.type.title, { color: t.colors.success }]}>+{formatSize(freedMB)}</Text>
                  <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>{tr("success.reclaimed")}</Text>
                </View>
              </View>
            </GlassCard>
          </Animated.View>

          {limitReached && !user?.is_premium && (
            <Animated.View entering={FadeIn.duration(400).delay(700)} style={{ marginTop: 20 }}>
              <View style={[styles.limitBanner, { borderColor: t.colors.warning + "55", backgroundColor: t.colors.warning + "18" }]}>
                <Ionicons name="warning" size={18} color={t.colors.warning} />
                <Text style={[t.type.caption, { color: t.colors.onSurface, flex: 1 }]}>
                  {tr("success.limit_banner")}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Papierkorb-Hinweis */}
          {cleanedCount > 0 && (
            <Animated.View entering={FadeIn.duration(400).delay(800)} style={{ marginTop: 16, width: "100%" }}>
              <Pressable
                onPress={() => Linking.openURL("photos-redirect://")}
                testID="success-trash-hint"
                style={({ pressed }) => [styles.trashHint, { opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.trashHintIcon}>
                  <Ionicons name="trash-outline" size={22} color="#FF9500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trashHintTitle}>{tr("success.trash_hint_title")}</Text>
                  <Text style={styles.trashHintSub}>{tr("success.trash_hint_sub")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#FF9500" />
              </Pressable>
            </Animated.View>
          )}
        </View>

        <Animated.View entering={FadeInDown.duration(400).delay(600)} style={{ gap: 10 }}>
          {limitReached && !user?.is_premium ? (
            <AppButton label={tr("success.upgrade")} onPress={() => router.replace("/paywall")} testID="success-upgrade" />
          ) : (
            <AppButton label={tr("success.continue")} onPress={() => {
              if (category) {
                router.replace(`/category/${category}` as any);
              } else {
                router.back();
              }
            }} testID="success-continue" />
          )}
          <AppButton label={tr("success.share")} onPress={shareWin} variant="secondary" testID="success-share" />
        </Animated.View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
  },
  iconOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(128,128,128,0.25)",
  },
  limitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  trashHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,149,0,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,149,0,0.3)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  trashHintIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,149,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  trashHintTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF9500",
    marginBottom: 2,
  },
  trashHintSub: {
    fontSize: 12,
    color: "#8E8E93",
    lineHeight: 16,
  },
});
