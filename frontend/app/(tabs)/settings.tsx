import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Linking, Modal, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";
import GradientBackground from "@/src/components/GradientBackground";
import { SUPPORTED_LANGUAGES, setLanguage, currentLanguage, LanguageCode } from "@/src/i18n";

export default function Settings() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const rc = useRevenueCat();

  const [langOpen, setLangOpen] = useState(false);
  const [, forceRender] = useState(0);

  const doRestore = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const info = await rc.restore();
      const isActive = !!(info.entitlements.active?.["CleanU Pro"]);
      Alert.alert(tr("settings.restore_title"), isActive ? tr("settings.restore_ok") : tr("settings.restore_none"));
    } catch {
      Alert.alert(tr("settings.restore_title"), tr("settings.restore_none"));
    }
  };

  const openTerms = () => router.push("/legal/terms" as any);
  const openPrivacy = () => router.push("/legal/privacy" as any);

  const pickLang = useCallback(async (code: LanguageCode) => {
    Haptics.selectionAsync().catch(() => {});
    await setLanguage(code);
    setLangOpen(false);
    forceRender((n) => n + 1);
  }, []);

  const current = currentLanguage();
  const currentLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === current)?.label ?? "English";
  const currentFlag = SUPPORTED_LANGUAGES.find((l) => l.code === current)?.flag ?? "🇬🇧";

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        testID="settings-scroll"
      >
        <Text style={[t.type.micro, { color: t.colors.brandPrimary }]}>{tr("settings.eyebrow")}</Text>
        <Text style={[t.type.h1, { color: t.colors.onSurface, marginTop: 4 }]}>{tr("settings.title")}</Text>

        <View style={{ height: 20 }} />

        {/* ── Gratis-Kontingent / Premium Bar ── */}
        {user?.is_premium ? (
          <View style={[styles.proCard, { backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "#EEF2FF" }]}>
            <View style={styles.proCardInner}>
              <Ionicons name="diamond" size={28} color="#007AFF" style={{ marginBottom: 6 }} />
              <Text style={[styles.proCardTitle, { color: "#007AFF" }]}>CleanU Pro</Text>
              <Text style={[styles.proCardPlan, { color: t.colors.onSurfaceTertiary }]}>
                {user.plan === "lifetime" ? tr("settings.plan_lifetime_short") : tr("settings.plan_weekly_short")}
              </Text>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push("/paywall")}
            testID="settings-quota-card"
            style={[styles.quotaCard, { backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "#F5F7FF" }]}
          >
            <View style={styles.quotaHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="battery-half-outline" size={16} color="#007AFF" />
                <Text style={styles.quotaTitle}>{tr("home.quota_title")}</Text>
              </View>
              <Text style={styles.quotaValue}>
                {tr("home.quota_mb", { used: Math.round(user?.free_mb_used ?? 0), limit: 100 })}
              </Text>
            </View>
            <View style={styles.quotaTrack}>
              <View style={[
                styles.quotaFill,
                {
                  width: `${Math.min(100, ((user?.free_mb_used ?? 0) / 100) * 100)}%`,
                  backgroundColor: (user?.free_mb_used ?? 0) >= 100 ? "#FF3B30" : "#007AFF",
                },
              ]} />
            </View>
            <Text style={[styles.quotaUpgradeTip, { color: t.colors.brandPrimary }]}>
              {tr("settings.upgrade")} →
            </Text>
          </Pressable>
        )}

        <View style={{ height: 20 }} />

        <View style={[styles.list, listBg(t)]}>
          <SettingsRow
            icon="globe-outline"
            label={tr("settings.row_language")}
            rightLabel={`${currentFlag}  ${currentLangLabel}`}
            onPress={() => setLangOpen(true)}
            testID="settings-language"
          />
          <Divider />
          <SettingsRow icon="refresh-outline" label={tr("settings.row_restore")} onPress={doRestore} testID="settings-restore" />
          <Divider />
          <SettingsRow icon="lock-closed-outline" label={tr("settings.row_privacy")} onPress={openPrivacy} testID="settings-privacy" />
          <Divider />
          <SettingsRow icon="document-text-outline" label={tr("settings.row_terms")} onPress={openTerms} testID="settings-terms" />
          <Divider />
          <SettingsRow
            icon="mail-outline"
            label={tr("settings.row_support")}
            onPress={() => Linking.openURL("mailto:kenanveo1907@gmail.com")}
            testID="settings-support"
          />
        </View>

        <View style={{ height: 20 }} />

        {/* ── Device ID ── */}
        <DeviceIdCard deviceId={user?.device_id ?? ""} />

        <View style={{ height: 8 }} />

      </ScrollView>

      <Modal visible={langOpen} transparent animationType="slide" onRequestClose={() => setLangOpen(false)}>
        <Pressable onPress={() => setLangOpen(false)} style={styles.modalBackdrop} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.mode === "dark" ? "#1C1C1E" : "#FFFFFF",
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: t.colors.border }]} />
          <Text style={[t.type.title, { color: t.colors.onSurface, marginTop: 8, textAlign: "center" }]}>
            {tr("settings.language_title")}
          </Text>
          <Text
            style={[
              t.type.caption,
              { color: t.colors.onSurfaceTertiary, marginTop: 4, marginBottom: 12, textAlign: "center" },
            ]}
          >
            {tr("settings.language_sub")}
          </Text>
          <ScrollView>
            {SUPPORTED_LANGUAGES.map((l) => {
              const active = l.code === current;
              return (
                <Pressable
                  key={l.code}
                  onPress={() => pickLang(l.code)}
                  testID={`lang-${l.code}`}
                  style={({ pressed }) => [
                    styles.langRow,
                    {
                      backgroundColor: pressed ? (t.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)") : "transparent",
                    },
                  ]}
                >
                  <Text style={styles.langFlag}>{l.flag}</Text>
                  <Text style={[t.type.body, { color: t.colors.onSurface, flex: 1 }]}>{l.label}</Text>
                  {active && <Ionicons name="checkmark-circle" size={22} color={t.colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </GradientBackground>
  );
}

function DeviceIdCard({ deviceId }: { deviceId: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation();

  const handleCopy = async () => {
    if (!deviceId) return;
    await Share.share({ message: deviceId });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  if (!deviceId) return null;

  return (
    <View style={[styles.deviceCard, { backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.7)", borderColor: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }]}>
      <View style={styles.deviceHeader}>
        <Ionicons name="phone-portrait-outline" size={15} color={t.colors.onSurfaceTertiary} />
        <Text style={[styles.deviceLabel, { color: t.colors.onSurfaceTertiary }]}>{tr("settings.device_id_label")}</Text>
      </View>
      <Pressable onPress={handleCopy} testID="device-id-copy" style={styles.deviceRow}>
        <Text style={[styles.deviceId, { color: t.colors.onSurface }]} numberOfLines={1} ellipsizeMode="middle">
          {deviceId}
        </Text>
        <View style={[styles.copyBadge, { backgroundColor: t.mode === "dark" ? "rgba(255,255,255,0.1)" : "#EEF2FF" }]}>
          <Ionicons name="share-outline" size={14} color={t.colors.brandPrimary} />
          <Text style={[styles.copyText, { color: t.colors.brandPrimary }]}>
            {tr("settings.device_id_copy")}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function listBg(t: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.7)",
    borderColor: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  };
}

function SettingsRow({
  icon,
  label,
  onPress,
  destructive,
  rightLabel,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  rightLabel?: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.rowItem, { backgroundColor: pressed ? (t.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)") : "transparent" }]}
    >
      <Ionicons name={icon} size={20} color={destructive ? t.colors.error : t.colors.brandPrimary} />
      <Text style={[t.type.body, { flex: 1, color: destructive ? t.colors.error : t.colors.onSurface }]}>{label}</Text>
      {rightLabel ? (
        <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary }]}>{rightLabel}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={t.colors.onSurfaceTertiary} />
    </Pressable>
  );
}

function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.divider, marginLeft: 52 }} />;
}

const styles = StyleSheet.create({
  proCard: {
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: "rgba(0,122,255,0.2)",
    alignItems: "center",
  },
  proCardInner: { alignItems: "center" },
  proCardTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  proCardPlan: {
    fontSize: 14,
    fontWeight: "500",
  },
  quotaCard: {
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
  quotaTrack: { height: 6, borderRadius: 3, backgroundColor: "#E4E7F2", overflow: "hidden" },
  quotaFill: { height: "100%", borderRadius: 3 },
  quotaUpgradeTip: { fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "right" },
  list: { borderRadius: 18, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  rowItem: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: "70%",
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 6,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  langFlag: { fontSize: 22 },
  deviceCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deviceHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  deviceLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  deviceId: { flex: 1, fontSize: 13, fontWeight: "500", fontFamily: "monospace" },
  copyBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  copyText: { fontSize: 12, fontWeight: "600" },
});
