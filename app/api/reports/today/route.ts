import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requirePermission } from "@/lib/guard";
import { listInvoices } from "@/lib/billing";
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

    // Total outstanding across ALL invoices (unpaid/draft totals) — visible to staff.
    let outstanding = 0;
    for (const r of all) if (r.status !== "COMPLETED") outstanding += num(r.total);

    // Full collection today = today's paid sales + on-account (ledger) payments today.
    const ledgerToday = await ledgerCollectedToday(+start).catch(() => 0);
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

// "Today's takings" / today's collection — visible to any billing-capable teammate.
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const denied = await requirePermission("billing");
  if (denied) return denied;
  try {
    return NextResponse.json(await computeToday());
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load today's takings.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
