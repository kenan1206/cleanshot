// Contacts Manager Screen
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import GradientBackground from "@/src/components/GradientBackground";
import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import { useRevenueCat } from "@/src/lib/revenuecat";

export default function Contacts() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const rc = useRevenueCat();
  const isPremium = rc.isSubscribed || !!user?.is_premium;

  return (
    <GradientBackground>
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
            <Ionicons name="chevron-back" size={24} color={t.colors.brandPrimary} />
          </Pressable>
          <Text style={[t.type.title, { color: t.colors.onSurface }]}>Kontakt-Manager</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <LinearGradient colors={["#5AC8FA", "#32ADE6"]} style={styles.iconGradient}>
              <Ionicons name="people" size={44} color="#fff" />
            </LinearGradient>
          </View>

          {!isPremium && (
            <View style={[styles.proBadge, { backgroundColor: "#5AC8FA" }]}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.proText}>PREMIUM FEATURE</Text>
            </View>
          )}

          <Text style={[t.type.h2, { color: t.colors.onSurface, marginTop: 16, textAlign: "center" }]}>
            Kontakt-Manager
          </Text>
          <Text
            style={[
              t.type.body,
              { color: t.colors.onSurfaceTertiary, marginTop: 12, textAlign: "center", paddingHorizontal: 32 },
            ]}
          >
            Finde Duplikate, unvollständige Kontakte und räume deine Kontaktliste auf.
          </Text>

          <View style={[styles.featuresCard, { backgroundColor: t.mode === "dark" ? "rgba(90,200,250,0.1)" : "rgba(90,200,250,0.07)" }]}>
            {[
              { icon: "copy-outline", text: "Duplikate automatisch erkennen" },
              { icon: "person-add-outline", text: "Fehlende Infos ergänzen" },
              { icon: "checkmark-circle-outline", text: "Kontakte zusammenführen" },
            ].map((f) => (
              <View key={f.icon} style={styles.featureRow}>
                <Ionicons name={f.icon as any} size={18} color="#5AC8FA" />
                <Text style={[t.type.caption, { color: t.colors.onSurface }]}>{f.text}</Text>
              </View>
            ))}
          </View>

          {!isPremium && (
            <Pressable
              testID="contacts-upgrade-btn"
              onPress={() => router.push("/paywall")}
              style={styles.upgradeBtn}
            >
              <LinearGradient
                colors={["#5AC8FA", "#007AFF"]}
                style={styles.upgradeGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.upgradeBtnText}>Premium freischalten</Text>
              </LinearGradient>
            </Pressable>
          )}

          {isPremium && (
            <View style={[styles.badge, { backgroundColor: "#5AC8FA20" }]}>
              <Ionicons name="construct" size={14} color="#5AC8FA" />
              <Text style={[styles.badgeText, { color: "#5AC8FA" }]}>Wird gebaut</Text>
            </View>
          )}
        </View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  iconWrap: { borderRadius: 28, overflow: "hidden" },
  iconGradient: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 14,
  },
  proText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  featuresCard: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginTop: 20,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  upgradeBtn: { width: "100%", borderRadius: 14, overflow: "hidden", marginTop: 20, height: 52 },
  upgradeGrad: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  upgradeBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
});
