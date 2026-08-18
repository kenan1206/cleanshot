import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/src/theme/ThemeContext";
import { useApp } from "@/src/context/AppContext";
import GradientBackground from "@/src/components/GradientBackground";
import GlassCard from "@/src/components/GlassCard";
import { api } from "@/src/api/client";
import { formatSize } from "@/src/utils/photos";
import { CATEGORY_META } from "@/src/components/CategoryCard";

type Session = {
  id: string;
  category: string;
  photos_cleaned: number;
  mb_freed: number;
  timestamp: string;
};

type SessionsResp = {
  sessions: Session[];
  total_mb_freed: number;
  total_photos_cleaned: number;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function History() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const { deviceId } = useApp();

  const [data, setData] = useState<SessionsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const res = await api.get<SessionsResp>(`/sessions/${deviceId}`);
      setData(res);
    } catch {
      setData({ sessions: [], total_mb_freed: 0, total_photos_cleaned: 0 });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Aggregate freed space per category/type (Videos, Live-Fotos, Duplikate, …)
  const byType = useMemo(() => {
    const map: Record<string, { category: string; count: number; mb: number }> = {};
    (data?.sessions ?? []).forEach((s) => {
      const k = s.category || "other";
      if (!map[k]) map[k] = { category: k, count: 0, mb: 0 };
      map[k].count += s.photos_cleaned;
      map[k].mb += s.mb_freed;
    });
    return Object.values(map)
      .filter((x) => x.count > 0 || x.mb > 0)
      .sort((a, b) => b.mb - a.mb);
  }, [data]);

  return (
    <GradientBackground>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={t.colors.brandPrimary}
          />
        }
        testID="history-scroll"
      >
        <Text style={[t.type.micro, { color: t.colors.brandPrimary }]}>{tr("history.eyebrow")}</Text>
        <Text style={[t.type.h1, { color: t.colors.onSurface, marginTop: 4 }]}>{tr("history.title")}</Text>

        <View style={{ height: 20 }} />

        <GlassCard>
          <View style={styles.totalsRow}>
            <View style={styles.totalCell}>
              <Text style={[t.type.hero, { color: t.colors.onSurface }]}>
                {formatSize(data?.total_mb_freed ?? 0)}
              </Text>
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 4 }]}>
                {tr("history.total_freed")}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalCell}>
              <Text style={[t.type.hero, { color: t.colors.onSurface }]}>{data?.total_photos_cleaned ?? 0}</Text>
              <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 4 }]}>
                {tr("history.items_cleaned")}
              </Text>
            </View>
          </View>
        </GlassCard>

        {byType.length > 0 && (
          <>
            <View style={{ height: 24 }} />
            <Text style={[t.type.title, { color: t.colors.onSurface, marginBottom: 12 }]}>
              {tr("history.by_type")}
            </Text>
            <View style={{ gap: 10 }}>
              {byType.map((bt) => {
                const meta =
                  (CATEGORY_META as Record<string, { titleKey: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap; colorKey: string }>)[bt.category] ??
                  { titleKey: "categories.other_title", icon: "albums-outline", colorKey: "categoryGreen" };
                const accent = t.colors[meta.colorKey as keyof typeof t.colors] as string;
                return (
                  <View
                    key={bt.category}
                    testID={`history-type-${bt.category}`}
                    style={[
                      styles.row,
                      {
                        backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.7)",
                        borderColor: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                      },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: accent + "22" }]}>
                      <Ionicons name={meta.icon} size={20} color={accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.type.body, { color: t.colors.onSurface }]}>{tr(meta.titleKey)}</Text>
                      <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>
                        {bt.count} · {formatSize(bt.mb)}
                      </Text>
                    </View>
                    <Text style={[t.type.title, { color: t.colors.success }]}>+{formatSize(bt.mb)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
        <Text style={[t.type.title, { color: t.colors.onSurface, marginBottom: 12 }]}>{tr("history.recent")}</Text>

        {loading && !data && (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={t.colors.brandPrimary} />
          </View>
        )}

        {data && data.sessions.length === 0 && (
          <GlassCard>
            <View style={{ alignItems: "center", paddingVertical: 24 }} testID="history-empty">
              <View style={[styles.emptyIcon, { backgroundColor: t.colors.brandPrimary + "22" }]}>
                <Ionicons name="sparkles-outline" size={30} color={t.colors.brandPrimary} />
              </View>
              <Text style={[t.type.title, { color: t.colors.onSurface, marginTop: 12 }]}>
                {tr("history.empty_title")}
              </Text>
              <Text
                style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 6, textAlign: "center", paddingHorizontal: 24 }]}
              >
                {tr("history.empty_sub")}
              </Text>
            </View>
          </GlassCard>
        )}

        {data && data.sessions.length > 0 && (
          <View style={{ gap: 10 }}>
            {data.sessions.map((s) => {
              const meta =
                (CATEGORY_META as Record<string, { titleKey: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap; colorKey: string }>)[s.category] ??
                { titleKey: "categories.duplicates_title", icon: "sparkles-outline", colorKey: "categoryBlue" };
              const accent = t.colors[meta.colorKey as keyof typeof t.colors] as string;
              return (
                <View
                  key={s.id}
                  style={[
                    styles.row,
                    {
                      backgroundColor: t.mode === "dark" ? "rgba(28,28,30,0.55)" : "rgba(255,255,255,0.7)",
                      borderColor: t.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                    },
                  ]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: accent + "22" }]}>
                    <Ionicons name={meta.icon} size={20} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[t.type.body, { color: t.colors.onSurface }]}>{tr(meta.titleKey)}</Text>
                    <Text style={[t.type.caption, { color: t.colors.onSurfaceTertiary, marginTop: 2 }]}>
                      {tr("history.session_meta", { date: formatDate(s.timestamp), count: s.photos_cleaned })}
                    </Text>
                  </View>
                  <Text style={[t.type.title, { color: t.colors.success }]}>+{formatSize(s.mb_freed)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalCell: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 60,
    backgroundColor: "rgba(128,128,128,0.2)",
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
