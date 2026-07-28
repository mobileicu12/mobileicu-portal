import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { listInvoices, getInvoiceDetail } from "@/lib/billing";
import { getCustomer } from "@/lib/customers";
import { waConfigured } from "@/lib/whatsapp";
import { statementSharePath } from "@/lib/invoice-link";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { mapPool } from "@/lib/concurrency";

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

    // Customers, then each customer's bills, are fetched a few at a time rather
    // than strictly one after another — this endpoint used to take one Shopify
    // round trip per customer PLUS one per bill, all sequential, which is what
    // made the "Today's sending" drawer sit there spinning.
    const entries = [...byCustomer.entries()];
    const built = await mapPool(entries, 4, async ([cid, rows]) => {
      let detail;
      try { detail = await getCustomer(cid); } catch { return null; }
      const invoiceDue = detail.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
      const ledgerPaid = detail.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const accountOutstanding = Math.max(0, (detail.openingBalance || 0) + invoiceDue - ledgerPaid);

      const details = await mapPool(rows, 4, async (r) => {
        try { return await getInvoiceDetail(r.id); } catch { return null; }
      });

      let todayTotal = 0, todayPaid = 0, todayOutstanding = 0;
      const bills = [];
      for (const inv of details) {
        if (!inv) continue;
        todayTotal += num(inv.total);
        todayPaid += inv.amountPaid;
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
