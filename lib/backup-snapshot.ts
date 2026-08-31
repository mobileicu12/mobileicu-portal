import { getSettings, getIntegrations } from "./settings";
import { getAllProductsForExport, getCollectionsDetailed } from "./products";
import { listAllCustomersWithFinancials } from "./customers";
import { listInvoices, listDeletedInvoices } from "./billing";
import { listOrders } from "./orders";
import { dumpPortalState, type ShopMetafield } from "./shop-metafields";

/**
 * The full owner backup snapshot.
 *
 * "End to end" means: if the Shopify store were emptied tomorrow, this file has
 * everything the business runs on. Two things it used to miss made that untrue:
 *
 *  • It named the handful of stores it knew about (settings, integrations), so
 *    every feature added since — cash-ups, expenses, settlements, till counts,
 *    staff accounts and permissions, attendance, the audit log, invoice
 *    numbering, import history — was never in the file. Those live only in shop
 *    metafields; nowhere else. `shopState` now copies the whole namespace, so
 *    anything a future feature stores is backed up the day it starts writing.
 *
 *  • Customers came from the screen's own 100-row list, capped again at 500. Past
 *    that the ledgers had no copy at all. They are now paged in full.
 */

export const SNAPSHOT_VERSION = 2;

/**
 * The WhatsApp API token is a live credential, not a business record: it is
 * redacted so a backup file is never a way to hand someone the shop's messaging
 * account. Staff password hashes ARE kept — they are salted scrypt, and a backup
 * that can't restore logins isn't a restore.
 */
function redact(fields: ShopMetafield[]): ShopMetafield[] {
  return fields.map((f) => {
    if (f.key !== "integrations") return f;
    try {
      const v = JSON.parse(f.value) as Record<string, unknown>;
      return {
        ...f,
        value: JSON.stringify({ ...v, whatsappToken: "", whatsappTokenSet: !!v.whatsappToken }),
      };
    } catch {
      return { ...f, value: "{}" };
    }
  });
}

export type BackupSnapshot = Awaited<ReturnType<typeof buildBackupSnapshot>>;

export async function buildBackupSnapshot() {
  // Independent reads, run together — the whole snapshot has to fit inside one
  // function invocation's time budget.
  const [settings, integrations, products, collections, customers, invoices, deletedInvoices, orders, portal] =
    await Promise.all([
      getSettings(),
      getIntegrations(),
      getAllProductsForExport(),
      getCollectionsDetailed(),
      listAllCustomersWithFinancials(),
      listInvoices(),
      listDeletedInvoices().catch(() => []),
      listOrders().catch(() => []),
      dumpPortalState(),
    ]);

  return {
    app: "mobileicu-portal",
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      products: products.length,
      collections: collections.length,
      customers: customers.length,
      invoices: invoices.length,
      deletedInvoices: deletedInvoices.length,
      orders: orders.length,
      shopFields: portal.fields.length,
    },
    settings,
    // Kept at the top level as well as inside shopState so v1 restores and any
    // human reading the file still find them where they were.
    integrations: {
      whatsappPhoneId: integrations.whatsappPhoneId,
      whatsappTemplate: integrations.whatsappTemplate,
      whatsappTokenSet: !!integrations.whatsappToken,
    },
    /**
     * Every portal metafield on the shop: cash-ups, expenses, settlements, till,
     * staff accounts, attendance, audit log, invoice counter, import history.
     * Stored as raw key/type/value so restore can put them back byte-for-byte
     * without this file needing to understand any of their shapes.
     */
    shopState: {
      fields: redact(portal.fields),
      skipped: portal.skipped,
      bytes: portal.bytes,
    },
    products,
    collections,
    customers,
    invoices,
    deletedInvoices,
    orders,
  };
}

/** A dated backup filename, e.g. "mobileicu-backup-2026-07-29.json". */
export function backupFilename(businessName: string, ext = "json"): string {
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "portal";
  return `${slug}-backup-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
