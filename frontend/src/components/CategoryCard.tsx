// Premium category card modeled on Apple-Pro monochrome design system.
// Full-bleed photo thumbnail background + vertical gradient scrim + white title
// bottom-left + red count badge top-right. Mirrors competitor "cleanup" while
// matching CleanU's premium graphite/white aesthetic.

import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/src/theme/ThemeContext";
import { Category, PhotoAsset } from "@/src/utils/photos";
import AssetThumbnail from "./AssetThumbnail";

export type CategoryMeta = {
  key: Category;
  titleKey: string;
  subtitleKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: "categoryBlue" | "categoryPurple" | "categoryOrange" | "categoryTeal" | "categoryPink" | "categoryGreen";
};

// Same META as before — used by both grid card & category-detail routing.
export const CATEGORY_META: Record<Category, CategoryMeta> = {
  duplicates:          { key: "duplicates",          titleKey: "categories.duplicates_title",          subtitleKey: "categories.duplicates_sub",          icon: "copy-outline",                colorKey: "categoryBlue"   },
  similar:             { key: "similar",             titleKey: "categories.similar_title",             subtitleKey: "categories.similar_sub",             icon: "images-outline",              colorKey: "categoryTeal"   },
  similar_screenshots: { key: "similar_screenshots", titleKey: "categories.similar_screenshots_title", subtitleKey: "categories.similar_screenshots_sub", icon: "phone-portrait-outline",      colorKey: "categoryPurple" },
  similar_videos:      { key: "similar_videos",      titleKey: "categories.similar_videos_title",      subtitleKey: "categories.similar_videos_sub",      icon: "film-outline",                colorKey: "categoryPink"   },
  screenshots:         { key: "screenshots",         titleKey: "categories.screenshots_title",         subtitleKey: "categories.screenshots_sub",         icon: "phone-portrait-outline",      colorKey: "categoryPurple" },
  videos:              { key: "videos",              titleKey: "categories.videos_title",              subtitleKey: "categories.videos_sub",              icon: "videocam-outline",            colorKey: "categoryOrange" },
  blurry:              { key: "blurry",              titleKey: "categories.blurry_title",              subtitleKey: "categories.blurry_sub",              icon: "eye-off-outline",             colorKey: "categoryPink"   },
  chat:                { key: "chat",                titleKey: "categories.chat_title",                subtitleKey: "categories.chat_sub",                icon: "chatbubble-ellipses-outline", colorKey: "categoryOrange" },
  other:               { key: "other",               titleKey: "categories.other_title",               subtitleKey: "categories.other_sub",               icon: "albums-outline",              colorKey: "categoryGreen"  },
};

type Props = {
  meta: CategoryMeta;
  count: number;
  sizeLabel: string;
  preview?: PhotoAsset;      // full-bleed background photo
  onPress?: () => void;
  testID?: string;
};

export default function CategoryCard({ meta, count, sizeLabel, preview, onPress, testID }: Props) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const hasPreview = !!preview;
  const accent = t.colors[meta.colorKey];

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: hasPreview ? "#000" : accent + "18",
          borderColor: t.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {/* Layer 0 — full-bleed photo (or icon fallback) */}
      {hasPreview ? (
        <AssetThumbnail asset={preview} style={StyleSheet.absoluteFillObject as never} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.iconFallback]}>
          <Ionicons name={meta.icon} size={44} color={accent} />
        </View>
      )}

      {/* Layer 1 — dark vertical gradient scrim for text readability */}
      {hasPreview && (
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.85)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Layer 2 — red count badge (top-right) */}
      {count > 0 && (
        <View style={[styles.badge, { backgroundColor: t.colors.error }]}>
          <Text style={styles.badgeText}>{count.toLocaleString()}</Text>
        </View>
      )}

      {/* Layer 3 — title + size (bottom-left) */}
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, { color: hasPreview ? "#FFFFFF" : t.colors.onSurface }]}
          numberOfLines={1}
        >
          {tr(meta.titleKey)}
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: hasPreview ? "rgba(255,255,255,0.85)" : t.colors.onSurfaceTertiary },
          ]}
          numberOfLines={1}
        >
          {count > 0 ? sizeLabel : tr(meta.subtitleKey)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 0.92,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  iconFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 34,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  textBlock: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
});
