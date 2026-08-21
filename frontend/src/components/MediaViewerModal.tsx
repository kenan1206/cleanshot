// Shared full-screen viewer — Bilder (Pinch-Zoom via RNGH) + Videos
// Swipe DOWN → schließt, Pinch → Zoom, Swipe LINKS/RECHTS → Navigation
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Modal, FlatList, TouchableOpacity,
  StyleSheet, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, runOnJS,
} from "react-native-reanimated";
import VideoPlayerNative from "./VideoPlayerNative";

export interface ViewerMedia {
  id: string;
  uri: string;
  type: "image" | "video";
  thumbnailUri?: string;
}

interface Props {
  items: ViewerMedia[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const { width: W, height: H } = Dimensions.get("window");

export default function MediaViewerModal({ items, initialIndex, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [curIdx, setCurIdx] = useState(initialIndex);
  const [flatScrollEnabled, setFlatScrollEnabled] = useState(true);
  const flatRef = useRef<FlatList>(null);

  // ── Animation state ────────────────────────────────────────────
  const translateY = useSharedValue(0);
  const bgOpacity  = useSharedValue(1);
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const isZoomed   = useSharedValue(false);

  // Reset zoom when navigating pages
  useEffect(() => {
    scale.value      = withSpring(1);
    savedScale.value = 1;
    isZoomed.value   = false;
    setFlatScrollEnabled(true);
  }, [curIdx]);

  const doClose = useCallback(() => {
    translateY.value = 0;
    bgOpacity.value  = 1;
    scale.value      = 1;
    savedScale.value = 1;
    isZoomed.value   = false;
    onClose();
  }, [onClose, translateY, bgOpacity, scale, savedScale, isZoomed]);

  // ── Swipe-Down to close (deaktiviert wenn gezoomt) ─────────────
  const swipeDown = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-14, 14])
    .onUpdate((e) => {
      if (isZoomed.value) return;
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        bgOpacity.value  = Math.max(0.2, 1 - e.translationY / 350);
      }
    })
    .onEnd((e) => {
      if (!isZoomed.value && (e.translationY > 120 || e.velocityY > 600)) {
        translateY.value = withTiming(H, { duration: 220 }, () => runOnJS(doClose)());
      } else {
        translateY.value = withSpring(0, { damping: 20 });
        bgOpacity.value  = withSpring(1);
      }
    });

  // ── Pinch-to-Zoom (ersetzt ScrollView — kein nativer Konflikt) ─
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.1) {
        scale.value      = withSpring(1);
        savedScale.value = 1;
        isZoomed.value   = false;
        runOnJS(setFlatScrollEnabled)(true);
      } else {
        isZoomed.value = true;
        runOnJS(setFlatScrollEnabled)(false);
      }
    });

  const composed = Gesture.Simultaneous(swipeDown, pinch);

  // ── Animated styles ────────────────────────────────────────────
  const bgStyle  = useAnimatedStyle(() => ({
    flex: 1, backgroundColor: "#000", opacity: bgOpacity.value,
  }));
  const panStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible || items.length === 0) return null;

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={doClose}
      statusBarTranslucent
      testID="media-viewer-modal"
    >
      <Animated.View style={bgStyle}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[{ flex: 1 }, panStyle]}>

            <FlatList
              ref={flatRef}
              data={items}
              horizontal
              pagingEnabled
              scrollEnabled={flatScrollEnabled}
              initialScrollIndex={initialIndex}
              getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / W);
                if (idx !== curIdx) setCurIdx(idx);
              }}
              scrollEventThrottle={100}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / W);
                setCurIdx(idx);
              }}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
                  {item.type === "image" ? (
                    <Animated.View style={[{ width: W, height: H }, zoomStyle]}>
                      <ExpoImage
                        source={{ uri: item.uri }}
                        style={{ width: W, height: H }}
                        contentFit="contain"
                      />
                    </Animated.View>
                  ) : (
                    <VideoPlayerNative uri={item.uri} isActive={index === curIdx} />
                  )}
                </View>
              )}
            />

            {/* Close-Button liegt über FlatList */}
            <TouchableOpacity
              style={[s.closeBtn, { top: insets.top + 8 }]}
              onPress={doClose}
              hitSlop={20}
              testID="viewer-close"
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>

          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 999,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
