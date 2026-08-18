// Optimieren Tab — Fix: SortBy.fileSize entfernt, Permissions explizit anfordern, Fallback
import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import PhotoPairCard from "@/src/components/PhotoPairCard";
import { PhotoAsset, formatSize } from "@/src/utils/photos";
import { useTranslation } from "react-i18next";

type OptimizeData = {
  videos: { count: number; sizeMB: number; sample: PhotoAsset[] };
  livePhotos: { count: number; sizeMB: number; sample: PhotoAsset[] };
};

export default function OptimizeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [data, setData] = useState<OptimizeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [permStatus, setPermStatus] = useState<"unknown" | "denied" | "granted">("unknown");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted && !perm.accessPrivileges) {
        setPermStatus("denied");
        setLoading(false);
        return;
      }
      setPermStatus("granted");

      // ⚠️ NO sortBy — SortBy.fileSize not available in all SDK versions
      const videoResult = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: 200,
      }).catch(() => ({ assets: [], totalCount: 0 }));

      const videoSamples: PhotoAsset[] = videoResult.assets.slice(0, 2).map((a) => ({
        id: a.id, uri: a.uri, width: a.width, height: a.height, fileSize: 0, mediaType: "video" as const,
      }));
      // estimate: average 100MB per minute of video
      const videoSizeMB = videoResult.assets.reduce((s, a) => s + Math.max(1, (a.duration / 60) * 100), 0);

      // Paginiert scannen für korrekte Anzahl (wie live-still.tsx)
      const isLivePhoto = (a: MediaLibrary.Asset): boolean =>
        !!(a.mediaSubtypes?.includes("livePhoto")) || a.duration > 0;

      const allLivePhotos: MediaLibrary.Asset[] = [];
      let liveCursor: string | undefined;
      let liveScanned = 0;
      do {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: MediaLibrary.MediaType.photo,
          first: 500,
          after: liveCursor,
        }).catch(() => ({ assets: [], hasNextPage: false, endCursor: "" }));
        allLivePhotos.push(...page.assets.filter(isLivePhoto));
        liveCursor = page.endCursor;
        liveScanned += page.assets.length;
        if (!page.hasNextPage || liveScanned >= 5000) break;
      } while (true);

      const livePhotos = allLivePhotos;
      const liveSamples: PhotoAsset[] = livePhotos.slice(0, 2).map((a) => ({
        id: a.id, uri: a.uri, width: a.width, height: a.height, fileSize: 0, mediaType: "photo" as const,
      }));
      // ~4MB pro Live Photo (Foto + Video-Anteil)
      const liveSizeMB = livePhotos.length * 4;

      setData({
        videos: { count: videoResult.totalCount || videoResult.assets.length, sizeMB: videoSizeMB, sample: videoSamples },
        livePhotos: {
          count: livePhotos.length, // exakte Anzahl, kein Fallback auf alle Fotos!
          sizeMB: liveSizeMB,
          sample: liveSamples,
        },
      });
    } catch (e) {
      console.warn("optimize scan failed:", e);
      setPermStatus("denied");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.title}>{t("optimize.title")}</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} testID="optimize-scroll">

        {/* Spinner nur beim ersten Scan (kein data vorhanden) */}
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>{t("optimize.analyzing")}</Text>
          </View>
        )}

        {!loading && !data && permStatus === "denied" && (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🎬</Text>
            <Text style={styles.emptyTitle}>{t("optimize.access_required")}</Text>
            <Text style={styles.emptySub}>{t("optimize.access_sub")}</Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.permBtn}>
              <Text style={styles.permBtnText}>{t("common.open_settings")}</Text>
            </Pressable>
          </View>
        )}

        {data && (
          <>
            <PhotoPairCard
              testID="optimize-videos-card"
              title={t("tools.video_compress")}
              iconName="videocam-outline"
              leftAsset={data.videos.sample[0]}
              rightAsset={data.videos.sample[1] ?? data.videos.sample[0]}
              count={data.videos.count}
              sizeLabel={formatSize(data.videos.sizeMB)}
              onPress={() => router.push("/tools/video-compress" as any)}
            />
            <PhotoPairCard
              testID="optimize-live-card"
              title={t("tools.live_still")}
              iconName="aperture-outline"
              leftAsset={data.livePhotos.sample[0]}
              rightAsset={data.livePhotos.sample[1] ?? data.livePhotos.sample[0]}
              count={data.livePhotos.count}
              sizeLabel={formatSize(data.livePhotos.sizeMB)}
              onPress={() => router.push("/tools/live-still" as any)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  title: { fontSize: 32, fontWeight: "900", color: "#000000", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, letterSpacing: -0.5 },
  content: { paddingTop: 12, paddingBottom: 40, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 60 },
  loadingText: { fontSize: 15, color: "#8E8E93", fontWeight: "500", marginTop: 16 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#000", marginBottom: 8 },
  emptySub: { fontSize: 14, color: "#8E8E93", textAlign: "center", lineHeight: 20 },
  permBtn: { marginTop: 20, backgroundColor: "#007AFF", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  permBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
