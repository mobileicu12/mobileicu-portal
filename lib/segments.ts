// Customer / order / invoice segments — WHERE a customer comes from.
// Stored as Shopify tags `seg:<key>`. Client-safe (no server imports).

export type SegmentKey = "online" | "shop" | "ebay" | "amazon";

export type Segment = {
  key: SegmentKey;
  label: string; // full label
  short: string; // badge label
  tag: string; // shopify tag
  desc: string;
  // tailwind classes for the badge
  badge: string;
};

export const SEGMENTS: Segment[] = [
  {
    key: "online",
    label: "Online / Registered",
    short: "Online",
    tag: "seg:online",
    desc: "Registered online-store customers — the only ones with wholesale price access.",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  {
    key: "shop",
    label: "Shop (offline)",
    short: "Shop",
    tag: "seg:shop",
    desc: "Walk-in / physical-shop (POS) customers.",
    badge: "bg-sky-100 text-sky-700 border-sky-200",
  },
  {
    key: "ebay",
    label: "eBay",
    short: "eBay",
    tag: "seg:ebay",
    desc: "eBay marketplace buyers (usually one-off / random).",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
  },
  {
    key: "amazon",
    label: "Amazon",
    short: "Amazon",
    tag: "seg:amazon",
    desc: "Amazon marketplace buyers (usually one-off / random).",
    badge: "bg-orange-100 text-orange-700 border-orange-200",
  },
];

const BY_TAG = new Map(SEGMENTS.map((s) => [s.tag, s.key]));
const BY_KEY = new Map(SEGMENTS.map((s) => [s.key, s]));

export function segmentsFromTags(tags: string[]): SegmentKey[] {
  const out: SegmentKey[] = [];
  for (const t of tags) {
    const k = BY_TAG.get(t.trim());
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

export function tagsForSegments(keys: SegmentKey[]): string[] {
  return keys.map((k) => BY_KEY.get(k)?.tag).filter((t): t is string => !!t);
}

export function isSegmentTag(tag: string): boolean {
  return BY_TAG.has(tag.trim());
}

export function segmentMeta(key: SegmentKey): Segment | undefined {
  return BY_KEY.get(key);
}
