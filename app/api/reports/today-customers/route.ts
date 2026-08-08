import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { listInvoices, getInvoiceDetail } from "@/lib/billing";
import { getCustomer, receivedBetween } from "@/lib/customers";
import { mapLimit } from "@/lib/async";
import { waConfigured } from "@/lib/whatsapp";
import { statementSharePath } from "@/lib/invoice-link";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

// Per-customer breakdown of TODAY's activity, itemised (which items in which bill),
// with today's paid/outstanding and the customer's total account outstanding.
export async function GET() {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ customers: [] });

  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const todays = (await listInvoices()).filter((r) => r.customerId && new Date(r.createdAt) >= start);

    // Group by customer account.
    const byCustomer = new Map<string, typeof todays>();
    for (const r of todays) {
      const arr = byCustomer.get(r.customerId!) ?? [];
      arr.push(r);
      byCustomer.set(r.customerId!, arr);
    }

    const num = (s: string) => parseFloat(s) || 0;

    // Process customers in parallel (bounded), and each customer's bills in
    // parallel too — replaces a slow sequential nested N+1 loop.
    const entries = [...byCustomer.entries()];
    const built = await mapLimit(entries, 4, async ([cid, rows]) => {
      let detail;
      try { detail = await getCustomer(cid); } catch { return null; }
      const invoiceDue = detail.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
      const ledgerPaid = detail.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const accountOutstanding = Math.max(0, (detail.openingBalance || 0) + invoiceDue - ledgerPaid);

      const details = await mapLimit(rows, 4, (r) => getInvoiceDetail(r.id).catch(() => null));
      const bills = [];
      let todayTotal = 0, todayOutstanding = 0;
      for (const inv of details) {
        if (!inv) continue;
        todayTotal += num(inv.total);
        todayOutstanding += inv.balance;
        bills.push({
          invoiceNo: inv.invoiceNo,
          name: inv.name,
          status: inv.status,
          createdAt: inv.createdAt,
          total: inv.total,
          amountPaid: inv.amountPaid,
          balance: inv.balance,
          lines: inv.lines.map((l) => ({ title: l.title, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
        });
      }

      // Received today across every bill + on-account, not just today's bills.
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const todayPaid = receivedBetween(detail, start, end);

      const numId = cid.split("/").pop() || cid;
      return {
        id: cid,
        name: detail.name || detail.company || "Customer",
        email: detail.email || "",
        phone: detail.phone || "",
        todayTotal, todayPaid, todayOutstanding, accountOutstanding,
        bills,
        shareUrl: statementSharePath(numId, start.toISOString().slice(0, 10)),
      };
    });
    const out = built.filter(Boolean);

    return NextResponse.json({ date: start.toISOString().slice(0, 10), waConfigured: await waConfigured(), customers: out });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to build today's summary.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
