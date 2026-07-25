// Staff time-clock (tap in / tap out). Records stored in a shop metafield.
// A user must "tap in" (re-enter their password) after login before using the
// portal; they tap out manually, and everyone is auto-tapped-out at ~21:30.
import { adminGraphQL, ShopifyError } from "./shopify";

export type Attendance = {
  email: string;
  name?: string;
  tapIn: string;      // ISO
  tapOut?: string;    // ISO
  autoOut?: boolean;  // closed by the auto tap-out job
};

const NS = "portal";
const KEY = "attendance";
const MAX = 2000; // keep the log bounded

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

export async function readAttendance(): Promise<Attendance[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return [];
  try { const a = JSON.parse(d.shop.metafield.value); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

async function writeAttendance(list: Attendance[]): Promise<void> {
  const trimmed = list.slice(-MAX);
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(trimmed) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Is this user currently tapped in (has an open record started today)?
export function openRecord(list: Attendance[], email: string): Attendance | null {
  const start = +startOfToday();
  return list.find((r) => r.email === email && !r.tapOut && +new Date(r.tapIn) >= start) ?? null;
}

export async function tapIn(email: string, name?: string): Promise<Attendance> {
  const e = email.toLowerCase();
  const list = await readAttendance();
  // Close any stray open record first, then open a fresh one.
  for (const r of list) if (r.email === e && !r.tapOut) r.tapOut = new Date().toISOString();
  const rec: Attendance = { email: e, name, tapIn: new Date().toISOString() };
  list.push(rec);
  await writeAttendance(list);
  return rec;
}

export async function tapOut(email: string): Promise<void> {
  const e = email.toLowerCase();
  const list = await readAttendance();
  const open = list.filter((r) => r.email === e && !r.tapOut);
  for (const r of open) r.tapOut = new Date().toISOString();
  if (open.length) await writeAttendance(list);
}

// Auto tap-out everyone still open (the ~21:30 job). Returns how many were closed.
export async function autoTapOutAll(): Promise<number> {
  const list = await readAttendance();
  const now = new Date().toISOString();
  let n = 0;
  for (const r of list) if (!r.tapOut) { r.tapOut = now; r.autoOut = true; n++; }
  if (n) await writeAttendance(list);
  return n;
}

export type TodayShift = { email: string; name?: string; tapIn: string; tapOut?: string; autoOut?: boolean; minutes: number; open: boolean };

export async function listToday(): Promise<TodayShift[]> {
  const start = +startOfToday();
  const list = (await readAttendance()).filter((r) => +new Date(r.tapIn) >= start);
  return list
    .map((r) => {
      const end = r.tapOut ? +new Date(r.tapOut) : Date.now();
      return { email: r.email, name: r.name, tapIn: r.tapIn, tapOut: r.tapOut, autoOut: r.autoOut, minutes: Math.max(0, Math.round((end - +new Date(r.tapIn)) / 60000)), open: !r.tapOut };
    })
    .sort((a, b) => +new Date(b.tapIn) - +new Date(a.tapIn));
}
