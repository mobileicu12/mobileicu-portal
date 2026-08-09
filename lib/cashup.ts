// Daily cash-up: what the system says was taken, against what staff actually
// counted in the drawer.
//
// This mirrors the paper sheet the shop already keeps, which counts the day two
// ways and checks they agree:
//
//   by source                 by method
//   account payments  140     cash   320
//   counter sales     395     card   215
//   ─────────────────────     ───────────
//   total             535     total  535
//
// Both sides must land on the same number. If they don't, a bill or a payment
// has been missed. The value of doing it in the portal rather than on paper is
// that the system side is filled in automatically, so the count becomes a check
// rather than a re-typing exercise.
import { adminGraphQL, ShopifyError } from "./shopify";
import { listInvoices } from "./billing";
import { listExpenses } from "./expenses";

const NS = "portal";

// ---- Stored record -------------------------------------------------------
// One per day. Monthly metafield buckets, same reasoning as the audit log: a
// single growing blob eventually exceeds Shopify's metafield size ceiling.
export type CashUp = {
  date: string;          // YYYY-MM-DD
  openingFloat: number;  // counted into the drawer at the start of the day
  countedCash: number;   // counted out of the drawer at close
  countedCard: number;   // card terminal total, if they reconcile it too
  note: string;
  closedBy: string;
  closedAt: string;      // ISO
};

function bucketKey(date: string): string {
  return `cashup_${date.slice(0, 4)}${date.slice(5, 7)}`;
}

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function readBucket(key: string): Promise<CashUp[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${key}") { value } } }`,
  );
  if (!d.shop.metafield?.value) return [];
  try {
    const a = JSON.parse(d.shop.metafield.value);
    return Array.isArray(a) ? (a as CashUp[]) : [];
  } catch {
    return [];
  }
}

export async function getCashUp(date: string): Promise<CashUp | null> {
  return (await readBucket(bucketKey(date))).find((c) => c.date === date) ?? null;
}

export async function listCashUps(months = 3): Promise<CashUp[]> {
  const keys = new Set<string>();
  const d = new Date();
  for (let i = 0; i < Math.max(1, months); i++) {
    keys.add(`cashup_${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  const all: CashUp[] = [];
  for (const k of keys) {
    try { all.push(...(await readBucket(k))); } catch { /* skip a bad bucket */ }
  }
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveCashUp(entry: CashUp): Promise<CashUp> {
  const key = bucketKey(entry.date);
  const list = await readBucket(key);
  const next = [...list.filter((c) => c.date !== entry.date), entry].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key, type: "json", value: JSON.stringify(next) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  return entry;
}

// ---- What the system says ------------------------------------------------

export type MethodSplit = { cash: number; card: number; "bank transfer": number; other: number };
const zeroSplit = (): MethodSplit => ({ cash: 0, card: 0, "bank transfer": 0, other: 0 });
const bucket = (m: string | null | undefined): keyof MethodSplit => {
  const k = (m || "other").toLowerCase();
  return k === "cash" || k === "card" || k === "bank transfer" ? k : "other";
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export type DayTakings = {
  date: string;
  /** Money received against a registered customer's bills. */
  fromAccounts: number;
  /** Money received on walk-in / one-off bills (no customer account). */
  fromCounter: number;
  /** Surplus paid onto an account with no open bill to clear. */
  onAccountCredit: number;
  receivedByMethod: MethodSplit;
  receivedTotal: number;
  expensesByMethod: MethodSplit;
  expensesTotal: number;
  /** Expenses paid in cash — the only ones that come out of the drawer. */
  cashExpenses: number;
  /** Sources are only trustworthy if the two ways of counting agree. */
  sourcesTotal: number;
  balanced: boolean;
};

// Sum on-account (ledger) credits dated within the window, across all customers.
// This pages through every customer, so it is deliberately NOT used anywhere on
// the hot path — the cash-up screen is opened once a day and can afford it.
async function ledgerReceived(fromMs: number, toMs: number): Promise<MethodSplit> {
  const split = zeroSplit();
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const d: {
      customers: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: { ledger: { value: string } | null } }[] };
    } = await adminGraphQL(
      `query($after: String) {
        customers(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node { ledger: metafield(namespace: "portal", key: "ledger") { value } } }
        }
      }`,
      { after },
    );
    for (const e of d.customers.edges) {
      if (!e.node.ledger?.value) continue;
      try {
        const parsed = JSON.parse(e.node.ledger.value);
        const payments: { date: string; amount: number; method?: string }[] = Array.isArray(parsed?.payments) ? parsed.payments : [];
        for (const p of payments) {
          const t = +new Date(p.date);
          if (t >= fromMs && t < toMs) split[bucket(p.method)] += Number(p.amount) || 0;
        }
      } catch { /* ignore a malformed ledger */ }
    }
    if (!d.customers.pageInfo.hasNextPage) break;
    after = d.customers.pageInfo.endCursor;
  }
  return split;
}

// Everything the portal knows about a given day's money.
export async function takingsFor(date: string): Promise<DayTakings> {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  const fromMs = +from, toMs = +to;
  const within = (iso: string) => { const t = +new Date(iso); return t >= fromMs && t < toMs; };

  const [invoices, expenses, ledger] = await Promise.all([
    listInvoices(),
    listExpenses().catch(() => []),
    ledgerReceived(fromMs, toMs).catch(() => zeroSplit()),
  ]);

  const receivedByMethod = zeroSplit();
  let fromAccounts = 0, fromCounter = 0;

  for (const inv of invoices) {
    for (const p of inv.paymentEntries) {
      if (!within(p.date)) continue;
      const amt = Number(p.amount) || 0;
      receivedByMethod[bucket(p.method)] += amt;
      if (inv.customerId) fromAccounts += amt; else fromCounter += amt;
    }
  }

  // On-account credit is money in the till too, just not against a bill yet.
  const onAccountCredit = round2(Object.values(ledger).reduce((a, b) => a + b, 0));
  for (const k of Object.keys(receivedByMethod) as (keyof MethodSplit)[]) {
    receivedByMethod[k] = round2(receivedByMethod[k] + ledger[k]);
  }

  const expensesByMethod = zeroSplit();
  for (const x of expenses) {
    if (!within(x.date)) continue;
    expensesByMethod[bucket(x.method)] += Number(x.amount) || 0;
  }

  const receivedTotal = round2(Object.values(receivedByMethod).reduce((a, b) => a + b, 0));
  const sourcesTotal = round2(fromAccounts + fromCounter + onAccountCredit);

  return {
    date,
    fromAccounts: round2(fromAccounts),
    fromCounter: round2(fromCounter),
    onAccountCredit,
    receivedByMethod,
    receivedTotal,
    expensesByMethod,
    expensesTotal: round2(Object.values(expensesByMethod).reduce((a, b) => a + b, 0)),
    cashExpenses: round2(expensesByMethod.cash),
    sourcesTotal,
    // Float comparison, not equality — these are sums of rounded currency.
    balanced: Math.abs(sourcesTotal - receivedTotal) < 0.01,
  };
}

// What SHOULD be in the drawer at close, and how far off the count is.
export function reconcile(t: DayTakings, openingFloat: number, countedCash: number, countedCard: number) {
  const expectedCash = round2(openingFloat + t.receivedByMethod.cash - t.cashExpenses);
  const expectedCard = round2(t.receivedByMethod.card);
  return {
    expectedCash,
    cashVariance: round2(countedCash - expectedCash),
    expectedCard,
    cardVariance: round2(countedCard - expectedCard),
  };
}
