import { saveSettings, saveIntegrations } from "./settings";
import { restoreCustomerFinancials, type Ledger } from "./customers";

/**
 * Scoped restore for the Shopify-backed portal.
 *
 * MOBILE ICU keeps products, customers and orders in Shopify itself, so those
 * are recovered the normal Shopify way and must never be recreated from a
 * backup (that would duplicate live records). What lives ONLY in metafields —
 * the settings and each customer's payment ledger / opening balance — is the
 * irreplaceable part, and that is what this restores: it overwrites those
 * metafields in place on existing records, creating and deleting nothing.
 */

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
};

export async function restoreFromSnapshot(snapshot: unknown): Promise<RestoreResult> {
  if (!isValidSnapshot(snapshot)) {
    throw new Error("That file is not a valid MOBILE ICU backup.");
  }
  const snap = snapshot as AnyRow;
  const result: RestoreResult = {
    settings: false,
    integrations: false,
    customersRestored: 0,
    customersFailed: 0,
  };

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
