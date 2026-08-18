// Kontakte Tab — echte Kontakt-Analyse mit expo-contacts
// Blaue Full-Width Buttons: Duplikate, Unvollständig, Sicherungen, Alle

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";

type ContactStats = {
  total: number;
  duplicates: number;
  incomplete: number;
  backups: number;
};

function normalizePhoneTab(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return "";
  if (digits.startsWith("0049")) return digits.slice(4);
  if (digits.startsWith("49") && digits.length >= 11) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function analyzeContacts(contacts: Contacts.Contact[]): ContactStats {
  const n = contacts.length;
  const parent: number[] = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(x: number, y: number): void {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  const nameIdx: Record<string, number> = {};
  const phoneIdx: Record<string, number> = {};
  const emailIdx: Record<string, number> = {};

  let incomplete = 0;
  contacts.forEach((c, i) => {
    const hasPhone = (c.phoneNumbers?.length ?? 0) > 0;
    const hasEmail = (c.emails?.length ?? 0) > 0;
    const hasName = !!(c.name ?? "").trim();
    if (!hasName || (!hasPhone && !hasEmail)) incomplete++;

    const nm = (c.name ?? "").trim().toLowerCase();
    if (nm) { if (nameIdx[nm] !== undefined) union(i, nameIdx[nm]); else nameIdx[nm] = i; }
    (c.phoneNumbers ?? []).forEach(p => {
      const num = normalizePhoneTab(p.number ?? p.digits ?? "");
      if (num.length >= 6) { if (phoneIdx[num] !== undefined) union(i, phoneIdx[num]); else phoneIdx[num] = i; }
    });
    (c.emails ?? []).forEach(e => {
      const em = (e.email ?? "").toLowerCase().trim();
      if (em) { if (emailIdx[em] !== undefined) union(i, emailIdx[em]); else emailIdx[em] = i; }
    });
  });

  // Gruppen zählen
  const rootCounts: Record<number, number> = {};
  contacts.forEach((_, i) => {
    const r = find(i);
    rootCounts[r] = (rootCounts[r] ?? 0) + 1;
  });
  const duplicateGroups = Object.values(rootCounts).filter(c => c > 1).length;

  return { total: contacts.length, duplicates: duplicateGroups, incomplete, backups: 0 };
}

export default function ContactsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") { setPermDenied(true); setLoading(false); return; }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });
      setStats(analyzeContacts(data));
    } catch (e) {
      console.warn("contacts scan failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    // Immer neu laden wenn keine Daten da — deckt auch den Fall ab,
    // dass User Permission in iOS-Einstellungen erteilt und zurückkommt
    if (!stats || permDenied) {
      setPermDenied(false);
      loadContacts();
    }
  }, [stats, permDenied, loadContacts]));

  const onContact = (type: string, count: number) => {
    if (count === 0 && type !== "all" && type !== "backups") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(`/tools/contact-detail?type=${type}` as any);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.title}>{t("contact_screen.title")}</Text>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        testID="contacts-scroll"
      >
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>{t("contact_screen.analyzing")}</Text>
          </View>
        )}

        {permDenied && (
          <View style={styles.permWrap}>
            <Ionicons name="people" size={56} color="#C7C7CC" />
            <Text style={styles.permTitle}>{t("contact_screen.no_access")}</Text>
            <Text style={styles.permSub}>{t("contact_screen.no_access_sub")}</Text>
            <Pressable onPress={() => Linking.openSettings()} testID="contacts-open-settings-btn" style={styles.permBtn}>
              <Text style={styles.permBtnText}>{t("common.open_settings")}</Text>
            </Pressable>
            <Pressable onPress={() => setPermDenied(false)} testID="contacts-retry-btn" style={styles.permRetryBtn}>
              <Text style={styles.permRetryText}>{t("contact_screen.retry")}</Text>
            </Pressable>
          </View>
        )}

        {stats && !loading && (
          <>
            <View style={styles.statsCard}>
              <Ionicons name="people" size={32} color="#007AFF" style={{ marginBottom: 8 }} />
              <Text style={styles.statsTotal}>{stats.total.toLocaleString()}</Text>
              <Text style={styles.statsTotalLabel}>{t("contact_screen.total")}</Text>
              <View style={styles.statsDivider} />
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: "#FF3B30" }]}>{stats.duplicates}</Text>
                  <Text style={styles.statLabel}>{t("contact_screen.duplicate_groups")}</Text>
                </View>
                <View style={[styles.statItem, styles.statItemBorder]}>
                  <Text style={[styles.statNum, { color: "#FF9500" }]}>{stats.incomplete}</Text>
                  <Text style={styles.statLabel}>{t("contact_screen.incomplete_label")}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: "#34C759" }]}>{stats.total - stats.duplicates * 2 - stats.incomplete > 0 ? stats.total - stats.duplicates * 2 - stats.incomplete : stats.total}</Text>
                  <Text style={styles.statLabel}>{t("contact_screen.ok")}</Text>
                </View>
              </View>
            </View>

            <ContactButton label={t("contact_screen.btn_duplicates")} icon="copy-outline" count={stats.duplicates}
              sub={t("contact_screen.btn_duplicates_sub", { count: stats.duplicates })} testID="contacts-duplicates-btn"
              accentColor="#FF3B30"
              onPress={() => onContact("duplicates", stats.duplicates)} />
            <ContactButton label={t("contact_screen.btn_incomplete")} icon="person-outline" count={stats.incomplete}
              sub={t("contact_screen.btn_incomplete_sub", { count: stats.incomplete })} testID="contacts-incomplete-btn"
              accentColor="#FF9500"
              onPress={() => onContact("incomplete", stats.incomplete)} />
            <ContactButton label={t("contact_screen.btn_backups")} icon="cloud-outline" count={stats.backups}
              sub={t("contact_screen.btn_backups_sub")} testID="contacts-backups-btn"
              accentColor="#5AC8FA"
              onPress={() => onContact("backups", stats.backups)} />
            <ContactButton label={t("contact_screen.btn_all")} icon="people-outline" count={stats.total}
              sub={t("contact_screen.btn_all_sub", { count: stats.total.toLocaleString() })} testID="contacts-all-btn"
              accentColor="#007AFF"
              onPress={() => onContact("all", stats.total)} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ContactButton({
  label, sub, count, icon, accentColor, onPress, testID,
}: {
  label: string; sub: string; count: number; icon?: string; accentColor?: string;
  onPress: () => void; testID?: string;
}) {
  return (
    <Pressable onPress={onPress} testID={testID}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.btnIconWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
        <Ionicons name={icon as any ?? "chevron-forward"} size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.btnLabel}>{label}</Text>
        <Text style={styles.btnSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#000000",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    letterSpacing: -0.5,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: { fontSize: 15, color: "#8E8E93", fontWeight: "500" },
  permWrap: { alignItems: "center", paddingVertical: 80, gap: 12, paddingHorizontal: 32 },
  permTitle: { fontSize: 20, fontWeight: "700", color: "#000" },
  permSub: { fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 20 },
  permBtn: {
    backgroundColor: "#007AFF", borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  permBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  permRetryBtn: { paddingVertical: 12 },
  permRetryText: { color: "#8E8E93", fontSize: 14, fontWeight: "500" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 14,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  btnIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnLabel: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  btnSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  // Stats card
  statsCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 24,
    padding: 20,
    alignItems: "center",
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  statsTotal: { fontSize: 42, fontWeight: "900", color: "#000", letterSpacing: -1.5 },
  statsTotalLabel: { fontSize: 14, color: "#8E8E93", fontWeight: "500", marginBottom: 16 },
  statsDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(0,0,0,0.08)", width: "100%", marginBottom: 16 },
  statsRow: { flexDirection: "row", width: "100%" },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statItemBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.08)" },
  statNum: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: "#8E8E93", textAlign: "center", lineHeight: 15 },
});
