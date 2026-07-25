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
  invoicePrefix: string; // e.g. "MICU" -> MICU-2026-0001
  vatRate: number; // percent, e.g. 20
  lowStock: number;
  // ---- Daily digest (end-of-day summaries) ----
  dailyDigest: boolean; // master on/off for the scheduled 9:30pm send
  digestCustomers: boolean; // send each wholesale customer their own day summary
  digestOwner: boolean; // send the owner an all-customers summary report
  digestOwnerEmail: string; // where the owner report goes (blank = business email)
  digestOwnerPhone: string; // optional WhatsApp number for the owner report
  digestLastRun: string; // YYYY-MM-DD of the last successful run (idempotency)
  reportButtonHour: number; // hour (0-23) after which the header "Today's reports" ZIP button shows
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
  invoicePrefix: "MICU",
  vatRate: 20,
  lowStock: 5,
  dailyDigest: false,
  digestCustomers: true,
  digestOwner: true,
  digestOwnerEmail: "",
  digestOwnerPhone: "",
  digestLastRun: "",
  reportButtonHour: 21,
};

const NS = "portal";
const KEY = "settings";
const INTEG_KEY = "integrations";

// ---- Integrations (secrets) ----
// Stored in a SEPARATE metafield and never returned to the browser verbatim, so
// the WhatsApp API token can't leak through the (staff-readable) settings endpoint.
export type Integrations = {
  whatsappToken: string;   // WhatsApp Cloud API access token
  whatsappPhoneId: string; // WhatsApp Cloud API phone-number ID
  whatsappTemplate: string; // optional approved template name (business-initiated)
};

const DEFAULT_INTEGRATIONS: Integrations = { whatsappToken: "", whatsappPhoneId: "", whatsappTemplate: "" };

export async function getIntegrations(): Promise<Integrations> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${INTEG_KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return DEFAULT_INTEGRATIONS;
  try { return { ...DEFAULT_INTEGRATIONS, ...JSON.parse(d.shop.metafield.value) }; }
  catch { return DEFAULT_INTEGRATIONS; }
}

// A blank token means "leave the stored token unchanged" — the UI never echoes the secret back.
export async function saveIntegrations(input: Partial<Integrations>): Promise<Integrations> {
  const current = await getIntegrations();
  const merged: Integrations = {
    whatsappToken: input.whatsappToken?.trim() ? input.whatsappToken.trim() : current.whatsappToken,
    whatsappPhoneId: input.whatsappPhoneId !== undefined ? input.whatsappPhoneId.trim() : current.whatsappPhoneId,
    whatsappTemplate: input.whatsappTemplate !== undefined ? input.whatsappTemplate.trim() : current.whatsappTemplate,
  };
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { field: string[]; message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: INTEG_KEY, type: "json", value: JSON.stringify(merged) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  return merged;
}

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

// Generate the next unique, sequential invoice number: PREFIX-YYYY-0001.
// Backed by an atomically-read counter in a shop metafield.
export async function nextInvoiceNumber(): Promise<string> {
  const settings = await getSettings();
  const prefix = (settings.invoicePrefix || "MICU").trim();
  const d = await adminGraphQL<{ shop: { id: string; metafield: { value: string } | null } }>(
    `query { shop { id metafield(namespace: "${NS}", key: "invoice_counter") { value } } }`,
  );
  const current = parseInt(d.shop.metafield?.value || "0", 10) || 0;
  const next = current + 1;
  await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId: d.shop.id, namespace: NS, key: "invoice_counter", type: "number_integer", value: String(next) }] },
  );
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
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
