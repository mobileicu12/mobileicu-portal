// Business details printed on invoices/PDFs. Edit here or override via env.
export type Business = {
  name: string;
  tagline: string;
  addressLines: string[];
  email: string;
  phone: string;
  website: string;
  vatNumber: string; // shown when a VAT invoice is generated
  bank: string; // optional payment instructions footer
};

export const BUSINESS: Business = {
  name: process.env.NEXT_PUBLIC_BIZ_NAME || "MOBILE ICU",
  tagline: process.env.NEXT_PUBLIC_BIZ_TAGLINE || "Phone & Laptop Parts — Wholesale",
  addressLines: (process.env.NEXT_PUBLIC_BIZ_ADDRESS || "United Kingdom")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean),
  email: process.env.NEXT_PUBLIC_BIZ_EMAIL || "mobileicu12@gmail.com",
  phone: process.env.NEXT_PUBLIC_BIZ_PHONE || "",
  website: process.env.NEXT_PUBLIC_BIZ_WEBSITE || "mobile-icu-cws.myshopify.com",
  vatNumber: process.env.NEXT_PUBLIC_BIZ_VAT || "",
  bank: process.env.NEXT_PUBLIC_BIZ_BANK || "",
};

// Fetch live business details from the Settings page (falls back to defaults).
let _cache: Business | null = null;
export async function loadBusiness(): Promise<Business> {
  if (_cache) return _cache;
  try {
    const res = await fetch("/api/settings");
    const d = await res.json();
    const s = d.settings;
    if (s) {
      _cache = {
        name: s.bizName || BUSINESS.name,
        tagline: s.tagline || BUSINESS.tagline,
        addressLines: String(s.address || "").split("\n").map((x: string) => x.trim()).filter(Boolean),
        email: s.email || "",
        phone: s.phone || "",
        website: s.website || "",
        vatNumber: s.vatNumber || "",
        bank: s.bank || s.invoiceFooter || "",
      };
      return _cache;
    }
  } catch { /* fall through */ }
  return BUSINESS;
}
