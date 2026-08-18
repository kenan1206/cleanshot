// Premium scan-hero card: shows storage stats + animated scan progress.
// Inspired by the Cleanup competitor's storage overview, but with Apple Glass aesthetics.

import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";
import AnimatedCounter from "./AnimatedCounter";
import { formatSize } from "@/src/utils/photos";

type Props = {
  totalItems: number;
  totalSizeMB: number;
  scanning: boolean;
  scanProgress: number; // 0-100
  scanPhaseLabel: string;
  onRescan?: () => void;
  testID?: string;
};

export default function ScanHeroCard({
  totalItems,
  totalSizeMB,
  scanning,
  scanProgress,
  scanPhaseLabel,
  onRescan,
  testID,
}: Props) {
  const t = useTheme();
  const barWidth = useSharedValue(0);

  useEffect(() => {
    // 0% if no data, scanProgress% while scanning, 100% after scan with results
    const target = scanning ? Math.max(4, scanProgress) : totalSizeMB > 0 ? 100 : 0;
    barWidth.value = withTiming(target, {
      duration: 400,
      easing: Easing.out(Easing.quad),
    });
  }, [scanProgress, scanning, totalSizeMB, barWidth]);

  const barAnimStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as `${number}%`,
  }));

  const isDark = t.mode === "dark";
  const cardBg = isDark ? "rgba(28,28,45,0.9)" : "rgba(255,255,255,0.85)";
  const borderColor = isDark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.18)";

  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor,
        },
        t.shadow(2),
      ]}
    >
      {/* Subtle top gradient tint */}
      <LinearGradient
        colors={
          isDark
            ? ["rgba(79,70,229,0.18)", "transparent"]
            : ["rgba(99,102,241,0.1)", "transparent"]
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.5 }}
      />

      <View style={styles.inner}>
        {/* Row: Title + rescan button */}
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.label, { color: t.colors.onSurfaceTertiary }]}>
              SPEICHER BEREINIGEN
            </Text>
            <Text style={[styles.bigNumber, { color: t.colors.onSurface }]}>
              {totalSizeMB > 0 ? formatSize(totalSizeMB) : scanning ? "Scanne…" : "—"}
            </Text>
          </View>
          <Pressable
            onPress={onRescan}
            testID="hero-rescan-btn"
            style={({ pressed }) => [
              styles.rescanBtn,
              {
                backgroundColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.12)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons
              name={scanning ? "ellipsis-horizontal" : "refresh"}
              size={18}
              color={t.colors.brandPrimary}
            />
          </Pressable>
        </View>

        {/* Item count — Row layout to avoid nesting Text in Text */}
        <View style={styles.itemRow}>
          <Ionicons name="images-outline" size={14} color={t.colors.onSurfaceTertiary} />
          {scanning && totalItems === 0 ? (
            <Text style={[styles.itemLabel, { color: t.colors.onSurfaceTertiary }]}>
              {scanPhaseLabel}
            </Text>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <AnimatedCounter
                value={totalItems}
                style={[styles.itemLabel, { color: t.colors.onSurface, fontWeight: "600" }]}
                duration={1200}
              />
              <Text style={[styles.itemLabel, { color: t.colors.onSurfaceTertiary }]}>
                {" Elemente gefunden"}
              </Text>
            </View>
          )}
        </View>

        {/* Animated progress bar */}
        <View style={[styles.barTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)" }]}>
          <Animated.View
            style={[
              styles.barFill,
              barAnimStyle,
              {
                backgroundColor: scanning
                  ? t.colors.warning
                  : totalSizeMB > 0
                  ? t.colors.error
                  : t.colors.brandPrimary,
              },
            ]}
          />
        </View>

        {/* Status text */}
        {scanning && (
          <Text
            style={[styles.statusText, { color: t.colors.onSurfaceTertiary }]}
            testID="hero-scan-status"
          >
            {scanPhaseLabel}
          </Text>
        )}
        {!scanning && totalSizeMB > 0 && (
          <Text style={[styles.statusText, { color: t.colors.error }]}>
            {formatSize(totalSizeMB)} freizugeben
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  inner: {
    padding: 20,
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  bigNumber: {
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  rescanBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginVertical: 4,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
});
