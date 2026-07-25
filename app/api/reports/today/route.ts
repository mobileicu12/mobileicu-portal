import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { listInvoices } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// "Today's takings" / today's collection — visible to any billing-capable teammate.
// (This is the day's collection, not the all-time earnings totals which stay finance-only.)
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const denied = await requirePermission("billing");
  if (denied) return denied;

  try {
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

    const latest = rows[0]
      ? { invoiceNo: rows[0].invoiceNo, customer: rows[0].customer, total: num(rows[0].total), paid: rows[0].status === "COMPLETED", createdAt: rows[0].createdAt }
      : null;

    return NextResponse.json({
      date: start.toISOString().slice(0, 10),
      count: rows.length,
      total, paid, retail, wholesale, marketplace, outstanding,
      byMethod,
      latest,
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load today's takings.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
