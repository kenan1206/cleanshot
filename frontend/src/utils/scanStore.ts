// Small in-memory store to share the last scan result across screens without props drilling.
// Not persisted intentionally — Home screen re-runs scan on focus.

import { CategoryResult, Category, PhotoAsset } from "@/src/utils/photos";

let lastResults: Record<Category, CategoryResult> | null = null;
let lastAssets: PhotoAsset[] = [];

export const scanStore = {
  set(results: Record<Category, CategoryResult>, assets: PhotoAsset[]) {
    lastResults = results;
    lastAssets = assets;
  },
  get(): { results: Record<Category, CategoryResult> | null; assets: PhotoAsset[] } {
    return { results: lastResults, assets: lastAssets };
  },
  removeIds(ids: Set<string>) {
    if (!lastResults) return;
    const newResults = { ...lastResults } as Record<Category, CategoryResult>;
    (Object.keys(newResults) as Category[]).forEach((cat) => {
      const cr = newResults[cat];
      const groups = cr.groups
        .map((g) => ({
          ...g,
          assets: g.assets.filter((a) => !ids.has(a.id)),
          estimatedSizeMB: g.assets.filter((a) => !ids.has(a.id)).reduce((s, a) => s + a.estimatedSizeMB, 0),
        }))
        .filter((g) => g.assets.length > 0);
      newResults[cat] = {
        ...cr,
        groups,
        totalItems: groups.reduce((s, g) => s + g.assets.length, 0),
        totalSizeMB: Math.round(groups.reduce((s, g) => s + g.estimatedSizeMB, 0) * 10) / 10,
      };
    });
    lastResults = newResults;
    lastAssets = lastAssets.filter((a) => !ids.has(a.id));
  },
};
