// Storage Summary Screen — erscheint wenn "Speicher optimieren" getippt wird
// Zeigt Kategorie-Übersicht bevor die Paywall kommt

import React, { useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useApp } from "@/src/context/AppContext";
import { scanStore } from "@/src/utils/scanStore";
import { Category, formatSize } from "@/src/utils/photos";
import { CATEGORY_META } from "@/src/components/CategoryCard";

const CATEGORY_COLORS: Record<string, string> = {
  duplicates: "#007AFF",
  similar: "#5AC8FA",
  similar_screenshots: "#AF52DE",
  similar_videos: "#FF375F",
  screenshots: "#AF52DE",
  videos: "#FF9500",
  blurry: "#FF375F",
  chat: "#FF9500",
  other: "#34C759",
};

export default function StorageSummary() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useApp();
  const { results } = scanStore.get();

  const categories = useMemo(() => {
    if (!results) return [];
    return (Object.keys(CATEGORY_META) as Category[])
      .filter((k) => results[k]?.totalItems > 0)
      .sort((a, b) => results[b].totalSizeMB - results[a].totalSizeMB);
  }, [results]);

  const totalMB = useMemo(() =>
    categories.reduce((s, k) => s + (results?.[k]?.totalSizeMB ?? 0), 0),
  [categories, results]);

  const totalItems = useMemo(() =>
    categories.reduce((s, k) => s + (results?.[k]?.totalItems ?? 0), 0),
  [categories, results]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="storage-summary-back">
          <Ionicons name="chevron-back" size={24} color="#007AFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("storage_summary.header_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroGB}>{formatSize(totalMB)}</Text>
          <Text style={styles.heroSub}>{t("storage_summary.hero_sub", { count: totalItems.toLocaleString(i18n.language) })}</Text>
        </View>

        {/* Category list */}
        <Text style={styles.sectionLabel}>{t("storage_summary.section_categories")}</Text>
        <View style={styles.list}>
          {categories.map((cat, i) => {
            const r = results![cat];
            const color = CATEGORY_COLORS[cat] ?? "#007AFF";
            const pct = totalMB > 0 ? r.totalSizeMB / totalMB : 0;
            const meta = CATEGORY_META[cat];
            return (
              <Pressable
                key={cat}
                onPress={() => router.push(`/category/${cat}` as any)}
                testID={`summary-cat-${cat}`}
                style={({ pressed }) => [
                  styles.catRow,
                  i < categories.length - 1 && styles.catRowBorder,
                  pressed && { backgroundColor: "#F5F5F5" },
                ]}
              >
                <View style={[styles.catIcon, { backgroundColor: color + "18" }]}>
                  <Ionicons name={meta.icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.catNameRow}>
                    <Text style={styles.catName} numberOfLines={1}>{t(`categories.${cat}_title`)}</Text>
                    <Text style={[styles.catSize, { color }]}>{formatSize(r.totalSizeMB)}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(pct * 100).toFixed(0)}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.catCount}>{t("storage_summary.items_count", { count: r.totalItems.toLocaleString(i18n.language) })}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ marginLeft: 8 }} />
              </Pressable>
            );
          })}
        </View>

        {!results && (
          <View style={styles.noDataWrap}>
            <Text style={styles.noDataText}>{t("storage_summary.no_scan_text")}</Text>
          </View>
        )}
      </ScrollView>

      {/* CTA */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        {!user?.is_premium ? (
          <Pressable
            onPress={() => router.push("/paywall")}
            testID="summary-upgrade-btn"
            style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>
              {t("storage_summary.unlock_premium_btn", { size: formatSize(totalMB) })}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.ctaBtn, { backgroundColor: "#34C759" }, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>{t("storage_summary.open_category_btn")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.1)",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#000" },
  content: { paddingBottom: 20 },
  hero: { alignItems: "center", paddingVertical: 28, backgroundColor: "#007AFF", marginBottom: 0 },
  heroGB: { fontSize: 52, fontWeight: "900", color: "#fff", letterSpacing: -2 },
  heroSub: { fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: "500", marginTop: 4 },
  sectionLabel: {
    fontSize: 12, fontWeight: "600", color: "#8E8E93", letterSpacing: 0.5,
    textTransform: "uppercase", paddingHorizontal: 16, marginTop: 20, marginBottom: 8,
  },
  list: { marginHorizontal: 16, backgroundColor: "#F9F9F9", borderRadius: 16, overflow: "hidden" },
  catRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12, gap: 12, backgroundColor: "#F9F9F9",
  },
  catRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.06)" },
  catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  catNameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catName: { fontSize: 14, fontWeight: "600", color: "#000", flex: 1 },
  catSize: { fontSize: 13, fontWeight: "700" },
  barTrack: { height: 3, backgroundColor: "#E5E5EA", borderRadius: 2, marginVertical: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 2 },
  catCount: { fontSize: 11, color: "#8E8E93" },
  noDataWrap: { padding: 32, alignItems: "center" },
  noDataText: { color: "#8E8E93", textAlign: "center" },
  ctaWrap: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  ctaBtn: {
    backgroundColor: "#007AFF", borderRadius: 16, height: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  ctaBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
