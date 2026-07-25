// Multi-tier pricing — one product can have different prices per sales channel.
// Client-safe (no server imports) so the billing page, product editor and Excel
// import/export all share the same tier definitions.
//
// The base variant price = the standard Online / retail price. On top of it we
// store up to four channel prices as product metafields:
//   • Wholesale (trade)   → custom.wholesale_price   (also drives storefront trade pricing)
//   • In-shop / offline   → custom.price_shop
//   • eBay                → custom.price_ebay
//   • Amazon              → custom.price_amazon
// A blank tier simply falls back to the base price.
import type { SegmentKey } from "./segments";

export type PriceTierKey = "wholesale" | "shop" | "ebay" | "amazon";

export type PriceTier = {
  key: PriceTierKey;
  label: string; // full label
  short: string; // compact label / Excel header
  metafieldKey: string; // custom.<key>
  desc: string;
};

export const PRICE_TIERS: PriceTier[] = [
  { key: "wholesale", label: "Wholesale (trade)", short: "Wholesale", metafieldKey: "wholesale_price", desc: "Trade-logged-in storefront customers and wholesale invoices." },
  { key: "shop", label: "In-shop / offline", short: "Shop", metafieldKey: "price_shop", desc: "Walk-in / physical-shop (POS) sales." },
  { key: "ebay", label: "eBay", short: "eBay", metafieldKey: "price_ebay", desc: "eBay marketplace listings." },
  { key: "amazon", label: "Amazon", short: "Amazon", metafieldKey: "price_amazon", desc: "Amazon marketplace listings." },
];

// The tier prices attached to a product/variant (raw strings straight from Shopify;
// empty string / null = not set → use base price).
export type TierPrices = {
  wholesale?: string | null;
  shop?: string | null;
  ebay?: string | null;
  amazon?: string | null;
};

// Parse a stored tier value into a usable positive number, or null if unset/invalid.
export function tierNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Which tier applies for a given sale context.
export function tierForContext(opts: { wholesale?: boolean; segment?: SegmentKey }): PriceTierKey | null {
  if (opts.wholesale) return "wholesale";
  switch (opts.segment) {
    case "shop": return "shop";
    case "ebay": return "ebay";
    case "amazon": return "amazon";
    default: return null; // online / registered → base price
  }
}

// Resolve the unit price for a sale context: the matching tier if set, else the base price.
export function priceForContext(
  base: string | number,
  tiers: TierPrices | null | undefined,
  opts: { wholesale?: boolean; segment?: SegmentKey },
): number {
  const b = Number(base) || 0;
  const tier = tierForContext(opts);
  if (!tier || !tiers) return b;
  return tierNum(tiers[tier]) ?? b;
}
