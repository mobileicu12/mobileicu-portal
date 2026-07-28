// ---------------------------------------------------------------------------
// Brand / deployment identity — the ONE file to change when standing this
// portal up for a different business.
//
// Everything here is overridable by environment variable, so a fork normally
// needs no code edits at all: set the vars in Vercel and deploy. The defaults
// below are MOBILE ICU's, kept so the existing deployment keeps working.
//
// ⚠️  FORKING FOR ANOTHER BUSINESS? The two that MUST be set are:
//       PORTAL_OWNER_EMAIL        — otherwise the emails below keep owner
//                                   access to the new portal.
//       NEXT_PUBLIC_BRAND_STORAGE — otherwise two deployments open in the same
//                                   browser share one cart and one "already
//                                   sent today" list.
// ---------------------------------------------------------------------------

// Display name lives in lib/business.ts (BUSINESS.name) so it can be edited
// from the Settings screen too. This file holds the things that are structural
// rather than cosmetic.

// Short, filesystem-safe token used in generated filenames:
//   <slug>-catalog-2026-07-28.xlsx, <slug>-backup-….json
export const BRAND_SLUG = (process.env.NEXT_PUBLIC_BRAND_SLUG || "mobileicu")
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "");

// Default invoice-number prefix. The owner can override it in Settings; this is
// only the starting value: <prefix>-2026-0001.
export const BRAND_INVOICE_PREFIX = process.env.NEXT_PUBLIC_BRAND_INVOICE_PREFIX || "MICU";

// The Shopify store this deployment is bound to. SHOPIFY_STORE_DOMAIN is
// server-only, so client components (the Channels board, the product editor's
// "View" link) need this public copy.
export const STORE_DOMAIN_PUBLIC =
  process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN || "mobile-icu-cws.myshopify.com";

// Bare store handle, e.g. "mobile-icu-cws" — what Shopify admin deep links use.
export const STORE_HANDLE = STORE_DOMAIN_PUBLIC.replace(/\.myshopify\.com$/, "");

// Prefix for every browser-storage key this app writes. Two deployments sharing
// a browser MUST NOT share a prefix, or their carts and their per-day "sent"
// markers bleed into each other.
const DEFAULT_STORAGE_PREFIX = "micu";
export const STORAGE_PREFIX = process.env.NEXT_PUBLIC_BRAND_STORAGE || DEFAULT_STORAGE_PREFIX;

// Keys that already exist in customers' and staff's browsers. On the original
// deployment they keep their historic names, so shipping this namespacing does
// not empty live carts, reset the channel board, or — the one that actually
// matters — re-arm today's "already sent" markers mid-afternoon and invite
// double-sends. A rebranded deployment sets its own prefix and gets fresh keys.
const HISTORIC_KEYS: Record<string, string> = {
  "cart_v1": "micu_cart_v1",
  "channels-connected": "mi-channels-connected",
  "theme": "mi-theme",
  "sidebar-collapsed": "sidebar:collapsed",
};

// Build a browser-storage key namespaced to this deployment.
export function storageKey(name: string): string {
  if (STORAGE_PREFIX === DEFAULT_STORAGE_PREFIX && HISTORIC_KEYS[name]) return HISTORIC_KEYS[name];
  return `${STORAGE_PREFIX}:${name}`;
}

// Product categories offered in the product editor. Comma-separated env var so
// a different trade (auto parts, cosmetics, groceries…) can supply its own
// without touching code.
const DEFAULT_PRODUCT_TYPES = [
  "LCD", "Batteries", "Cables", "Chargers", "Car Chargers", "Adptors",
  "Holders", "Cases", "Screen Protectors", "Audio", "Power Banks", "Parts",
];

const configuredTypes = (process.env.NEXT_PUBLIC_PRODUCT_TYPES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const PRODUCT_TYPES: string[] = configuredTypes.length ? configuredTypes : DEFAULT_PRODUCT_TYPES;

// Accounts with permanent full access. Server-only — never sent to the browser.
// A fork that leaves this unset inherits the previous business's owners.
export const OWNER_EMAILS_RAW =
  process.env.PORTAL_OWNER_EMAIL || "mobileicu12@gmail.com,rudraxdevelopment98@gmail.com";
