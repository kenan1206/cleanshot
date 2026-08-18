import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";

type Variant = "primary" | "secondary" | "tertiary" | "danger";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  testID?: string;
};

export default function AppButton({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  fullWidth = true,
  style,
  labelStyle,
  icon,
  testID,
}: Props) {
  const t = useTheme();

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress?.();
  };

  const height = 56;
  const radius = t.radius.pill;

  if (variant === "primary" || variant === "danger") {
    const grad = variant === "danger"
      ? ([t.colors.error, "#C81B0F"] as const)
      : ([t.colors.brandPrimary, "#0055C6"] as const);
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || loading}
        testID={testID}
        style={({ pressed }) => [
          {
            height,
            borderRadius: radius,
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            width: fullWidth ? "100%" : undefined,
          },
          t.shadow(3),
          style,
        ]}
      >
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.grad, { borderRadius: radius }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.row}>
              {icon}
              <Text style={[styles.label, { color: "#fff" }, t.type.body, labelStyle]}>{label}</Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === "secondary") {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || loading}
        testID={testID}
        style={({ pressed }) => [
          {
            height,
            borderRadius: radius,
            backgroundColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.mode === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)",
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            width: fullWidth ? "100%" : undefined,
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={t.colors.onSurface} />
        ) : (
          <View style={styles.row}>
            {icon}
            <Text style={[{ color: t.colors.onSurface }, t.type.body, labelStyle]}>{label}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  // tertiary
  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      testID={testID}
      style={({ pressed }) => [
        {
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
    >
      <Text style={[{ color: t.colors.brandPrimary }, t.type.body, labelStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  label: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
