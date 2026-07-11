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
