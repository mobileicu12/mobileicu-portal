// Temporary, owner-approved access to sensitive financial figures (sales,
// earnings, profit, totals). Staff never see these by default — even on pages
// they can open. They request access; the owner approves for a short window
// (15 minutes); after that it auto-hides. The owner can also revoke instantly.
//
// State lives in a single shop metafield (portal.finance_access) — no database.
import { adminGraphQL, ShopifyError } from "./shopify";

const NS = "portal";
const KEY = "finance_access";
export const GRANT_MINUTES = 15;

export type FinanceGrant = { email: string; expiresAt: string };
export type FinanceRequest = { email: string; name: string; at: string };

type Store = {
  grants: Record<string, string>; // email -> expiresAt ISO
  requests: Record<string, { name: string; at: string }>;
};

const EMPTY: Store = { grants: {}, requests: {} };
const norm = (e: string) => e.trim().toLowerCase();

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function read(): Promise<Store> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return { grants: {}, requests: {} };
  try {
    const parsed = JSON.parse(d.shop.metafield.value);
    return { grants: parsed.grants && typeof parsed.grants === "object" ? parsed.grants : {}, requests: parsed.requests && typeof parsed.requests === "object" ? parsed.requests : {} };
  } catch {
    return { grants: {}, requests: {} };
  }
}

async function write(store: Store): Promise<void> {
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(store) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

// Drop expired grants (in memory). Returns whether anything was pruned.
function prune(store: Store): boolean {
  const now = Date.now();
  let changed = false;
  for (const [email, exp] of Object.entries(store.grants)) {
    if (!exp || +new Date(exp) <= now) { delete store.grants[email]; changed = true; }
  }
  return changed;
}

// The current user's live finance visibility (called on the hot path — one read).
export async function financeStatusFor(email: string | null | undefined): Promise<{ visible: boolean; expiresAt: string | null; pending: boolean }> {
  if (!email) return { visible: false, expiresAt: null, pending: false };
  const e = norm(email);
  const store = await read();
  const exp = store.grants[e];
  const visible = !!exp && +new Date(exp) > Date.now();
  return { visible, expiresAt: visible ? exp : null, pending: !!store.requests[e] };
}

// Staff asks to see the figures. Idempotent — one pending request per person.
export async function requestFinanceAccess(email: string, name: string): Promise<void> {
  const e = norm(email);
  const store = await read();
  prune(store);
  store.requests[e] = { name: name || e, at: new Date().toISOString() };
  await write(store);
}

// Owner grants access for GRANT_MINUTES; clears the pending request.
export async function approveFinanceAccess(email: string, minutes = GRANT_MINUTES): Promise<FinanceGrant> {
  const e = norm(email);
  const store = await read();
  prune(store);
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  store.grants[e] = expiresAt;
  delete store.requests[e];
  await write(store);
  return { email: e, expiresAt };
}

// Owner revokes access (or dismisses a request) immediately.
export async function revokeFinanceAccess(email: string): Promise<void> {
  const e = norm(email);
  const store = await read();
  prune(store);
  delete store.grants[e];
  delete store.requests[e];
  await write(store);
}

// Owner view: who's waiting, and who currently has (unexpired) access.
export async function listFinanceAccess(): Promise<{ requests: FinanceRequest[]; grants: FinanceGrant[] }> {
  const store = await read();
  if (prune(store)) { try { await write(store); } catch { /* best effort */ } }
  const requests = Object.entries(store.requests)
    .map(([email, r]) => ({ email, name: r.name, at: r.at }))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const grants = Object.entries(store.grants)
    .map(([email, expiresAt]) => ({ email, expiresAt }))
    .sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt));
  return { requests, grants };
}
