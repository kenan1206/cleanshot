import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LegalDoc } from "@/src/legal/content";

interface Props {
  doc: LegalDoc;
  accentColor?: string;
}

export default function LegalScreen({ doc, accentColor = "#007AFF" }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="legal-back-btn" hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={accentColor} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{doc.heading}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.heroIcon, { backgroundColor: accentColor + "18" }]}>
            <Ionicons
              name={accentColor === "#34C759" ? "shield-checkmark-outline" : "document-text-outline"}
              size={32}
              color={accentColor}
            />
          </View>
          <Text style={s.heroTitle}>{doc.heading}</Text>
          <Text style={s.heroSub}>{doc.updated}</Text>
        </View>

        {/* Sections */}
        {doc.sections.map((section, idx) => (
          <View key={idx} style={s.section}>
            <Text style={[s.sectionTitle, { color: accentColor }]}>{section.title}</Text>
            <Text style={s.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>CleanU · kenanplayer.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FAFAFA" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#000", flex: 1, textAlign: "center" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  hero: {
    alignItems: "center",
    marginBottom: 32,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: "center",
  },
  heroSub: {
    fontSize: 13,
    color: "#8E8E93",
    textAlign: "center",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  sectionBody: {
    fontSize: 15,
    color: "#3C3C43",
    lineHeight: 22,
  },
  footer: {
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
  footerText: {
    fontSize: 12,
    color: "#C7C7CC",
    letterSpacing: 0.2,
  },
});
