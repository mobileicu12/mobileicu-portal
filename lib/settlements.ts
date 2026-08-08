// Buying / cost settlement — OWNER ONLY, and deliberately separate from Expenses.
//
// Expenses = running shop costs (rent, wages, utilities) recorded for the books.
// Buying   = money spent purchasing stock to resell. The owner logs buying costs
//            here to see NET earnings (sales received − buying), and can flip each
//            entry in/out of that calculation to compare the "real" gross figure
//            with the settled net. Nothing here touches Expenses, and vice-versa.
import { adminGraphQL, ShopifyError } from "./shopify";

const NS = "portal";
const KEY = "settlements";

export type Buying = {
  id: string;
  date: string;         // ISO — when the stock was bought
  supplier: string;     // who it was bought from
  description: string;
  amount: number;       // GBP spent
  included: boolean;    // does it reduce net earnings right now?
  createdBy: string;
  createdAt: string;
};

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function read(): Promise<Buying[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return [];
  try {
    const arr = JSON.parse(d.shop.metafield.value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function write(rows: Buying[]): Promise<void> {
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(rows) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export async function listBuying(): Promise<Buying[]> {
  return (await read()).sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export async function addBuying(input: {
  date?: string; supplier?: string; description?: string; amount: number; included?: boolean; createdBy?: string;
}): Promise<Buying> {
  if (!(input.amount > 0)) throw new ShopifyError("A positive amount is required.");
  const rows = await read();
  const b: Buying = {
    id: `buy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: input.date || new Date().toISOString(),
    supplier: (input.supplier || "").trim(),
    description: (input.description || "").trim(),
    amount: Math.round(input.amount * 100) / 100,
    included: input.included !== false, // included by default
    createdBy: input.createdBy || "",
    createdAt: new Date().toISOString(),
  };
  rows.push(b);
  await write(rows);
  return b;
}

// Flip a single entry in/out of the net-earnings calculation.
export async function setBuyingIncluded(id: string, included: boolean): Promise<void> {
  const rows = await read();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new ShopifyError("Entry not found.");
  row.included = included;
  await write(rows);
}

export async function deleteBuying(id: string): Promise<void> {
  const rows = await read();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) throw new ShopifyError("Entry not found.");
  await write(next);
}
