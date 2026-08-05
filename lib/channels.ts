// Channel definitions (tag-based routing). No server imports — safe on client.
export const CHANNELS = [
  { key: "online", label: "Online Store", short: "Shopify", tag: "channel:online", color: "emerald" },
  { key: "till", label: "In-shop till (POS)", short: "Till", tag: "channel:till", color: "rose" },
  { key: "ebay-1", label: "eBay — Account 1", short: "eBay 1", tag: "channel:ebay-1", color: "sky" },
  { key: "ebay-2", label: "eBay — Account 2", short: "eBay 2", tag: "channel:ebay-2", color: "sky" },
  { key: "amazon-1", label: "Amazon — Account 1", short: "Amazon 1", tag: "channel:amazon-1", color: "amber" },
  { key: "amazon-2", label: "Amazon — Account 2", short: "Amazon 2", tag: "channel:amazon-2", color: "amber" },
] as const;

// Tag that marks a product as an in-shop till item (used to filter POS search).
export const TILL_TAG = "channel:till";

export type ChannelKey = (typeof CHANNELS)[number]["key"];

export function channelKeysFromTags(tags: string[]): string[] {
  return CHANNELS.filter((c) => tags.includes(c.tag)).map((c) => c.key);
}

export function tagsForChannelKeys(keys: string[]): string[] {
  return CHANNELS.filter((c) => keys.includes(c.key)).map((c) => c.tag);
}
