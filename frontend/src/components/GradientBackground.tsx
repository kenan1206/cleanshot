import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";

/** Soft ambient background gradient used across screens. */
export default function GradientBackground({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const colors = t.mode === "dark"
    ? (["#000000", "#0a1428", "#000000"] as const)
    : (["#F2F2F7", "#E5F0FF", "#F2F2F7"] as const);
  return (
    <View style={styles.fill}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
