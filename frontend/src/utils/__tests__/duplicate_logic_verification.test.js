// Standalone Node verification of the duplicate-detection bucketing algorithm.
// Re-implements the SAME bucketing logic as detectDuplicates() in photos.ts
// (resolution bucket -> exact byte-size match) using mocked assets + mocked
// byte sizes (since we can't run expo-file-system/MediaLibrary outside RN).
// Run with: node src/utils/__tests__/duplicate_logic_verification.test.js

function makeAsset(id, width, height, creationTime, bytes) {
  return { id, width, height, creationTime, bytes, mediaType: "photo" };
}

// Mirrors detectDuplicates(): bucket by resolution, then by exact byte size within bucket.
function detectDuplicatesMock(assets) {
  const photos = assets.filter((a) => a.mediaType === "photo");
  const byResolution = new Map();
  for (const a of photos) {
    const key = `${a.width}x${a.height}`;
    const bucket = byResolution.get(key);
    if (bucket) bucket.push(a);
    else byResolution.set(key, [a]);
  }
  const groups = [];
  for (const bucket of byResolution.values()) {
    if (bucket.length < 2) continue;
    const bySize = new Map();
    for (const a of bucket) {
      if (a.bytes <= 0) continue;
      const g = bySize.get(a.bytes);
      if (g) g.push(a);
      else bySize.set(a.bytes, [a]);
    }
    for (const g of bySize.values()) {
      if (g.length > 1) groups.push(g);
    }
  }
  return groups;
}

// Mirrors detectSimilar(): same resolution, within 60s window, span > 200ms.
function groupByBurst(assets, windowMs) {
  const photos = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const groups = [];
  let current = [];
  for (const a of photos) {
    if (current.length === 0) {
      current.push(a);
      continue;
    }
    const last = current[current.length - 1];
    const sameRes = a.width === last.width && a.height === last.height;
    if (Math.abs(a.creationTime - last.creationTime) <= windowMs && sameRes) {
      current.push(a);
    } else {
      if (current.length > 1) groups.push(current);
      current = [a];
    }
  }
  if (current.length > 1) groups.push(current);
  return groups;
}

function detectSimilarMock(assets) {
  const groups = groupByBurst(assets, 60_000);
  return groups.filter((g) => {
    const times = g.map((a) => a.creationTime);
    const span = Math.max(...times) - Math.min(...times);
    return span > 200;
  });
}

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`PASS: ${msg}`);
  } else {
    failed++;
    console.log(`FAIL: ${msg}`);
  }
}

// --- Test (a): same resolution, close in time, DIFFERENT byte sizes -> NOT grouped ---
// This is the exact bug scenario Kenan reported: burst of different photos, same camera res.
const bugScenario = [
  makeAsset("p1", 3024, 4032, 1000, 4_512_331), // family portrait
  makeAsset("p2", 3024, 4032, 1150, 3_998_120), // toddler close-up
  makeAsset("p3", 3024, 4032, 1300, 4_512_331), // same family portrait again (real dup of p1)
  makeAsset("p4", 3024, 4032, 1450, 5_201_884), // playground climbing frame
];
const dupsA = detectDuplicatesMock(bugScenario);
assert(dupsA.length === 1, "(a) exactly one true-duplicate group found in mixed burst");
assert(
  dupsA[0] && dupsA[0].map((x) => x.id).sort().join(",") === "p1,p3",
  "(a) only byte-identical p1/p3 grouped; p2 and p4 correctly excluded despite same resolution+time window",
);

// --- Test (b): identical resolution AND identical byte size, but taken DAYS apart -> grouped ---
const farApartScenario = [
  makeAsset("q1", 4032, 3024, 1_000_000, 6_000_000),
  makeAsset("q2", 4032, 3024, 1_000_000 + 5 * 24 * 60 * 60 * 1000, 6_000_000), // 5 days later, same bytes
];
const dupsB = detectDuplicatesMock(farApartScenario);
assert(dupsB.length === 1 && dupsB[0].length === 2, "(b) byte-identical duplicates grouped regardless of time gap (5 days apart)");

// --- Test (c): 'similar' and 'duplicates' categories don't overlap ---
// Simulate analyzeAll's post-filter: similar excludes any id already in duplicates.
const mixedScenario = [
  makeAsset("r1", 3000, 3000, 5000, 1_000_000),
  makeAsset("r2", 3000, 3000, 5100, 1_000_000), // exact dup of r1
  makeAsset("r3", 3000, 3000, 5200, 2_000_000), // different bytes, but same burst -> similar only
];
const dupGroupsC = detectDuplicatesMock(mixedScenario);
const dupIds = new Set(dupGroupsC.flatMap((g) => g.map((a) => a.id)));
const similarGroupsC = detectSimilarMock(mixedScenario)
  .map((g) => g.filter((a) => !dupIds.has(a.id)))
  .filter((g) => g.length > 1);
const similarIds = new Set(similarGroupsC.flatMap((g) => g.map((a) => a.id)));
const overlap = [...dupIds].filter((id) => similarIds.has(id));
assert(dupIds.has("r1") && dupIds.has("r2"), "(c) r1/r2 correctly classified as duplicates");
assert(overlap.length === 0, "(c) no asset id appears in both duplicates and similar categories");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
