// A record of every backup run, kept in a shop metafield.
//
// The failure that matters with backups is the silent one: a credential expires,
// the nightly job starts failing, and nobody finds out until the day they need
// the file. So each run — good or bad — writes a line here, and the portal reads
// it to say out loud how old the newest good backup is.

import { adminGraphQL, ShopifyError } from "./shopify";

const NS = "portal";
const KEY = "backup_log";
const KEEP = 40;

export type DestinationResult = {
  /** "Google Drive", "Email" — shown to the owner as-is. */
  name: string;
  ok: boolean;
  /** The filename/link on success, or the reason on failure. */
  detail: string;
};

export type BackupRun = {
  at: string;
  /** True when at least one destination took the file. */
  ok: boolean;
  bytes: number;
  ms: number;
  trigger: "cron" | "manual" | "catch-up";
  counts: Record<string, number>;
  destinations: DestinationResult[];
  /** Set when the snapshot itself couldn't be built. */
  error?: string;
};

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

export async function readBackupLog(): Promise<BackupRun[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return [];
  try {
    const a = JSON.parse(d.shop.metafield.value);
    return Array.isArray(a) ? (a as BackupRun[]) : [];
  } catch {
    return [];
  }
}

export async function recordBackupRun(run: BackupRun): Promise<void> {
  const log = await readBackupLog();
  const next = [run, ...log].slice(0, KEEP);
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(next) }] },
  );
  if (res.metafieldsSet.userErrors.length) {
    throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  }
}

export type BackupHealth = {
  lastRun: BackupRun | null;
  lastGood: BackupRun | null;
  /** Hours since the last run that actually landed somewhere. null = never. */
  ageHours: number | null;
  /** Nothing has landed in over a day and a bit — the nightly run is not working. */
  stale: boolean;
  /** Long enough that it needs saying loudly rather than noting. */
  critical: boolean;
};

/**
 * 26 hours, not 24: the nightly run is at a fixed hour, so a 24h threshold would
 * flash a warning every evening in the minutes before it fires.
 */
export const STALE_HOURS = 26;
export const CRITICAL_HOURS = 72;

export function healthFrom(log: BackupRun[], now = Date.now()): BackupHealth {
  const lastRun = log[0] ?? null;
  const lastGood = log.find((r) => r.ok) ?? null;
  const ageHours = lastGood ? (now - Date.parse(lastGood.at)) / 3_600_000 : null;
  return {
    lastRun,
    lastGood,
    ageHours,
    stale: ageHours === null || ageHours > STALE_HOURS,
    critical: ageHours === null || ageHours > CRITICAL_HOURS,
  };
}
