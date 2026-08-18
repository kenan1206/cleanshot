import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** value between 0 and 1 (0 = empty, 1 = full) */
  progress: number;
  size?: number;
  strokeWidth?: number;
  primaryLabel: string; // e.g. "23.4 GB"
  secondaryLabel: string; // e.g. "of 128 GB used"
  tertiaryLabel?: string; // e.g. "82% full"
};

export default function StorageRing({
  progress,
  size = 240,
  strokeWidth = 18,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
}: Props) {
  const t = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, p]);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: circumference * (1 - p.value),
    } as { strokeDashoffset: number };
  });

  const trackColor = t.mode === "dark" ? "#2C2C2E" : "#E5E5EA";

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.colors.brandPrimary} stopOpacity="1" />
            <Stop offset="1" stopColor="#66B2FF" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.center, { width: size - strokeWidth * 4 }]} pointerEvents="none">
        <Text
          style={[t.type.hero, { color: t.colors.onSurface, textAlign: "center", fontSize: size * 0.19, lineHeight: size * 0.22 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {primaryLabel}
        </Text>
        <Text
          style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 4, textAlign: "center" }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {secondaryLabel}
        </Text>
        {!!tertiaryLabel && (
          <Text
            style={[t.type.micro, { color: t.colors.brandPrimary, marginTop: 6, textAlign: "center" }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {tertiaryLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
