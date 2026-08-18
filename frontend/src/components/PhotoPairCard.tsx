// PhotoPairCard — exakter Cleanup-Competitor Clone
// Zeigt zwei Fotos nebeneinander mit blauem Zähler-Button rechts unten

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AssetThumbnail from "./AssetThumbnail";
import LiveVideoThumb from "./LiveVideoThumb";
import { PhotoAsset } from "@/src/utils/photos";

type Props = {
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
  leftAsset?: PhotoAsset;
  rightAsset?: PhotoAsset;
  count: number;
  sizeLabel: string;
  onPress?: () => void;
  testID?: string;
};

export default function PhotoPairCard({
  title,
  iconName,
  leftAsset,
  rightAsset,
  count,
  sizeLabel,
  onPress,
  testID,
}: Props) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      {/* Header: icon + title */}
      <View style={styles.header}>
        <Ionicons name={iconName} size={20} color="#000000" />
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* Photo pair */}
      <View style={styles.pair}>
        {/* Left photo — Video spielt stumm wenn es ein Video ist */}
        <View style={styles.photoBox}>
          {leftAsset ? (
            leftAsset.mediaType === "video" ? (
              <LiveVideoThumb uri={leftAsset.uri} style={styles.photo} isVisible />
            ) : (
              <AssetThumbnail asset={leftAsset} style={styles.photo} />
            )
          ) : (
            <View style={[styles.photo, styles.placeholder]} />
          )}
        </View>

        {/* Right photo + blue count overlay (immer statisch) */}
        <View style={styles.photoBox}>
          {rightAsset ? (
            <AssetThumbnail asset={rightAsset} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.placeholder]} />
          )}

          {/* Blue count button */}
          <View style={styles.countOverlay}>
            <View style={styles.countRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.countPrimary} numberOfLines={1}>
                  {t("common.items_label", { count: count.toLocaleString() })}
                </Text>
                <Text style={styles.countSub}>({sizeLabel})</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#EEF2FF",
    borderRadius: 20,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000000",
    letterSpacing: -0.3,
  },
  pair: {
    flexDirection: "row",
    gap: 4,
    height: 160,
  },
  photoBox: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  } as any,
  placeholder: {
    backgroundColor: "#D8DCF0",
  },
  countOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  countPrimary: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  countSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
});
