// Shop expenses (rent, stock purchases, utilities, wages, transport, …).
// Stored as a JSON array in a shop metafield (portal.expenses) — no database.
import { adminGraphQL, ShopifyError } from "./shopify";

const NS = "portal";
const KEY = "expenses";

export type Expense = {
  id: string;
  date: string;        // ISO — the day the expense was incurred
  category: string;
  description: string;
  amount: number;      // GBP
  method: string;      // cash / card / bank transfer / other
  note: string;
  createdBy: string;   // who recorded it
  createdAt: string;
};

export const EXPENSE_CATEGORIES = [
  "Stock purchase", "Rent", "Utilities", "Wages", "Transport", "Equipment",
  "Packaging", "Marketing", "Software", "Repairs", "Fees", "Other",
];

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function read(): Promise<Expense[]> {
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

async function write(rows: Expense[]): Promise<void> {
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(rows) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export async function listExpenses(): Promise<Expense[]> {
  const rows = await read();
  return rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export async function addExpense(input: {
  date?: string; category: string; description?: string; amount: number; method?: string; note?: string; createdBy?: string;
}): Promise<Expense> {
  if (!(input.amount > 0)) throw new ShopifyError("A positive amount is required.");
  if (!input.category?.trim()) throw new ShopifyError("Pick a category.");
  const rows = await read();
  const exp: Expense = {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: input.date || new Date().toISOString(),
    category: input.category.trim(),
    description: (input.description || "").trim(),
    amount: Math.round(input.amount * 100) / 100,
    method: (input.method || "cash").trim(),
    note: (input.note || "").trim(),
    createdBy: input.createdBy || "",
    createdAt: new Date().toISOString(),
  };
  rows.push(exp);
  await write(rows);
  return exp;
}

export async function deleteExpense(id: string): Promise<void> {
  const rows = await read();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) throw new ShopifyError("Expense not found.");
  await write(next);
}
