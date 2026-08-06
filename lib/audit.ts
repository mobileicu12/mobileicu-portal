// Append-only audit trail for anything that moves money.
//
// Every invoice edit, void, deletion, restore and every payment recorded,
// edited or revoked is written here with who did it and when. When a balance
// looks wrong, this is what lets you reconstruct how it got that way.
//
// Storage: shop metafields, one per calendar month (`portal.audit_YYYYMM`).
// A single metafield has a hard size ceiling, so one ever-growing blob would
// eventually start failing writes — silently losing the trail exactly when the
// business is busiest. Monthly buckets keep each one small and give natural
// rotation.
import { adminGraphQL } from "./shopify";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import type { AuditEntry } from "./audit-labels";

export { AUDIT_LABELS, AUDIT_CRITICAL, type AuditEntry } from "./audit-labels";

const NS = "portal";
// Entries kept per month. At ~180 bytes each this stays well inside the
// metafield limit; the oldest in a month are dropped first if it's exceeded.
const MAX_PER_MONTH = 400;


function bucketKey(d = new Date()): string {
  return `audit_${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function readBucket(key: string): Promise<AuditEntry[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${key}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return [];
  try {
    const a = JSON.parse(d.shop.metafield.value);
    return Array.isArray(a) ? (a as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

// Who is making this request? Falls back to the master-password admin, and to
// "unknown" rather than throwing — an audit write must never break the action
// it is recording.
export async function currentActor(): Promise<string> {
  try {
    const session = await auth().catch(() => null);
    if (session?.user?.email) return session.user.email;
    const s = (await cookies()).get("mi_session")?.value;
    if (s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET) return "master-password";
  } catch { /* fall through */ }
  return "unknown";
}

// Record an event. Never throws: losing a log line is bad, but failing the sale
// or the payment because the log write failed would be worse.
export async function audit(
  action: string,
  info: { ref?: string; name?: string; detail?: string; who?: string } = {},
): Promise<void> {
  try {
    const who = info.who || (await currentActor());
    const key = bucketKey();
    const entries = await readBucket(key);
    entries.push({
      at: new Date().toISOString(),
      who,
      action,
      ref: info.ref,
      name: info.name,
      detail: info.detail?.slice(0, 300),
    });
    const trimmed = entries.slice(-MAX_PER_MONTH);
    const ownerId = await shopGid();
    await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
      { mf: [{ ownerId, namespace: NS, key, type: "json", value: JSON.stringify(trimmed) }] },
    );
  } catch {
    /* deliberately swallowed — see above */
  }
}

// Read the trail, newest first, across the last `months` buckets.
export async function readAudit(months = 3): Promise<AuditEntry[]> {
  const keys: string[] = [];
  const d = new Date();
  for (let i = 0; i < Math.max(1, months); i++) {
    keys.push(bucketKey(d));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  const all: AuditEntry[] = [];
  for (const k of keys) {
    try { all.push(...(await readBucket(k))); } catch { /* skip a bad bucket */ }
  }
  return all.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
