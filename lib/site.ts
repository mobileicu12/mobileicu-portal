// Canonical public site URL for building shareable links (WhatsApp / email).
// Defaults to the live domain so links never point at the raw *.vercel.app host,
// regardless of which URL the portal is opened from. Override with NEXT_PUBLIC_SITE_URL.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://store.mobileicu.co.uk").replace(/\/+$/, "");
