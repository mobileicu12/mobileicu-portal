import { saveSettings, saveIntegrations } from "./settings";
import { restoreCustomerFinancials, type Ledger } from "./customers";
import { writePortalValues, type ShopMetafield } from "./shop-metafields";

/**
 * Scoped restore for the Shopify-backed portal.
 *
 * MOBILE ICU keeps products, customers and orders in Shopify itself, so those
 * are recovered the normal Shopify way and must never be recreated from a
 * backup (that would duplicate live records). What lives ONLY in metafields is
 * the irreplaceable part, and that is what this restores: it overwrites those
 * metafields in place on existing records, creating and deleting nothing.
 *
 * Three groups of that:
 *  • settings
 *  • each customer's payment ledger / opening balance
 *  • the shop's own portal state — cash-ups, expenses, settlements, till, staff
 *    accounts and permissions, attendance, audit log, invoice counter, import
 *    history. A backup that holds these but cannot put them back is a file, not
 *    a restore, so v2 snapshots restore them byte-for-byte.
 */

/**
 * Never written back from a file.
 *
 * `integrations` holds the WhatsApp API token, which the backup redacts to an
 * empty string — restoring it verbatim would wipe a working credential and stop
 * messages going out. The non-secret half is restored through saveIntegrations
 * below instead.
 */
const NEVER_RESTORE = new Set(["integrations"]);

type AnyRow = Record<string, unknown>;

export function isValidSnapshot(s: unknown): s is AnyRow {
  if (!s || typeof s !== "object") return false;
  const o = s as AnyRow;
  return o.app === "mobileicu-portal" && Array.isArray(o.customers);
}

export type RestoreResult = {
  settings: boolean;
  integrations: boolean;
  customersRestored: number;
  customersFailed: number;
  /** Shop-level portal records (cash-ups, expenses, staff, audit…) written back. */
  shopFieldsRestored: number;
  shopFieldsFailed: number;
  /** Keys present in the file that this deliberately did not write. */
  shopFieldsSkipped: string[];
};

export async function restoreFromSnapshot(
  snapshot: unknown,
  opts: { shopState?: boolean } = {},
): Promise<RestoreResult> {
  if (!isValidSnapshot(snapshot)) {
    throw new Error("That file is not a valid MOBILE ICU backup.");
  }
  const snap = snapshot as AnyRow;
  const result: RestoreResult = {
    settings: false,
    integrations: false,
    customersRestored: 0,
    customersFailed: 0,
    shopFieldsRestored: 0,
    shopFieldsFailed: 0,
    shopFieldsSkipped: [],
  };

  // Shop state first: settings are in here too, and the merge-aware saveSettings
  // below should have the last word over the raw copy.
  const shopState = snap.shopState as AnyRow | undefined;
  const rawFields = Array.isArray(shopState?.fields) ? (shopState.fields as AnyRow[]) : [];
  if (opts.shopState !== false && rawFields.length) {
    const fields: ShopMetafield[] = [];
    for (const f of rawFields) {
      const key = typeof f.key === "string" ? f.key : null;
      const type = typeof f.type === "string" ? f.type : null;
      const value = typeof f.value === "string" ? f.value : null;
      if (!key || !type || value === null) continue;
      if (NEVER_RESTORE.has(key)) { result.shopFieldsSkipped.push(key); continue; }
      fields.push({ key, type, value });
    }
    // One field at a time: a single rejected value (a type Shopify no longer
    // accepts, a blob that outgrew the limit) must not cost the other 80.
    for (const f of fields) {
      try {
        await writePortalValues([f]);
        result.shopFieldsRestored++;
      } catch {
        result.shopFieldsFailed++;
      }
    }
  }

  // Settings (best effort — a bad settings blob must not stop the ledgers).
  if (snap.settings && typeof snap.settings === "object") {
    try {
      await saveSettings(snap.settings as Record<string, unknown>);
      result.settings = true;
    } catch {
      /* leave settings=false */
    }
  }
  // Integrations: the backup redacts the WhatsApp token, so only the non-secret
  // phone id / template are restorable.
  if (snap.integrations && typeof snap.integrations === "object") {
    const integ = snap.integrations as AnyRow;
    try {
      await saveIntegrations({
        whatsappPhoneId: typeof integ.whatsappPhoneId === "string" ? integ.whatsappPhoneId : undefined,
        whatsappTemplate: typeof integ.whatsappTemplate === "string" ? integ.whatsappTemplate : undefined,
      });
      result.integrations = true;
    } catch {
      /* leave integrations=false */
    }
  }

  // Customer ledgers + opening balances, one at a time so one missing customer
  // (deleted since the backup) never aborts the rest.
  const customers = Array.isArray(snap.customers) ? (snap.customers as AnyRow[]) : [];
  for (const c of customers) {
    const id = typeof c.id === "string" ? c.id : null;
    if (!id) continue;
    const ledger =
      c.ledger && typeof c.ledger === "object" ? (c.ledger as Ledger) : undefined;
    const openingBalance =
      typeof c.openingBalance === "number" ? c.openingBalance : undefined;
    if (!ledger && openingBalance === undefined) continue;
    try {
      await restoreCustomerFinancials(id, { ledger, openingBalance });
      result.customersRestored++;
    } catch {
      result.customersFailed++;
    }
  }

  return result;
}
