// Portal settings (business details for invoices, etc.) stored in a shop metafield.
import { adminGraphQL, ShopifyError } from "./shopify";

export type PortalSettings = {
  bizName: string;
  tagline: string;
  address: string; // multiline
  email: string;
  phone: string;
  website: string;
  vatNumber: string;
  bank: string; // payment instructions / footer
  invoiceFooter: string;
  vatRate: number; // percent, e.g. 20
  lowStock: number;
};

export const DEFAULT_SETTINGS: PortalSettings = {
  bizName: "MOBILE ICU",
  tagline: "Phone & Laptop Parts — Wholesale",
  address: "United Kingdom",
  email: "mobileicu12@gmail.com",
  phone: "",
  website: "mobile-icu-cws.myshopify.com",
  vatNumber: "",
  bank: "",
  invoiceFooter: "Thank you for your business.",
  vatRate: 20,
  lowStock: 5,
};

const NS = "portal";
const KEY = "settings";

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

export async function getSettings(): Promise<PortalSettings> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(d.shop.metafield.value) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(input: Partial<PortalSettings>): Promise<PortalSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...(await getSettings()), ...input };
  const ownerId = await shopGid();
  const res = await adminGraphQL<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] };
  }>(
    `mutation($mf: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $mf) { userErrors { field message } }
    }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(merged) }] },
  );
  const errs = res.metafieldsSet.userErrors;
  if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  return merged;
}
