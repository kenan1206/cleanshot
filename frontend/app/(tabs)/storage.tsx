// Speicher-Tab — Kategorie-Übersicht mit Balken + Donut-ähnlichem Hero
import React, { useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
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

export default function StorageTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useApp();
  const rc = useRevenueCat();
  const isPremium = rc.isSubscribed || !!user?.is_premium;
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  // Re-render wenn Tab fokussiert wird (damit nach einem Scan die Daten aktuell sind)
  useFocusEffect(useCallback(() => { forceUpdate(); }, []));

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

  const noData = !results || categories.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="storage-tab">
      {/* Titel */}
      <Text style={styles.title}>{t("storage_summary.header_title")}</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Hero-Banner */}
        <View style={styles.hero}>
          {noData ? (
            <>
              <Ionicons name="pie-chart-outline" size={48} color="rgba(255,255,255,0.7)" />
              <Text style={styles.heroNoData}>{t("storage_summary.no_scan_text")}</Text>
              <Pressable
                onPress={() => router.push("/(tabs)" as any)}
                style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.85 }]}
                testID="storage-start-scan-btn"
              >
                <Text style={styles.heroBtnText}>{t("home.scan_now") || "Jetzt scannen"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.heroGB}>{formatSize(totalMB)}</Text>
              <Text style={styles.heroSub}>
                {t("storage_summary.hero_sub", { count: totalItems.toLocaleString(i18n.language) })}
              </Text>
            </>
          )}
        </View>

        {/* Kategorie-Liste */}
        {!noData && (
          <>
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
                    testID={`storage-cat-${cat}`}
                    style={({ pressed }) => [
                      styles.catRow,
                      i < categories.length - 1 && styles.catRowBorder,
                      pressed && { backgroundColor: "#F0F0F5" },
                    ]}
                  >
                    <View style={[styles.catIcon, { backgroundColor: color + "18" }]}>
                      <Ionicons name={meta.icon} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.catNameRow}>
                        <Text style={styles.catName} numberOfLines={1}>
                          {t(`categories.${cat}_title`)}
                        </Text>
                        <Text style={[styles.catSize, { color }]}>{formatSize(r.totalSizeMB)}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[styles.barFill, { width: `${(pct * 100).toFixed(0)}%` as any, backgroundColor: color }]}
                        />
                      </View>
                      <Text style={styles.catCount}>
                        {t("storage_summary.items_count", { count: r.totalItems.toLocaleString(i18n.language) })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ marginLeft: 8 }} />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* CTA unten */}
      {!noData && (
        <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
          {!isPremium ? (
            <Pressable
              onPress={() => router.push("/paywall")}
              testID="storage-upgrade-btn"
              style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.ctaBtnText}>
                {t("storage_summary.unlock_premium_btn", { size: formatSize(totalMB) })}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push("/(tabs)" as any)}
              style={({ pressed }) => [styles.ctaBtn, { backgroundColor: "#34C759" }, pressed && { opacity: 0.9 }]}
              testID="storage-go-clean-btn"
            >
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={styles.ctaBtnText}>{t("storage_summary.open_category_btn")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  title: {
    fontSize: 32, fontWeight: "900", color: "#000",
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: -0.5,
  },
  scroll: { paddingHorizontal: 16 },
  hero: {
    backgroundColor: "#007AFF", borderRadius: 20, marginVertical: 12,
    paddingVertical: 28, paddingHorizontal: 20, alignItems: "center", gap: 8,
  },
  heroGB: { fontSize: 52, fontWeight: "900", color: "#fff", letterSpacing: -2 },
  heroSub: { fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: "500" },
  heroNoData: { fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: "500", textAlign: "center", marginTop: 8 },
  heroBtn: {
    marginTop: 12, backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  heroBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  sectionLabel: {
    fontSize: 12, fontWeight: "600", color: "#8E8E93", letterSpacing: 0.5,
    textTransform: "uppercase", marginTop: 4, marginBottom: 8, marginLeft: 4,
  },
  list: { backgroundColor: "#F9F9F9", borderRadius: 16, overflow: "hidden" },
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
  ctaWrap: {
    paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)",
  },
  ctaBtn: {
    backgroundColor: "#007AFF", borderRadius: 16, height: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  ctaBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
