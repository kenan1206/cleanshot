// Pro Upsell Modal — zeigt bei JEDEM App-Start für Free-Nutzer
// Schnelle, elegante Animation ohne nervigen Charakter
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay, withSequence, withRepeat,
  runOnJS, Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

const { height } = Dimensions.get("window");

const FEATURES = [
  { icon: "infinite" as const, key: "upsell.f1" },
  { icon: "sparkles" as const, key: "upsell.f2" },
  { icon: "shield-checkmark" as const, key: "upsell.f3" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

export default function ProUpsellModal({ visible, onClose, onUpgrade }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const translateY = useSharedValue(height);
  const opacity = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withSpring(0, { damping: 22, stiffness: 160, mass: 0.9 });
      // shimmer loop on the CTA button
      shimmer.value = withDelay(600, withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ), -1, false,
      ));
    } else {
      opacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(height * 0.6, { duration: 260, easing: Easing.in(Easing.cubic) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.15 + shimmer.value * 0.2 }));

  if (!visible) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.overlay, overlayStyle]} testID="pro-upsell-overlay">
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }, sheetStyle]}>
        <LinearGradient
          colors={["#0F1220", "#1A1F3A", "#0F1220"]}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Handle */}
        <View style={styles.handle} />

        {/* Close */}
        <Pressable onPress={onClose} style={styles.closeBtn} testID="upsell-close-btn" hitSlop={12}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
        </Pressable>

        {/* Headline */}
        <View style={styles.headlineRow}>
          <LinearGradient
            colors={["#4F63FF", "#6C4EF5"]}
            style={styles.iconBadge}
          >
            <Ionicons name="diamond" size={22} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{t("upsell.eyebrow")}</Text>
            <Text style={styles.headline}>{t("upsell.headline")}</Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={16} color="#6C4EF5" />
              </View>
              <Text style={styles.featureText}>{t(f.key) || f.key}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <Pressable
          onPress={onUpgrade}
          style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.92 }]}
          testID="upsell-upgrade-btn"
        >
          <LinearGradient
            colors={["#5568FF", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Shimmer overlay */}
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.ctaShimmer, shimmerStyle]}>
            <LinearGradient
              colors={["transparent", "rgba(255,255,255,0.4)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
          <Ionicons name="flash" size={18} color="#fff" />
          <Text style={styles.ctaText}>{t("upsell.cta")}</Text>
        </Pressable>

        {/* Dismiss */}
        <Pressable onPress={onClose} style={styles.dismissBtn} testID="upsell-dismiss-btn">
          <Text style={styles.dismissText}>{t("upsell.dismiss")}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { justifyContent: "flex-end", zIndex: 999 },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 24, overflow: "hidden",
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginBottom: 16 },
  closeBtn: { position: "absolute", top: 16, right: 16, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headlineRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20, marginTop: 8 },
  iconBadge: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "700", color: "#6C4EF5", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 },
  headline: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  featureList: { gap: 10, marginBottom: 24 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(108,78,245,0.2)", alignItems: "center", justifyContent: "center" },
  featureText: { fontSize: 15, fontWeight: "500", color: "rgba(255,255,255,0.85)", flex: 1 },
  ctaBtn: {
    height: 56, borderRadius: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    overflow: "hidden", marginBottom: 12,
  },
  ctaShimmer: { borderRadius: 18 },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  dismissBtn: { alignItems: "center", paddingVertical: 8 },
  dismissText: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: "500" },
});
