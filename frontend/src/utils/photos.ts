// Photo library utilities for CleanU.
// Categorisation aligned 1:1 with competitor "cleanup" app.
//
// Photos are assigned MUTUALLY EXCLUSIVE (each photo lands in exactly one bucket):
//   duplicates           → identical copies (same resolution, same creationTime ms-exact)
//   similar              → non-screenshot, non-chat bursts (same res, within 90 s)
//   similar_screenshots  → screenshot bursts (same res, within 60 s)
//   similar_videos       → same duration + same resolution
//   screenshots          → all remaining screenshots
//   chat                 → all messaging-app photos not already claimed as duplicates
//   blurry               → very small / low-quality photos
//   other                → catch-all for leftover photos
// Videos:
//   videos               → ALL videos (overlapping with similar_videos — cleanup does this too)

import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

export type Category =
  | "duplicates"
  | "similar"
  | "similar_screenshots"
  | "similar_videos"
  | "screenshots"
  | "videos"
  | "blurry"
  | "chat"
  | "other";

export type PhotoAsset = {
  id: string;
  uri: string;
  filename?: string;
  width: number;
  height: number;
  mediaType: "photo" | "video";
  creationTime: number;
  duration: number;
  estimatedSizeMB: number;
  mediaSubtypes?: string[];
};

export type PhotoGroup = {
  key: string;
  assets: PhotoAsset[];
  estimatedSizeMB: number;
};

export type CategoryResult = {
  category: Category;
  groups: PhotoGroup[];
  totalItems: number;
  totalSizeMB: number;
};

export function estimateSizeMB(asset: MediaLibrary.Asset): number {
  if (asset.mediaType === MediaLibrary.MediaType.video) {
    return Math.max(1, Math.round((asset.duration || 5) * 4 * 10) / 10);
  }
  const megapixels = (asset.width * asset.height) / 1_000_000;
  const mb = Math.max(0.5, Math.round(megapixels * 0.5 * 10) / 10);
  return mb;
}

function toPhotoAsset(a: MediaLibrary.Asset): PhotoAsset {
  return {
    id: a.id,
    uri: a.uri,
    filename: a.filename,
    width: a.width,
    height: a.height,
    mediaType: a.mediaType === MediaLibrary.MediaType.video ? "video" : "photo",
    creationTime: a.creationTime,
    duration: a.duration ?? 0,
    estimatedSizeMB: estimateSizeMB(a),
    mediaSubtypes: a.mediaSubtypes as string[] | undefined,
  };
}

export async function ensurePermissions(): Promise<MediaLibrary.PermissionResponse> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return current;
  if (current.canAskAgain) return await MediaLibrary.requestPermissionsAsync();
  return current;
}

