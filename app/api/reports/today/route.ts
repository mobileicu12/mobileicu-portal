import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { canSeeFinanceRequest } from "@/lib/guard";
import { listInvoices } from "@/lib/billing";
import { accountTotals } from "@/lib/account-totals";
import { adminGraphQL, shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

// Sum on-account (ledger) payments dated today across all customers — one paginated
// query, so it stays cheap enough for the dashboard.
async function ledgerCollectedToday(startMs: number): Promise<number> {
  let after: string | null = null;
  let sum = 0;
  for (let page = 0; page < 15; page++) {
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
        const payments: { date: string; amount: number }[] = Array.isArray(parsed?.payments) ? parsed.payments : [];
        for (const p of payments) if (+new Date(p.date) >= startMs) sum += Number(p.amount) || 0;
      } catch { /* ignore malformed */ }
    }
    if (!d.customers.pageInfo.hasNextPage) break;
    after = d.customers.pageInfo.endCursor;
  }
  return sum;
}

// Whole-book receivable, defined via the SAME accountTotals() the Customers
// page, digest, export and storefront use — opening balance + billed − received
// (received counts money on bills AND on account, uncapped), floored per account.
// The dashboard used to sum per-invoice balances, which ignored opening balances
// and account credits, so its headline disagreed with every other screen. One
// paginated customer scan (capped) with a per-invoice fallback for the tail.
async function accountReceivable(all: Awaited<ReturnType<typeof listInvoices>>): Promise<number> {
  const num = (s: string) => parseFloat(s) || 0;
  // Per-customer invoice totals from the invoices already loaded.
  const byCust = new Map<string, { billed: number; paid: number }>();
  let walkinOwed = 0;
  for (const r of all) {
    if (r.customerId) {
      const cur = byCust.get(r.customerId) ?? { billed: 0, paid: 0 };
      cur.billed += num(r.total);
      cur.paid += Number(r.amountPaid) || 0;
      byCust.set(r.customerId, cur);
    } else {
      walkinOwed += Math.max(0, Number(r.balance) || 0);
    }
  }

  let after: string | null = null;
  let accountOwed = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const d: {
      customers: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; opening: { value: string } | null; ledger: { value: string } | null } }[];
      };
    } = await adminGraphQL(
      `query($after: String) {
        customers(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          edges { node {
            id
            opening: metafield(namespace: "portal", key: "opening_balance") { value }
            ledger: metafield(namespace: "portal", key: "ledger") { value }
          } }
        }
      }`,
      { after },
    );
    for (const e of d.customers.edges) {
      seen.add(e.node.id);
      const opening = Number(e.node.opening?.value ?? 0) || 0;
      const onAccount: { amount: number }[] = [];
      if (e.node.ledger?.value) {
        try {
          const parsed = JSON.parse(e.node.ledger.value);
          if (Array.isArray(parsed?.payments)) for (const p of parsed.payments) onAccount.push({ amount: Number(p.amount) || 0 });
        } catch { /* malformed ledger ignored */ }
      }
      const inv = byCust.get(e.node.id) ?? { billed: 0, paid: 0 };
      const totals = accountTotals({
        openingBalance: opening,
        invoices: [{ total: inv.billed, amountPaid: inv.paid }],
        ledger: { payments: onAccount },
      });
      accountOwed += totals.owed;
    }
    if (!d.customers.pageInfo.hasNextPage) break;
    after = d.customers.pageInfo.endCursor;
  }
  // Any customer past the scan cap: fall back to their floored invoice balance
  // rather than dropping them.
  for (const [id, v] of byCust) if (!seen.has(id)) accountOwed += Math.max(0, v.billed - v.paid);

  return Math.round((accountOwed + walkinOwed) * 100) / 100;
}

// The (user-independent) takings computation, cached for 2 minutes so repeated
// dashboard loads don't re-scan every invoice + customer ledger (was causing lag).
const computeToday = unstable_cache(async () => {
    const all = await listInvoices();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const rows = all.filter((r) => new Date(r.createdAt) >= start);
    const num = (s: string) => parseFloat(s) || 0;

    let total = 0, paid = 0, retail = 0, wholesale = 0, marketplace = 0;
    const byMethod: Record<string, number> = { cash: 0, card: 0, "bank transfer": 0, other: 0 };
    for (const r of rows) {
      const t = num(r.total);
      total += t;
      if (r.status === "COMPLETED") paid += t;
      if (r.segment === "online") wholesale += t;
      else if (r.segment === "ebay" || r.segment === "amazon") marketplace += t;
      else retail += t; // shop / POS / unset
      const m = (r.payMethod || "other").toLowerCase();
      byMethod[m in byMethod ? m : "other"] += t;
    }

    // Total still owed across the whole book, defined like the Customers page
    // (accountTotals): opening balance + billed − received, floored per account,
    // plus walk-in bills — so the dashboard headline matches every other screen.
    const outstanding = await accountReceivable(all);

    // Full collection today = today's paid sales + on-account (ledger) payments today.
    // The all-customer ledger scan is DISABLED by default for performance; set
    // ENABLE_LEDGER_TODAY=1 to include on-account payments in "Collected today".
    const ledgerToday = process.env.ENABLE_LEDGER_TODAY === "1" ? await ledgerCollectedToday(+start).catch(() => 0) : 0;
    const collectedToday = paid + ledgerToday;

    const latest = rows[0]
      ? { invoiceNo: rows[0].invoiceNo, customer: rows[0].customer, total: num(rows[0].total), paid: rows[0].status === "COMPLETED", createdAt: rows[0].createdAt }
      : null;

    return {
      date: start.toISOString().slice(0, 10),
      count: rows.length,
      total, paid, retail, wholesale, marketplace, outstanding,
      ledgerToday, collectedToday,
      byMethod,
      latest,
    };
  },
  ["today-takings"],
  { revalidate: 120 },
);

// "Today's takings" / today's collection — sensitive figures. Owner always;
// staff only during an owner-approved reveal window (see lib/finance-access).
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await canSeeFinanceRequest())) return NextResponse.json({ error: "Financial figures are hidden. Ask the owner to approve access." }, { status: 403 });
  try {
    return NextResponse.json(await computeToday());
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load today's takings.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
