import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import AppButton from "@/src/components/AppButton";
import { ensurePermissions } from "@/src/utils/photos";
import { ensureNotificationPermission } from "@/src/utils/notifications";

type Slide = {
  key: string;
  titleKey: string;
  subKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentKey: "categoryBlue" | "categoryPurple" | "categoryTeal";
  bulletKeys?: string[];
};

const SLIDES: Slide[] = [
  { key: "welcome", titleKey: "onboarding.slide1_title", subKey: "onboarding.slide1_sub", icon: "sparkles", accentKey: "categoryBlue" },
  {
    key: "swipe",
    titleKey: "onboarding.slide2_title",
    subKey: "onboarding.slide2_sub",
    icon: "hand-left-outline",
    accentKey: "categoryPurple",
    bulletKeys: ["onboarding.slide2_b1", "onboarding.slide2_b2", "onboarding.slide2_b3"],
  },
  {
    key: "permission",
    titleKey: "onboarding.slide3_title",
    subKey: "onboarding.slide3_sub",
    icon: "shield-checkmark",
    accentKey: "categoryTeal",
    bulletKeys: ["onboarding.slide3_b1", "onboarding.slide3_b2", "onboarding.slide3_b3"],
  },
];

export default function Onboarding() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completeOnboarding, trackEvent } = useApp();
  const [index, setIndex] = useState(0);
  const busyRef = useRef(false);

  const slide = SLIDES[index];
  const accent = t.colors[slide.accentKey];

  const next = async () => {
    if (busyRef.current) return;
    if (index < SLIDES.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      trackEvent("onboarding_step", { step: index + 1 });
      setIndex(index + 1);
      return;
    }
    busyRef.current = true;
    try {
      trackEvent("onboarding_permission_request");
      // Must await so the iOS permission dialog completes BEFORE we navigate.
      // If we navigate first, the Home screen loads with permission=denied and shows
      // the "Enable Photos Access" card even though the user just tapped Allow.
      await ensurePermissions();
      // Notification permission direkt nach Foto-Permission anfragen
      await ensureNotificationPermission().catch(() => {});
      completeOnboarding();
      trackEvent("onboarding_complete");
      router.replace("/(tabs)");
    } finally {
      busyRef.current = false;
    }
  };

  const skip = () => {
    trackEvent("onboarding_skipped", { at_step: index });
    completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.surface }} testID="onboarding-screen">
      <LinearGradient
        colors={
          t.mode === "dark"
            ? (["#000", accent + "44", "#000"] as const)
            : (["#F2F2F7", accent + "22", "#FFFFFF"] as const)
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      <View style={[styles.topRow, { paddingTop: insets.top + 8 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? accent : t.colors.border,
                  width: i === index ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={skip} hitSlop={12} testID="onboarding-skip">
          <Text style={[t.type.body, { color: t.colors.onSurfaceTertiary }]}>{tr("common.skip")}</Text>
        </Pressable>
      </View>

      <Animated.View
        key={slide.key + "-icon"}
        entering={FadeIn.duration(500).delay(100)}
        exiting={FadeOut.duration(200)}
        style={styles.heroWrap}
      >
        <View
          style={[
            styles.heroCircle,
            {
              backgroundColor: accent + "22",
              borderColor: accent + "44",
            },
          ]}
        >
          <View style={[styles.heroInner, { backgroundColor: accent + "33" }]}>
            <Ionicons name={slide.icon} size={72} color={accent} />
          </View>
        </View>
      </Animated.View>

      <View style={styles.copyBlock}>
        <Animated.Text
          key={slide.key + "-title"}
          entering={SlideInRight.duration(400)}
          exiting={SlideOutLeft.duration(200)}
          style={[t.type.h1, { color: t.colors.onSurface, textAlign: "center" }]}
        >
          {tr(slide.titleKey)}
        </Animated.Text>
        <Animated.Text
          key={slide.key + "-sub"}
          entering={FadeIn.duration(400).delay(150)}
          exiting={FadeOut.duration(150)}
          style={[t.type.bodyRegular, { color: t.colors.onSurfaceTertiary, textAlign: "center", marginTop: 12, paddingHorizontal: 8 }]}
        >
          {tr(slide.subKey)}
        </Animated.Text>

        {slide.bulletKeys && (
          <Animated.View
            key={slide.key + "-bullets"}
            entering={FadeIn.duration(500).delay(250)}
            exiting={FadeOut.duration(150)}
            style={styles.bullets}
          >
            {slide.bulletKeys.map((k) => (
              <View key={k} style={styles.bulletRow}>
                <View style={[styles.checkPill, { backgroundColor: accent + "22" }]}>
                  <Ionicons name="checkmark" size={14} color={accent} />
                </View>
                <Text style={[t.type.body, { color: t.colors.onSurface }]}>{tr(k)}</Text>
              </View>
            ))}
          </Animated.View>
        )}
      </View>

      <View style={[styles.ctaBlock, { paddingBottom: insets.bottom + 24 }]}>
        <AppButton
          label={index === SLIDES.length - 1 ? tr("onboarding.allow_photos") : tr("common.continue")}
          onPress={next}
          testID="onboarding-continue"
        />
        <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, textAlign: "center", marginTop: 12 }]}>
          {tr("onboarding.terms")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  heroWrap: {
    alignItems: "center",
    marginTop: 24,
  },
  heroCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  heroInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    paddingHorizontal: 32,
    marginTop: 32,
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
  },
  bullets: {
    marginTop: 28,
    gap: 14,
    alignSelf: "stretch",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBlock: {
    paddingHorizontal: 24,
  },
});