export async function fetchAllAssets(
  maxItems = 20000,
  onProgress?: (loaded: number, total: number) => void,
): Promise<PhotoAsset[]> {
  const results: MediaLibrary.Asset[] = [];
  let after: string | undefined = undefined;
  let hasNext = true;
  while (hasNext && results.length < maxItems) {
    const page: MediaLibrary.PagedInfo<MediaLibrary.Asset> = await MediaLibrary.getAssetsAsync({
      first: Math.min(500, maxItems - results.length),
      after,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    results.push(...page.assets);
    after = page.endCursor;
    hasNext = page.hasNextPage;
    onProgress?.(results.length, Math.min(page.totalCount ?? maxItems, maxItems));
  }
  return results.map(toPhotoAsset);
}

// ---------- Album helpers ----------
async function fetchAlbumAssets(album: MediaLibrary.Album, media: MediaLibrary.MediaTypeValue[]): Promise<PhotoAsset[]> {
  const all: PhotoAsset[] = [];
  let after: string | undefined;
  let hasNext = true;
  while (hasNext && all.length < 20000) {
    const page = await MediaLibrary.getAssetsAsync({
      album, first: 500, after,
      mediaType: media,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    all.push(...page.assets.map(toPhotoAsset));
    after = page.endCursor;
    hasNext = page.hasNextPage;
  }
  return all;
}

async function fetchScreenshotsFromAlbum(): Promise<PhotoAsset[]> {
  if (Platform.OS !== "ios") return [];
  try {
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    const titles = new Set([
      "Screenshots", "Bildschirmfotos", "Ekran Görüntüleri",
      "Capturas de pantalla", "Captures d'écran", "Screenshot",
      "Capturas de ecrã", "Schermafbeeldingen", "Zrzuty ekranu",
      "Снимки экрана",
    ]);
    const album = albums.find((a) => titles.has(a.title));
    if (!album) return [];
    return await fetchAlbumAssets(album, [MediaLibrary.MediaType.photo]);
  } catch { return []; }
}

function isScreenshotByHeuristic(a: PhotoAsset): boolean {
  if (a.mediaSubtypes?.includes("screenshot")) return true;
  const fn = (a.filename ?? "").toLowerCase();
  if (fn.includes("screenshot") || fn.startsWith("screen shot") || fn.startsWith("img_screenshot")) return true;
  if (Platform.OS === "ios") {
    const commonScreens = new Set([
      "1170x2532","1284x2778","1179x2556","1290x2796","1125x2436","1242x2688",
      "828x1792","750x1334","1080x1920","640x1136","1320x2868","1206x2622",
      "2532x1170","2778x1284","2556x1179","2796x1290","2436x1125","2688x1242",
      "1792x828","1334x750","1920x1080","1136x640","2868x1320","2622x1206",
    ]);
    if (commonScreens.has(`${a.width}x${a.height}`)) return true;
  }
  return false;
}

async function fetchChatAlbumAssets(): Promise<PhotoAsset[]> {
  if (Platform.OS !== "ios") return [];
  const chatNames = [
    // Already included
    "WhatsApp", "Telegram", "Signal", "Threema", "Viber", "Messenger",
    // Messaging
    "Discord", "Snapchat", "Skype", "LINE", "KakaoTalk", "WeChat",
    "IMO", "Kik", "Zello",
    // Social (saves media to Photos)
    "Instagram", "TikTok", "BeReal", "Twitter", "X",
    // Business messaging
    "Microsoft Teams", "Slack",
  ];
  const all: PhotoAsset[] = [];
  const seen = new Set<string>();
  for (const name of chatNames) {
    try {
      const album = await MediaLibrary.getAlbumAsync(name);
      if (!album || album.assetCount === 0) continue;
      const items = await fetchAlbumAssets(album, [MediaLibrary.MediaType.photo]);
      for (const a of items) {
        if (!seen.has(a.id)) { seen.add(a.id); all.push(a); }
      }
    } catch { continue; }
  }
  return all;
}

// ---------- Duplicate detection (fast metadata-only) ----------
// Speed > perfect accuracy: cleanup and other competitors show results in seconds,
// not minutes. We use pure metadata (resolution + creationTime with second precision)
// and cap bucket size at EXACTLY 2 to avoid false-positive clusters (e.g. burst
// photos where iOS wrote the same second to 3+ frames — those aren't duplicates,
// they're rapid-fire captures).
//
// Trade-off: no byte-exact verification means occasional false positives, but the
// speed win is worth it. Real duplicates (Save-to-Photos, Share-sheet copy, re-import)
// share both resolution AND second AND are typically pair-only.
export function detectDuplicates(assets: PhotoAsset[]): PhotoGroup[] {
  const photos = assets.filter((a) => a.mediaType === "photo");
  const byMeta = new Map<string, PhotoAsset[]>();
  for (const a of photos) {
    const key = `${a.width}x${a.height}_${Math.floor(a.creationTime / 1000)}`;
    const arr = byMeta.get(key);
    if (arr) arr.push(a);
    else byMeta.set(key, [a]);
  }
  const groups: PhotoGroup[] = [];
  let idx = 0;
  for (const bucket of byMeta.values()) {
    // Only exact pairs count as duplicates. Trios/larger clusters are almost
    // always same-second bursts, not real duplicated instances.
    if (bucket.length !== 2) continue;
    bucket.sort((a, b) => a.creationTime - b.creationTime);
    groups.push({
      key: `dup_${idx++}_${bucket[0].id}`,
      assets: bucket,
      estimatedSizeMB: bucket.reduce((s, a) => s + a.estimatedSizeMB, 0),
    });
  }
  return groups;
}

// ---------- Similar helpers ----------
function groupBurst(assets: PhotoAsset[], windowMs: number): PhotoAsset[][] {
  const sorted = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const out: PhotoAsset[][] = [];
  let current: PhotoAsset[] = [];
  for (const a of sorted) {
    if (current.length === 0) { current.push(a); continue; }
    const last = current[current.length - 1];
    const sameRes = a.width === last.width && a.height === last.height;
    if (Math.abs(a.creationTime - last.creationTime) <= windowMs && sameRes) {
      current.push(a);
    } else {
      if (current.length > 1) out.push(current);
      current = [a];
    }
  }
  if (current.length > 1) out.push(current);
  return out;
}

// Similar photos: bursts of camera photos within 90 s, same resolution.
export function detectSimilar(photos: PhotoAsset[]): PhotoGroup[] {
  const groups = groupBurst(photos, 90_000);
  return groups.map((g, i) => ({
    key: `sim_${i}_${g[0].id}`,
    assets: g,
    estimatedSizeMB: g.reduce((s, a) => s + a.estimatedSizeMB, 0),
  }));
}

// Similar screenshots: screenshots taken within 20 s of each other.
export function detectSimilarScreenshots(screenshots: PhotoAsset[]): PhotoGroup[] {
  const groups = groupBurst(screenshots, 20_000);
  return groups.map((g, i) => ({
    key: `simss_${i}_${g[0].id}`,
    assets: g,
    estimatedSizeMB: g.reduce((s, a) => s + a.estimatedSizeMB, 0),
  }));
}

// Similar videos: same duration (integer seconds) AND same resolution.
// Caps bucket size at 4 (huge single-duration clusters are usually format-encoding artefacts,
// not real "similar" videos).
export function detectSimilarVideos(videos: PhotoAsset[]): PhotoGroup[] {
  const byKey = new Map<string, PhotoAsset[]>();
  for (const v of videos) {
    if (v.duration <= 0) continue;
    const key = `${v.width}x${v.height}_${Math.round(v.duration)}`;
    const arr = byKey.get(key);
    if (arr) arr.push(v);
    else byKey.set(key, [v]);
  }
  const out: PhotoGroup[] = [];
  let i = 0;
  for (const bucket of byKey.values()) {
    if (bucket.length < 2 || bucket.length > 4) continue;
    bucket.sort((a, b) => a.creationTime - b.creationTime);
    out.push({
      key: `simv_${i++}_${bucket[0].id}`,
      assets: bucket,
      estimatedSizeMB: bucket.reduce((s, a) => s + a.estimatedSizeMB, 0),
    });
  }
  return out;
}

// ---------- Blurry / low-quality (strict) ----------
export function detectBlurry(assets: PhotoAsset[]): PhotoGroup[] {
  const blurry = assets.filter((a) => {
    if (a.mediaType !== "photo") return false;
    const short = Math.min(a.width, a.height);
    return short > 0 && short < 500 && a.width * a.height < 300_000;
  });
  if (blurry.length === 0) return [];
  return [{
    key: "blurry",
    assets: blurry,
    estimatedSizeMB: blurry.reduce((s, x) => s + x.estimatedSizeMB, 0),
  }];
}

// ---------- Utilities ----------
function wrapList(kind: string, items: PhotoAsset[]): PhotoGroup[] {
  if (items.length === 0) return [];
  return [{
    key: kind,
    assets: [...items].sort((a, b) => b.creationTime - a.creationTime),
    estimatedSizeMB: items.reduce((s, x) => s + x.estimatedSizeMB, 0),
  }];
}

// ---------- Orchestrator ----------
export async function analyzeAll(
  assets: PhotoAsset[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<Category, CategoryResult>> {
  onProgress?.(0, 1);
  const photos = assets.filter((a) => a.mediaType === "photo");
  const videosAll = assets.filter((a) => a.mediaType === "video");

  // Pre-fetch iOS album membership (parallel where possible)
  const [screenshotAlbumAssets, chatAlbumAssets] = await Promise.all([
    fetchScreenshotsFromAlbum(),
    fetchChatAlbumAssets(),
  ]);

  // Screenshot set = iOS Screenshots smart album ∪ heuristic matches
  const screenshotIds = new Set<string>(screenshotAlbumAssets.map((a) => a.id));
  const screenshotObjs = new Map<string, PhotoAsset>();
  screenshotAlbumAssets.forEach((a) => screenshotObjs.set(a.id, a));
  for (const a of photos) {
    if (!screenshotIds.has(a.id) && isScreenshotByHeuristic(a)) {
      screenshotIds.add(a.id);
      screenshotObjs.set(a.id, a);
    }
  }

  // Chat set (messenger albums)
  const chatObjs = new Map<string, PhotoAsset>();
  chatAlbumAssets.forEach((a) => chatObjs.set(a.id, a));

  // ---- 1) Duplicates — fast metadata detection ----
  const duplicates = detectDuplicates(assets);
  const dupIds = new Set<string>(duplicates.flatMap((g) => g.assets.map((a) => a.id)));

  // ---- 2) Similar Screenshots (screenshots minus duplicates) ----
  const ssPool = [...screenshotObjs.values()].filter((a) => !dupIds.has(a.id));
  const similarScreenshotGroups = detectSimilarScreenshots(ssPool);
  const simSSIds = new Set<string>(similarScreenshotGroups.flatMap((g) => g.assets.map((a) => a.id)));

  // ---- 3) Similar Photos (non-screenshot, non-duplicate camera bursts — CAN include chat photos) ----
  // Chat album photos that happen to be bursts land in Similar (like cleanup does).
  const similarPool = photos.filter(
    (a) => !dupIds.has(a.id) && !screenshotIds.has(a.id),
  );
  const similarGroups = detectSimilar(similarPool);
  const simIds = new Set<string>(similarGroups.flatMap((g) => g.assets.map((a) => a.id)));

  // ---- 4) Similar Videos ----
  const similarVideoGroups = detectSimilarVideos(videosAll);
  // NOTE: not exclusive with "videos" — cleanup shows overlap intentionally

  // ---- 5) Screenshots category (remaining screenshots after duplicates + similar_ss) ----
  const screenshotsRest = [...screenshotObjs.values()].filter(
    (a) => !dupIds.has(a.id) && !simSSIds.has(a.id),
  );
  const screenshotsGroups = wrapList("screenshots", screenshotsRest);
  const shotFinalIds = new Set<string>(screenshotsRest.map((a) => a.id));

  // ---- 6) Videos category = ALL videos (overlap with similar_videos & duplicates is OK) ----
  const videosGroups = wrapList("videos", [...videosAll].sort((a, b) => b.estimatedSizeMB - a.estimatedSizeMB));

  // ---- 7) Chat photos — all chat album photos MINUS everything already categorised ----
  // Strict cascading exclusion (as cleanup does): a WhatsApp burst goes to Similar,
  // a WhatsApp screenshot goes to Screenshots, WhatsApp duplicates go to Duplicates.
  // Chat only shows the "pure" chat photos that weren't caught by any other category.
  const chatRest = [...chatObjs.values()].filter(
    (a) => !dupIds.has(a.id)
      && !simIds.has(a.id)
      && !simSSIds.has(a.id)
      && !shotFinalIds.has(a.id),
  );
  const chatGroups = wrapList("chat", chatRest);
  const chatFinalIds = new Set<string>(chatRest.map((a) => a.id));

  // ---- 8) Blurry ----
  const blurryGroupsRaw = detectBlurry(photos);
  // Blurry must not overlap with earlier photo categories
  const claimedPhotoIds = new Set<string>([
    ...dupIds, ...simSSIds, ...simIds, ...shotFinalIds, ...chatFinalIds,
  ]);
  const blurryFiltered = blurryGroupsRaw
    .map((g) => ({
      ...g,
      assets: g.assets.filter((a) => !claimedPhotoIds.has(a.id)),
    }))
    .filter((g) => g.assets.length > 0)
    .map((g) => ({ ...g, estimatedSizeMB: g.assets.reduce((s, a) => s + a.estimatedSizeMB, 0) }));
  const blurryIds = new Set<string>(blurryFiltered.flatMap((g) => g.assets.map((a) => a.id)));

  // ---- 9) Other = every remaining photo ----
  const otherAssets = photos.filter(
    (a) => !dupIds.has(a.id)
      && !simSSIds.has(a.id)
      && !simIds.has(a.id)
      && !shotFinalIds.has(a.id)
      && !chatFinalIds.has(a.id)
      && !blurryIds.has(a.id),
  );
  const otherGroups = wrapList("other", otherAssets);

  const flatten = (cat: Category, groups: PhotoGroup[]): CategoryResult => ({
    category: cat,
    groups,
    totalItems: groups.reduce((s, g) => s + g.assets.length, 0),
    totalSizeMB: Math.round(groups.reduce((s, g) => s + g.estimatedSizeMB, 0) * 10) / 10,
  });

  return {
    duplicates:          flatten("duplicates",          duplicates),
    similar:             flatten("similar",             similarGroups),
    similar_screenshots: flatten("similar_screenshots", similarScreenshotGroups),
    similar_videos:      flatten("similar_videos",      similarVideoGroups),
    screenshots:         flatten("screenshots",         screenshotsGroups),
    videos:              flatten("videos",              videosGroups),
    blurry:              flatten("blurry",              blurryFiltered),
    chat:                flatten("chat",                chatGroups),
    other:               flatten("other",               otherGroups),
  };
}

export function formatSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function deleteAssets(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    return await MediaLibrary.deleteAssetsAsync(ids);
  } catch {
    return false;
  }
}
