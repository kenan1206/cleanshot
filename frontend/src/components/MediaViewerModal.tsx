// Shared full-screen viewer — Bilder (Pinch-Zoom) + Videos (expo-video)
// Swipe DOWN → schließt, Swipe LINKS/RECHTS → Navigation
import React, { useState, useCallback, useRef } from "react";
import {
  View, Modal, FlatList, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions, Platform,
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
  const flatRef = useRef<FlatList>(null);

  // ── Swipe-Down to Close ──────────────────────────────────
  const translateY = useSharedValue(0);
  const bgOpacity = useSharedValue(1);

  const doClose = useCallback(() => {
    translateY.value = 0;
    bgOpacity.value = 1;
    onClose();
  }, [onClose, translateY, bgOpacity]);

  const panGesture = Gesture.Pan()
    .activeOffsetY([-6, 6])      // Erst nach 6px vertikal aktivieren
    .failOffsetX([-12, 12])      // Abbrechen bei horizontalem Swipe (→ FlatList übernimmt)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
        bgOpacity.value = Math.max(0.2, 1 - e.translationY / 350);
      }
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) {
        translateY.value = withTiming(H, { duration: 220 }, () => runOnJS(doClose)());
      } else {
        translateY.value = withSpring(0, { damping: 20 });
        bgOpacity.value = withSpring(1);
      }
    });

  const panStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const bgStyle = useAnimatedStyle(() => ({
    flex: 1,
    backgroundColor: "#000",
    opacity: bgOpacity.value,
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
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[{ flex: 1 }, panStyle]}>

            {/* ── Swipeable pages ── */}
            <FlatList
              ref={flatRef}
              data={items}
              horizontal
              pagingEnabled
              initialScrollIndex={initialIndex}
              getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
              showsHorizontalScrollIndicator={false}
              // Live-Updates während Scroll (nicht erst nach Ende)
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
                <View style={{ width: W, height: H }}>
                  {item.type === "image" ? (
                    <ScrollView
                      style={{ flex: 1 }}
                      maximumZoomScale={5}
                      minimumZoomScale={1}
                      showsHorizontalScrollIndicator={false}
                      showsVerticalScrollIndicator={false}
                      centerContent
                    >
                      <ExpoImage
                        source={{ uri: item.uri }}
                        style={{ width: W, height: H }}
                        contentFit="contain"
                      />
                    </ScrollView>
                  ) : (
                    <VideoPlayerNative uri={item.uri} isActive={index === curIdx} />
                  )}
                </View>
              )}
            />

            {/* ── Close — nach FlatList → liegt oben ── */}
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
  pageWrap: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pageText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
