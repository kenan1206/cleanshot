// Start Tab — exakter Cleanup-Competitor Clone
// Weiße Background, Bold Titel, Foto-Paar-Karten, Countdown Banner

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Linking,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as MediaLibrary from "expo-media-library";
import { LinearGradient } from "expo-linear-gradient";

import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
import PhotoPairCard from "@/src/components/PhotoPairCard";
import CategoryCard, { CATEGORY_META } from "@/src/components/CategoryCard";
import AppButton from "@/src/components/AppButton";
import ProUpsellModal from "@/src/components/ProUpsellModal";
import { useOfferCountdown } from "@/src/utils/offerCountdown";
import {
  analyzeAll,
  Category,
  CategoryResult,
  PhotoAsset,
  ensurePermissions,
  fetchAllAssets,
  formatSize,
} from "@/src/utils/photos";
import { storage } from "@/src/utils/storage";
import { scanStore } from "@/src/utils/scanStore";
import { useTranslation } from "react-i18next";

const RESULTS_KEY = "cleanu.scan_results.v1";

export default function Start() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, trackEvent, refresh } = useApp();
  const rc = useRevenueCat();
  const { t } = useTranslation();
  const { isActive: isFlashActive, label: flashCountdown } = useOfferCountdown();
  const isPremium = !!user?.is_premium || rc.isSubscribed;

  const [scanning, setScanning] = useState(false);
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [results, setResults] = useState<Record<Category, CategoryResult> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  // Pro Upsell Modal — jeden App-Start für Free-Nutzer
  const [showUpsell, setShowUpsell] = useState(false);
  const upsellShownRef = useRef(false);
  const isPremiumRef = useRef(isPremium);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);

  useFocusEffect(useCallback(() => {
    // Warte bis RC fertig geladen, dann nochmal prüfen ob wirklich Free
    if (rc.isLoading || isPremium || upsellShownRef.current) return;
    upsellShownRef.current = true;
    const timer = setTimeout(() => {
      // Nochmal prüfen — RC könnte zwischenzeitlich geladen haben
      if (!isPremiumRef.current) setShowUpsell(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isPremium, rc.isLoading]));

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const perm = await ensurePermissions();
      setPermission(perm);
      if (!perm.granted) { setScanning(false); return; }
      trackEvent("scan_started");
      const assets = await fetchAllAssets(20000, (done) => setScannedCount(done));
      const analyzed = await analyzeAll(assets);
      setResults(analyzed);
      scanStore.set(analyzed, assets);
      try { await storage.setItem(RESULTS_KEY, JSON.stringify({ analyzed, totalAssets: assets.length })); } catch { /**/ }
      trackEvent("scan_completed", { assets: assets.length });
    } catch (e) { console.warn("scan failed", e); }
    finally { setScanning(false); setRefreshing(false); }
  }, [trackEvent]);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    (async () => {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (!mounted) return;
      setPermission(perm);
      if (!perm.granted) return;
      if (!results) {
        try {
          const raw = await storage.getItem(RESULTS_KEY);
          if (raw && mounted) {
            const parsed = JSON.parse(raw);
            if (parsed?.analyzed) {
              setResults(parsed.analyzed);
              scanStore.set(parsed.analyzed, []);
              return; // Cache geladen → kein Auto-Scan, Nutzer drückt selbst
            }
          }
        } catch { /**/ }
        // Nur scannen wenn kein Cache vorhanden
        scan();
      } else {
        const { results: stored } = scanStore.get();
        if (stored && mounted) setResults(stored);
      }
    })();
    return () => { mounted = false; };
  }, [results, scan]));

  const totalReclaimable = useMemo(() => results
    ? (Object.keys(results) as Category[]).reduce((s, k) => s + results[k].totalSizeMB, 0) : 0, [results]);
  const totalFoundItems = useMemo(() => results
    ? (Object.keys(results) as Category[]).reduce((s, k) => s + results[k].totalItems, 0) : 0, [results]);

  // Get photo pair for each category
  const pairsByCat = useMemo(() => {
    const map: Partial<Record<Category, { left: PhotoAsset; right: PhotoAsset }>> = {};
    if (!results) return map;
    (Object.keys(results) as Category[]).forEach((k) => {
      const groups = results[k].groups;
      if (groups.length === 0) return;
      const firstGroup = groups[0];
      const left = firstGroup.assets[0];
      const right = firstGroup.assets[1] ?? firstGroup.assets[0];
      if (left) map[k] = { left, right };
    });
    return map;
  }, [results]);

  const onCategory = (cat: Category) => {
    if (!results || results[cat].totalItems === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(`/category/${cat}`);
  };

  const permissionGranted = permission?.granted ?? false;
  const hasResults = results && totalFoundItems > 0;

  // Free-tier quota (refresh on focus so numbers update right after a delete elsewhere)
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const mbUsed = Math.round(user?.free_mb_used ?? 0);
  const mbPct = Math.min(100, ((user?.free_mb_used ?? 0) / 100) * 100);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Fixed Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>✦ CleanU</Text>
        </View>
        <View style={styles.headerRight}>
          {!user?.is_premium && (
            <Pressable
              onPress={() => router.push("/paywall")}
              testID="header-pro-btn"
              style={styles.proBtn}
            >
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.proText}>PRO</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            testID="header-settings-btn"
            style={styles.gearBtn}
          >
            <Ionicons name="settings-outline" size={22} color="#000" />
          </Pressable>
        </View>
      </View>

      {/* ── Free-tier quota bar (nur für Nicht-Premium) ── */}
      {!user?.is_premium && (
        <Pressable
          onPress={() => router.push("/paywall")}
          testID="quota-card"
          style={styles.quotaCard}
        >
          <View style={styles.quotaHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="battery-half-outline" size={16} color="#007AFF" />
              <Text style={styles.quotaTitle}>{t("home.quota_title")}</Text>
            </View>
            <Text style={styles.quotaValue}>{t("home.quota_mb", { used: mbUsed, limit: 100 })}</Text>
          </View>
          <View style={styles.quotaTrack}>
            <View style={[styles.quotaFill, { width: `${mbPct}%`, backgroundColor: mbPct >= 100 ? "#FF3B30" : "#007AFF" }]} />
          </View>
        </Pressable>
      )}

      {/* ── File count subtitle ── */}
      {(results || scanning) && (
        <Text style={styles.subtitle} testID="home-file-count">
          {scanning
            ? t("home.scanning_files", { count: scannedCount.toLocaleString() })
            : t("home.file_count_label", { count: totalFoundItems.toLocaleString(), size: formatSize(totalReclaimable) })}
        </Text>
      )}

      {/* ── Blue optimization banner ── */}
      {hasResults && (
        <Pressable
          onPress={() => router.push("/storage-summary" as any)}
          testID="optimize-banner"
          style={styles.optimizeBanner}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{t("home.storage_optimize")}</Text>
            <Text style={styles.bannerSub}>
              {t("home.storage_save", { size: formatSize(totalReclaimable) })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>
      )}

      {/* ── Scrollable content ── */}
      <ScrollView
        testID="home-scroll"
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: isFlashActive ? 88 : 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); scan(); }}
            tintColor="#007AFF"
          />
        }
      >
        {/* Permission gate */}
        {!permissionGranted && !scanning && !results && (
          <View style={styles.permCard}>
            <View style={styles.permIconWrap}>
              <Ionicons name="images" size={32} color="#007AFF" />
            </View>
            <Text style={styles.permTitle}>{t("home.enable_title")}</Text>
            <Text style={styles.permSub}>{t("home.enable_sub")}</Text>
            <AppButton
              label={permission?.canAskAgain === false ? t("common.open_settings") : t("home.allow_access")}
              onPress={async () => {
                if (permission?.canAskAgain === false) { await Linking.openSettings(); }
                else { const p = await ensurePermissions(); setPermission(p); if (p.granted) scan(); }
              }}
              testID="home-request-perm"
              style={{ marginTop: 16 }}
            />
          </View>
        )}

        {/* Scanning skeleton */}
        {scanning && !results && (
          <View style={styles.scanningWrap}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonCard} />
            ))}
          </View>
        )}

        {/* Photo pair cards for each category */}
        {results && (Object.keys(CATEGORY_META) as Category[]).map((cat) => {
          const r = results[cat];
          if (r.totalItems === 0) return null;
          const pair = pairsByCat[cat];
          const meta = CATEGORY_META[cat];
          return (
            <PhotoPairCard
              key={cat}
              testID={`pair-card-${cat}`}
              title={meta.key === "duplicates" ? t("categories.duplicates_title")
                : meta.key === "similar" ? t("categories.similar_title")
                : meta.key === "similar_screenshots" ? t("categories.similar_screenshots_title")
                : meta.key === "similar_videos" ? t("categories.similar_videos_title")
                : meta.key === "screenshots" ? t("categories.screenshots_title")
                : meta.key === "videos" ? t("categories.videos_title")
                : meta.key === "blurry" ? t("categories.blurry_title")
                : meta.key === "chat" ? t("categories.chat_title")
                : t("categories.other_title")}
              iconName={meta.icon}
              leftAsset={pair?.left}
              rightAsset={pair?.right}
              count={r.totalItems}
              sizeLabel={formatSize(r.totalSizeMB)}
              onPress={() => onCategory(cat)}
            />
          );
        })}

        {/* Empty state after scan */}
        {results && totalFoundItems === 0 && (
          <View style={styles.emptyWrap} testID="home-all-clean">
            <Ionicons name="checkmark-circle" size={64} color="#34C759" />
            <Text style={styles.emptyTitle}>{t("home.all_clean_title_home")}</Text>
            <Text style={styles.emptySub}>{t("home.all_clean_sub_home")}</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Flash-Sale Banner — 10-Min Lifetime Angebot ── */}
      {!isPremium && isFlashActive && (
        <Pressable
          onPress={() => router.push("/paywall" as any)}
          testID="flash-sale-banner"
          style={[styles.flashBanner, { bottom: 8 }]}
        >
          <LinearGradient
            colors={["#FF6B00", "#FF3B30"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="flame" size={18} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.flashBannerTitle}>{t("home.flash_title")}</Text>
            <Text style={styles.flashBannerSub}>{t("home.flash_sub")}</Text>
          </View>
          <View style={styles.timerBox}>
            <Text style={styles.timerText}>{flashCountdown}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      )}

      {/* Pro Upsell Modal — jeden App-Start für Free-Nutzer */}
      <ProUpsellModal
        visible={showUpsell}
        onClose={() => setShowUpsell(false)}
        onUpgrade={() => {
          setShowUpsell(false);
          router.push("/paywall" as any);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  appName: { fontSize: 22, fontWeight: "800", color: "#000", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  proBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#007AFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  proText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  gearBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  quotaCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#F5F7FF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,122,255,0.15)",
  },
  quotaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  quotaTitle: { fontSize: 13, fontWeight: "700", color: "#000" },
  quotaValue: { fontSize: 13, fontWeight: "700", color: "#007AFF" },
  quotaBarsRow: { flexDirection: "row", gap: 16 },
  quotaCol: { flex: 1 },
  quotaLabel: { fontSize: 12, color: "#8E8E93", fontWeight: "600", marginBottom: 6 },
  quotaTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E4E7F2",
    overflow: "hidden",
  },
  quotaFill: { height: "100%", borderRadius: 3 },
  subtitle: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "500",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optimizeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  bannerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  bannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500", marginTop: 2 },
  scroll: { flex: 1 },
  permCard: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  permIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#EEF2FF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  permTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginBottom: 8 },
  permSub: { fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 20 },
  scanningWrap: { paddingHorizontal: 16, gap: 14 },
  skeletonCard: {
    height: 220, backgroundColor: "#F0F0F0", borderRadius: 20,
    opacity: 0.7,
  },
  emptyWrap: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#000", marginTop: 16 },
  emptySub: { fontSize: 14, color: "#8E8E93", textAlign: "center", marginTop: 8 },
  countdownBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#5856D6",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#5856D6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  countdownTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  countdownSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 1 },
  timerBox: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  timerText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  flashBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  flashBannerTitle: { color: "#fff", fontSize: 14, fontWeight: "800" },
  flashBannerSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 1 },
});
