import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import type { PurchasesPackage } from "react-native-purchases";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat, rcEnabled } from "@/src/lib/revenuecat";
import AppButton from "@/src/components/AppButton";
import { useOfferCountdown } from "@/src/utils/offerCountdown";

type Plan = "lifetime" | "weekly";

const BENEFITS: Benefit[] = [
  { icon: "infinite", titleKey: "paywall.benefit_unlimited_title", subKey: "paywall.benefit_unlimited_sub" },
  { icon: "sparkles", titleKey: "paywall.benefit_smart_title", subKey: "paywall.benefit_smart_sub" },
  { icon: "flame", titleKey: "paywall.benefit_compress_title", subKey: "paywall.benefit_compress_sub" },
  { icon: "flash", titleKey: "paywall.benefit_priority_title", subKey: "paywall.benefit_priority_sub" },
  { icon: "shield-checkmark", titleKey: "paywall.benefit_private_title", subKey: "paywall.benefit_private_sub" },
];

export default function Paywall() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reason, file_mb, remaining_mb } = useLocalSearchParams<{ reason?: string; file_mb?: string; remaining_mb?: string }>();
  const { trackEvent, user } = useApp();
  const rc = useRevenueCat();
  const { isActive: isOfferActive, label: countdown } = useOfferCountdown();

  const [plan, setPlan] = useState<Plan>("lifetime");
  const [loading, setLoading] = useState(false);

  const mbUsed = Math.round(user?.free_mb_used ?? 0);
  const isFeatureLimit = String(reason) === "feature";
  const fileMB = file_mb ? Math.round(Number(file_mb)) : null;
  const remainingMB = remaining_mb ? Math.round(Number(remaining_mb)) : Math.max(0, 100 - mbUsed);
  const isOversize = fileMB !== null && fileMB > remainingMB;
  const isPremium = rc.isSubscribed || !!user?.is_premium;
  const showLimit = !isPremium && (isFeatureLimit || String(reason) === "limit" || mbUsed >= 100);

  const offering = rc.offerings?.current;

  // Offer package (19,99€) — nur während Countdown
  const offerPackage = offering?.availablePackages.find(
    (p) => p.identifier === "lifetime_offer"
  );
  // Regular lifetime (34,99€)
  const regularLifetimePackage = offering?.availablePackages.find(
    (p) => p.identifier === "$rc_lifetime" || (p.packageType === "LIFETIME" && p.identifier !== "lifetime_offer")
  );
  const weeklyPackage = offering?.availablePackages.find(
    (p) => p.packageType === "WEEKLY" || p.identifier === "$rc_weekly" || p.identifier.toLowerCase().includes("week")
  );

  // Welches Lifetime-Package aktiv?
  const lifetimePackage = isOfferActive && offerPackage ? offerPackage : regularLifetimePackage;
  const selectedPackage = plan === "lifetime" ? lifetimePackage : weeklyPackage;

  useEffect(() => {
    trackEvent("paywall_view");
  }, [trackEvent]);

  const close = () => {
    trackEvent("paywall_dismiss");
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const doSubscribe = async () => {
    if (loading || rc.isPurchasing) return;
    if (!selectedPackage) {
      Alert.alert(tr("paywall.not_available_title"), tr("paywall.not_available_sub"));
      return;
    }
    setLoading(true);
    trackEvent("subscribe_start", { plan });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      await rc.purchase(selectedPackage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      trackEvent("subscribe_success", { plan });
      Alert.alert(tr("paywall.success_title"), tr("paywall.success_sub"));
      router.replace("/(tabs)");
    } catch (e: any) {
      // userCancelled = silent, anything else = show error
      if (!e?.userCancelled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert(tr("paywall.purchase_failed"), tr("paywall.purchase_failed_sub"));
      }
    } finally {
      setLoading(false);
    }
  };

  const doRestore = async () => {
    trackEvent("paywall_restore_tap");
    try {
      const info = await rc.restore();
      const active = info.entitlements.active?.["CleanU Pro"];
      Alert.alert(tr("paywall.success_title"), active ? tr("paywall.success_sub") : tr("paywall.purchase_failed_sub"));
      if (active) router.replace("/(tabs)");
    } catch {
      Alert.alert(tr("paywall.purchase_failed"), tr("paywall.purchase_failed_sub"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }} testID="paywall-screen">
      <LinearGradient
        colors={
          t.mode === "dark"
            ? (["#0A1128", "#001F54", "#0A1128"] as const)
            : (["#F0F8FF", "#DCEDFF", "#F0F8FF"] as const)
        }
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 220, paddingHorizontal: 24 }}
      >
        <View style={styles.topRow}>
          <Pressable onPress={close} testID="paywall-close" hitSlop={16} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={t.colors.onSurface} />
          </Pressable>
        </View>

        {showLimit && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={[
              styles.limitBanner,
              { backgroundColor: t.colors.error + "18", borderColor: t.colors.error + "55" },
            ]}
            testID="paywall-limit-banner"
          >
            <Ionicons name="alert-circle" size={22} color={t.colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={[t.type.body, { color: t.colors.onSurface, fontWeight: "800" }]}>
                {isFeatureLimit
                  ? tr("paywall.feature_limit_title")
                  : isOversize
                  ? tr("paywall.oversize_title")
                  : tr("paywall.limit_title")}
              </Text>
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>
                {isFeatureLimit
                  ? tr("paywall.feature_limit_sub")
                  : isOversize
                  ? tr("paywall.oversize_sub", { file_mb: fileMB, remaining_mb: remainingMB })
                  : tr("paywall.limit_sub", { mb: mbUsed, mb_limit: 100 })}
              </Text>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: "center", marginTop: 20 }}>
          <View style={[styles.crown, { backgroundColor: t.colors.brandPrimary + "22", borderColor: t.colors.brandPrimary + "44" }]}>
            <Ionicons name="diamond" size={40} color={t.colors.brandPrimary} />
          </View>
          <Text style={[t.type.micro, { color: t.colors.brandPrimary, marginTop: 20 }]}>{tr("paywall.eyebrow")}</Text>
          <Text style={[t.type.h1, { color: t.colors.onSurface, textAlign: "center", marginTop: 6 }]}>
            {tr("paywall.hero_title")}
          </Text>
          <Text
            style={[
              t.type.body,
              { color: t.colors.onSurfaceTertiary, textAlign: "center", marginTop: 10, paddingHorizontal: 12 },
            ]}
          >
            {tr("paywall.hero_sub")}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={{ marginTop: 28, gap: 12 }}>
          {BENEFITS.map((b) => (
            <View
              key={b.titleKey}
              style={[
                styles.benefit,
                {
                  backgroundColor: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)",
                  borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              <View style={[styles.benefitIcon, { backgroundColor: t.colors.brandPrimary + "22" }]}>
                <Ionicons name={b.icon} size={20} color={t.colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[t.type.body, { color: t.colors.onSurface, fontWeight: "700" }]}>{tr(b.titleKey)}</Text>
                <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>{tr(b.subKey)}</Text>
              </View>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(300)} style={{ marginTop: 24, gap: 12 }}>
          {/* 🔥 Countdown-Banner */}
          {isOfferActive && offerPackage && (
            <View style={styles.offerBanner}>
              <LinearGradient colors={["#FF6B00", "#FF3B30"]} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill} />
              <Ionicons name="flame" size={18} color="#fff" />
              <View style={{flex:1}}>
                <Text style={styles.offerBannerTitle}>{tr("paywall.offer_title")}</Text>
                <Text style={styles.offerBannerSub}>{tr("paywall.offer_sub")}</Text>
              </View>
              <View style={styles.offerTimer}>
                <Text style={styles.offerTimerText}>{countdown}</Text>
              </View>
            </View>
          )}

          {rc.isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 10 }}>
              <ActivityIndicator size="small" color={t.colors.brandPrimary} />
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>
                {tr("paywall.loading_plans")}
              </Text>
            </View>
          ) : (
            <>
          <PlanCard
            selected={plan === "lifetime"}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setPlan("lifetime"); }}
            title={tr("paywall.plan_lifetime_title")}
            price={lifetimePackage?.product.priceString ?? (isOfferActive ? "19,99 €" : tr("paywall.plan_lifetime_price"))}
            originalPrice={isOfferActive && offerPackage && regularLifetimePackage ? regularLifetimePackage.product.priceString ?? tr("paywall.plan_lifetime_price") : undefined}
            perLabel={tr("paywall.plan_lifetime_per")}
            perDay={tr("paywall.plan_lifetime_sub")}
            badge={isOfferActive && offerPackage ? tr("paywall.offer_badge") : tr("paywall.plan_lifetime_badge")}
            isOffer={isOfferActive && !!offerPackage}
            testID="paywall-plan-lifetime"
          />
          <PlanCard
            selected={plan === "weekly"}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setPlan("weekly"); }}
            title={tr("paywall.plan_weekly_title")}
            price={weeklyPackage?.product.priceString ?? tr("paywall.plan_weekly_price")}
            perLabel={tr("paywall.plan_weekly_per")}
            perDay={
              weeklyPackage?.product.introPrice
                ? `${weeklyPackage.product.introPrice.periodNumberOfUnits} ${tr("paywall.trial_days_label")} • ${weeklyPackage.product.priceString}/${tr("paywall.per_week_short")}`
                : tr("paywall.plan_weekly_trial_sub")
            }
            badge={tr("paywall.plan_weekly_trial_badge")}
            testID="paywall-plan-weekly"
          />
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <BlurView intensity={40} tint={t.mode === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: t.mode === "dark" ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.6)",
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            },
          ]}
        />
        <View style={{ paddingHorizontal: 24 }}>
          <AppButton
            label={
              isPremium
                ? tr("paywall.already_premium")
                : plan === "lifetime"
                  ? isOfferActive && offerPackage
                    ? `${tr("paywall.continue_lifetime_offer")} · ${offerPackage.product.priceString}`
                    : tr("paywall.continue_lifetime")
                  : tr("paywall.continue_weekly_trial")
            }
            onPress={doSubscribe}
            loading={loading || rc.isPurchasing}
            disabled={isPremium}
            testID="paywall-continue-btn"
          />
          <View style={styles.footerRow}>
            <Pressable onPress={doRestore} testID="paywall-restore" hitSlop={8}>
              <Text style={[t.type.caption, { color: t.colors.brandPrimary }]}>{tr("paywall.restore")}</Text>
            </Pressable>
            <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>·</Text>
            <Pressable onPress={() => Linking.openURL("https://cleanu.kenanplayer.com/terms")} hitSlop={8} testID="paywall-terms">
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>{tr("paywall.terms")}</Text>
            </Pressable>
            <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>·</Text>
            <Pressable onPress={() => Linking.openURL("https://cleanu.kenanplayer.com/privacy")} hitSlop={8} testID="paywall-privacy">
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>{tr("paywall.privacy")}</Text>
            </Pressable>
          </View>
          <Text style={[t.type.micro, { color: t.colors.onSurfaceTertiary, textAlign: "center", marginTop: 6, opacity: 0.7 }]}>
            {plan === "weekly" ? tr("paywall.footnote_trial") : tr("paywall.footnote_lifetime")}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PlanCard({
  selected, onPress, title, price, originalPrice, perLabel, perDay, badge, isOffer, testID,
}: {
  selected: boolean; onPress: () => void; title: string; price: string;
  originalPrice?: string; perLabel: string; perDay: string; badge?: string;
  isOffer?: boolean; testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.planCard,
        {
          borderColor: isOffer ? "#FF6B00" : selected ? t.colors.brandPrimary : t.colors.border,
          borderWidth: isOffer || selected ? 2 : 1,
          backgroundColor: isOffer
            ? t.mode === "dark" ? "rgba(255,107,0,0.12)" : "rgba(255,107,0,0.06)"
            : selected
              ? t.mode === "dark" ? "rgba(10,132,255,0.14)" : "rgba(0,122,255,0.06)"
              : t.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.8)",
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        (selected || isOffer) && t.shadow(2),
      ]}
    >
      <View style={[styles.planLeft, { flex: 1, minWidth: 0 }]}>
        <View style={[styles.radio, { borderColor: isOffer ? "#FF6B00" : selected ? t.colors.brandPrimary : t.colors.border }]}>
          {selected && <View style={[styles.radioInner, { backgroundColor: isOffer ? "#FF6B00" : t.colors.brandPrimary }]} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[t.type.title, { color: t.colors.onSurface }]} numberOfLines={1}>{title}</Text>
          <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]} numberOfLines={2}>{perDay}</Text>
        </View>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0, maxWidth: 116, marginLeft: 8 }}>
        {badge && (
          <View style={[styles.badge, { backgroundColor: isOffer ? "#FF6B00" : t.colors.brandPrimary }]}>
            <Text style={styles.badgeText} numberOfLines={2}>{badge}</Text>
          </View>
        )}
        {originalPrice && (
          <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, textDecorationLine: "line-through", marginTop: badge ? 4 : 0 }]} numberOfLines={1}>
            {originalPrice}
          </Text>
        )}
        <Text style={[t.type.title, { color: isOffer ? "#FF6B00" : t.colors.onSurface, marginTop: originalPrice ? 0 : badge ? 6 : 0 }]} numberOfLines={1}>
          {price}
        </Text>
        <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]} numberOfLines={1}>{perLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "flex-end" },
  limitBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(120,120,128,0.15)",
  },
  crown: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  benefit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderRadius: 20,
    borderWidth: 2,
  },
  planLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 116 },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" },
  ctaWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    overflow: "hidden",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  offerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: "hidden",
  },
  offerBannerTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  offerBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "500", marginTop: 1 },
  offerTimer: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  offerTimerText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 1 },
});
