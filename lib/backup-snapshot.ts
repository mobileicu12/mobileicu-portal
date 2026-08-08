import { getSettings, getIntegrations } from "./settings";
import { getAllProductsForExport, getCollectionsDetailed } from "./products";
import { listCustomers, getCustomer } from "./customers";
import { listInvoices } from "./billing";
import { mapLimit } from "./async";

/**
 * The full owner backup snapshot.
 *
 * A single object holding everything that matters — including the customer
 * ledgers / opening balances that live only in metafields (not in Shopify's
 * native data), so nothing important is lost. Used by both the manual JSON
 * download and the nightly Google Drive backup.
 */
export async function buildBackupSnapshot() {
  const [settings, integrations, products, collections, customerList, invoices] =
    await Promise.all([
      getSettings(),
      getIntegrations(),
      getAllProductsForExport(),
      getCollectionsDetailed(),
      listCustomers(),
      listInvoices(),
    ]);

  // Pull each customer's full detail (ledger, opening balance, invoices) — capped
  // to stay within the request budget on very large customer bases.
  const CAP = 500;
  const detailed = await mapLimit(customerList.slice(0, CAP), 4, (c) =>
    getCustomer(c.id).catch(() => ({ ...c, _detailError: true })),
  );

  return {
    app: "mobileicu-portal",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      products: products.length,
      collections: collections.length,
      customers: detailed.length,
      invoices: invoices.length,
    },
    settings,
    // Token redacted even from the backup file; phone-id/template kept for reference.
    integrations: {
      whatsappPhoneId: integrations.whatsappPhoneId,
      whatsappTemplate: integrations.whatsappTemplate,
      whatsappTokenSet: !!integrations.whatsappToken,
    },
    products,
    collections,
    customers: detailed,
    invoices,
    truncated: customerList.length > CAP ? { customers: customerList.length - CAP } : null,
  };
}

/** A dated backup filename, e.g. "mobileicu-backup-2026-07-29.json". */
export function backupFilename(businessName: string): string {
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "portal";
  return `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
}
