import React from "react";
import { View, StyleSheet, ViewProps, StyleProp, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/src/theme/ThemeContext";

type Props = ViewProps & {
  intensity?: number;
  radius?: number;
  padding?: number;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export default function GlassCard({
  intensity = 40,
  radius,
  padding,
  bordered = true,
  style,
  children,
  ...rest
}: Props) {
  const t = useTheme();
  const r = radius ?? t.radius.lg;
  const p = padding ?? t.spacing.lg;
  return (
    <View
      style={[
        styles.wrap,
        {
          borderRadius: r,
          backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.6)",
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        },
        t.shadow(2),
        style,
      ]}
      {...rest}
    >
      <BlurView
        intensity={intensity}
        tint={t.mode === "dark" ? "dark" : "light"}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <View style={{ padding: p }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
});
