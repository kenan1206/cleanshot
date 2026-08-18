// Extras Tab — i18n vollständig
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useApp } from "@/src/context/AppContext";

export default function ExtrasTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useApp();

  const MENU = [
    {
      section: t("extras_screen.section_private"),
      items: [
        {
          testID: "extras-row-secret-library",
          icon: "lock-closed-outline",
          iconColor: "#5856D6",
          iconBg: "#5856D618",
          title: t("tools.secret_library"),
          sub: t("tools.secret_library_sub"),
          route: "/tools/secret-library",
        },
      ],
    },
    {
      section: t("extras_screen.section_activity"),
      items: [
        {
          testID: "extras-row-history",
          icon: "time-outline",
          iconColor: "#FF9500",
          iconBg: "#FF950018",
          title: t("history.title"),
          sub: t("extras_screen.history_sub"),
          route: "/(tabs)/history",
        },
      ],
    },
    {
      section: t("extras_screen.section_app"),
      items: [
        {
          testID: "extras-row-settings",
          icon: "settings-outline",
          iconColor: "#8E8E93",
          iconBg: "#8E8E9318",
          title: t("settings.title"),
          sub: t("extras_screen.settings_sub"),
          route: "/(tabs)/settings",
        },
      ],
    },
  ];

  const navigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push(route as any);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Text style={s.title}>{t("tools.title")}</Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {MENU.map(({ section, items }) => (
          <View key={section} style={s.section}>
            <Text style={s.sectionLabel}>{section}</Text>
            <View style={s.card}>
              {items.map((item, idx) => (
                <TouchableOpacity
                  key={item.testID}
                  testID={item.testID}
                  style={[s.row, idx > 0 && s.rowBorder]}
                  onPress={() => navigate(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={[s.iconWrap, { backgroundColor: item.iconBg }]}>
                    <Ionicons name={item.icon as any} size={22} color={item.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.rowTitle}>{item.title}</Text>
                      {item.route === "/tools/secret-library" && !user?.is_premium && !user?.is_lifetime && (
                        <View testID="secret-library-free-badge" style={[s.proBadge, { backgroundColor: "#34C759" }]}>
                          <Text style={s.proBadgeText}>{t("extras_screen.secret_library_free_badge")}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.rowSub}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F2F2F7" },
  title: { fontSize: 32, fontWeight: "900", color: "#000", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 16 },
  section: { marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "600", color: "#8E8E93", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 14, backgroundColor: "#fff" },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.06)" },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 16, fontWeight: "600", color: "#000" },
  rowSub: { fontSize: 13, color: "#8E8E93", marginTop: 2 },
  proBadge: { backgroundColor: "#007AFF", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  proBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
});
