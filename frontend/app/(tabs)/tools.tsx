import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import GradientBackground from "@/src/components/GradientBackground";

type ToolItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
  gradient: [string, string];
  premiumRequired?: boolean;
  badge?: string;
};

const TOOLS: ToolItem[] = [
  {
    id: "video-compress",
    icon: "videocam",
    title: "Video-Komprimierung",
    subtitle: "Videos verkleinern ohne Qualitätsverlust",
    route: "/tools/video-compress",
    gradient: ["#FF6B35", "#FF3B30"],
    badge: "NEU",
  },
  {
    id: "live-still",
    icon: "aperture",
    title: "Live → Standbild",
    subtitle: "Live Photos in normale Fotos umwandeln",
    route: "/tools/live-still",
    gradient: ["#34C759", "#30B350"],
  },
  {
    id: "secret-library",
    icon: "lock-closed",
    title: "Geheime Bibliothek",
    subtitle: "Private Fotos mit PIN & Face ID schützen",
    route: "/tools/secret-library",
    gradient: ["#AF52DE", "#8B44B8"],
    badge: "🔒 PRIVAT",
  },
  {
    id: "contacts",
    icon: "people",
    title: "Kontakt-Manager",
    subtitle: "Duplikate & unvollständige Kontakte finden",
    route: "/tools/contacts",
    gradient: ["#5AC8FA", "#32ADE6"],
    premiumRequired: true,
  },
];

export default function Tools() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  return (
    <GradientBackground>
      <ScrollView
        testID="tools-scroll"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={[{ color: t.colors.brandPrimary }, styles.eyebrow]}>
          EXTRA-TOOLS
        </Text>
        <Text style={[t.type.h1, { color: t.colors.onSurface, marginTop: 4 }]}>
          Extras
        </Text>
        <Text
          style={[
            t.type.caption,
            { color: t.colors.onSurfaceTertiary, marginTop: 6, marginBottom: 24 },
          ]}
        >
          Mehr als nur Fotos — optimiere dein ganzes iPhone.
        </Text>

        {/* Tool cards */}
        <View style={styles.list}>
          {TOOLS.map((tool, index) => {
            const isLocked = tool.premiumRequired && !user?.is_premium;
            return (
              <Pressable
                key={tool.id}
                testID={`tool-${tool.id}`}
                onPress={() => router.push(tool.route as any)}
                style={({ pressed }) => [
                  styles.toolCard,
                  {
                    backgroundColor:
                      t.mode === "dark"
                        ? "rgba(28,28,30,0.7)"
                        : "rgba(255,255,255,0.8)",
                    borderColor:
                      t.mode === "dark"
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(0,0,0,0.06)",
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                  t.shadow(1),
                ]}
              >
                {/* Icon */}
                <View style={styles.iconWrap}>
                  <LinearGradient
                    colors={tool.gradient}
                    style={styles.iconGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name={tool.icon} size={22} color="#FFFFFF" />
                  </LinearGradient>
                </View>

                {/* Text */}
                <View style={styles.textWrap}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[t.type.body, { color: t.colors.onSurface, fontWeight: "700" }]}
                      numberOfLines={1}
                    >
                      {tool.title}
                    </Text>
                    {tool.badge && (
                      <View
                        style={[
                          styles.smallBadge,
                          {
                            backgroundColor:
                              tool.id === "secret-library"
                                ? "rgba(175,82,222,0.15)"
                                : "rgba(255,59,48,0.12)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.smallBadgeText,
                            {
                              color:
                                tool.id === "secret-library"
                                  ? "#AF52DE"
                                  : t.colors.error,
                            },
                          ]}
                        >
                          {tool.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}
                    numberOfLines={1}
                  >
                    {tool.subtitle}
                  </Text>
                </View>

                {/* Right arrow / PRO badge */}
                {isLocked ? (
                  <View style={[styles.proPill, { backgroundColor: t.colors.brandPrimary }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={styles.proText}>PRO</Text>
                  </View>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={t.colors.onSurfaceTertiary}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Premium teaser */}
        {!user?.is_premium && (
          <Pressable
            testID="tools-upgrade-banner"
            onPress={() => router.push("/paywall")}
            style={({ pressed }) => [
              styles.upgradeBanner,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <LinearGradient
              colors={["#007AFF", "#4F46E5"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            <View style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={[styles.starIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <Ionicons name="sparkles" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.upgradeTitle}>Alle Tools freischalten</Text>
                <Text style={styles.upgradeSub}>
                  CleanU Premium · ab 4,99 €/Woche
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
          </Pressable>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  list: {
    gap: 10,
    marginBottom: 20,
  },
  toolCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    borderRadius: 14,
    overflow: "hidden",
  },
  iconGradient: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  smallBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  smallBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  proPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  proText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  upgradeBanner: {
    borderRadius: 20,
    overflow: "hidden",
    marginTop: 4,
  },
  starIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  upgradeSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
});
