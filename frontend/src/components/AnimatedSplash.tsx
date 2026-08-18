import React, { useEffect } from "react";
import { Text, StyleSheet, Dimensions, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Defs, RadialGradient as SvgRadialGradient, Stop } from "react-native-svg";

const { width, height } = Dimensions.get("window");

// Proportional sizing — passt sich an alle iPhone-Größen an
const ICON_SIZE = Math.round(Math.min(width, height) * 0.33); // ~140px auf iPhone 14
const ICON_RADIUS = Math.round(ICON_SIZE * 0.265);            // ~37px radius
const SPARKLE_SIZE = Math.round(ICON_SIZE * 0.52);            // ~72px icon inside

// Clean sparkle icon SVG path
const SPARKLE_PATH =
  "M12 2 C 12.5 7.5, 15.5 10.5, 22 12 C 15.5 13.5, 12.5 16.5, 12 22 C 11.5 16.5, 8.5 13.5, 2 12 C 8.5 10.5, 11.5 7.5, 12 2 Z";

// Small ambient particle
function AmbientDot({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.35, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: "rgba(255,255,255,0.6)",
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style} pointerEvents="none" />;
}

export default function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const iconScale = useSharedValue(0.7);
  const iconOpacity = useSharedValue(0);
  const iconRotate = useSharedValue(-6);

  const shimmerX = useSharedValue(-ICON_SIZE);

  const wordmarkY = useSharedValue(18);
  const wordmarkOpacity = useSharedValue(0);

  const taglineOpacity = useSharedValue(0);

  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);

  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    // 1. Outer ring pulse appears first (depth effect)
    ringOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
    ringScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 70 }));

    // 2. Icon bounces in
    iconOpacity.value = withDelay(200, withTiming(1, { duration: 350 }));
    iconScale.value = withDelay(200, withSpring(1, { damping: 9, stiffness: 120, mass: 0.8 }));
    iconRotate.value = withDelay(200, withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) }));

    // 3. Shimmer sweep across icon
    shimmerX.value = withDelay(600, withTiming(ICON_SIZE * 2, { duration: 600, easing: Easing.out(Easing.cubic) }));

    // 4. Wordmark slides up
    wordmarkOpacity.value = withDelay(680, withTiming(1, { duration: 420 }));
    wordmarkY.value = withDelay(680, withSpring(0, { damping: 18, stiffness: 100 }));

    // 5. Tagline fades in
    taglineOpacity.value = withDelay(900, withTiming(1, { duration: 400 }));

    // 6. Exit
    const exitTimer = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 450, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onFinish)();
      });
    }, 2400);

    return () => clearTimeout(exitTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, styles.container, overlayStyle]} pointerEvents="none" testID="animated-splash">
      {/* Background gradient — deep space dark */}
      <LinearGradient
        colors={["#0A0C14", "#0F1220", "#0A0C14"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle blue radial bloom top-center */}
      <View style={styles.bloomWrap} pointerEvents="none">
        <LinearGradient
          colors={["rgba(99,102,241,0.32)", "rgba(99,102,241,0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1, borderRadius: width * 0.7 }}
        />
      </View>

      {/* Ambient floating particles */}
      <AmbientDot x={width * 0.12} y={height * 0.18} size={4} delay={500} />
      <AmbientDot x={width * 0.82} y={height * 0.24} size={3} delay={900} />
      <AmbientDot x={width * 0.78} y={height * 0.72} size={5} delay={700} />
      <AmbientDot x={width * 0.10} y={height * 0.78} size={3} delay={1100} />

      {/* ── Centered content group — FLEX, kein absolutes top ── */}
      <View style={styles.contentGroup}>

        {/* App Icon + Ring als Einheit */}
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          {/* Glow ring — absolut hinter dem Icon (60px overflow jede Seite) */}
          <Animated.View style={[styles.ringWrap, ringStyle]} pointerEvents="none">
            <LinearGradient
              colors={["rgba(99,102,241,0.22)", "rgba(99,102,241,0)"]}
              start={{ x: 0.5, y: 0.5 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            />
          </Animated.View>

          <LinearGradient
            colors={["#4F63FF", "#6C4EF5", "#5B3DE8"]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.iconGradient}
          >
            <View style={styles.iconShineTop} />
            <Svg width={SPARKLE_SIZE} height={SPARKLE_SIZE} viewBox="0 0 24 24" style={{ zIndex: 2 }}>
              <Path d={SPARKLE_PATH} fill="rgba(255,255,255,0.95)" />
            </Svg>
            <Animated.View style={[styles.shimmerWrap, shimmerStyle]} pointerEvents="none">
              <LinearGradient
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </LinearGradient>
        </Animated.View>

        {/* Wordmark + tagline — direkt unter dem Icon, 32px Abstand */}
        <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
          <Text style={styles.wordmark} allowFontScaling={false}>CleanU</Text>
          <Animated.View style={taglineStyle}>
            <Text style={styles.tagline} allowFontScaling={false}>Free up space in seconds</Text>
          </Animated.View>
        </Animated.View>

      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0A0C14",
    alignItems: "center",
    justifyContent: "center",   // zentriert contentGroup vertikal
  },
  bloomWrap: {
    position: "absolute",
    width: width * 1.6,
    height: height * 0.55,
    top: -height * 0.06,
    left: -width * 0.3,
  },
  // ── Flex-zentrierte Gruppe: kein absolutes top mehr ──────────────────────
  contentGroup: {
    alignItems: "center",
    // Leicht unter Mitte für mehr Luft oben (5cm tiefer als vorher)
    marginTop: height * 0.07,
  },
  // ── Ring: absolut INNERHALB iconWrap — immer auf dem Icon zentriert ───────
  ringWrap: {
    position: "absolute",
    width: ICON_SIZE + 120,
    height: ICON_SIZE + 120,
    borderRadius: (ICON_SIZE + 120) / 2,
    top: -60,    // (ICON_SIZE+120 - ICON_SIZE) / 2 = 60
    left: -60,
    zIndex: 0,
  },
  ring: {
    flex: 1,
    borderRadius: (ICON_SIZE + 120) / 2,
  },
  iconWrap: {
    zIndex: 1,
    shadowColor: "#4F63FF",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.70,
    shadowRadius: 44,
    elevation: 24,
  },
  iconGradient: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconShineTop: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: ICON_SIZE * 0.45,
    borderTopLeftRadius: ICON_RADIUS,
    borderTopRightRadius: ICON_RADIUS,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  shimmerWrap: {
    position: "absolute",
    top: 0,
    left: -ICON_SIZE,
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_RADIUS,
  },
  // Wordmark: marginTop sorgt für festen Abstand unter Icon — kein Overlap möglich
  wordmarkWrap: {
    alignItems: "center",
    marginTop: 32,
    paddingHorizontal: 24,
    zIndex: 2,
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: Math.round(width * 0.09),
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    color: "rgba(255,255,255,0.48)",
    fontSize: Math.round(width * 0.042),
    fontWeight: "400",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});
