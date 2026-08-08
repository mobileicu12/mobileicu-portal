import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { getCustomer, receivedBetween } from "@/lib/customers";
import { getInvoiceDetail } from "@/lib/billing";
import { mapLimit } from "@/lib/async";
import { waConfigured } from "@/lib/whatsapp";
import { statementSharePath } from "@/lib/invoice-link";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;
}

// One customer's itemised TODAY activity (items per bill) + today's paid/outstanding
// and total account outstanding. Powers the per-customer "today's statement".
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ today: null });
  const { id } = await ctx.params;
  try {
    const c = await getCustomer(gid(id));
    const invoiceDue = c.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
    const ledgerPaid = c.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const accountOutstanding = Math.max(0, (c.openingBalance || 0) + invoiceDue - ledgerPaid);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const todaysInv = c.invoices.filter((i) => new Date(i.createdAt) >= start);

    const num = (s: string) => parseFloat(s) || 0;
    // Fetch each bill's itemised detail in parallel (bounded) instead of one-by-one.
    const details = await mapLimit(todaysInv, 5, (i) => getInvoiceDetail(i.id).catch(() => null));
    let todayTotal = 0, todayOutstanding = 0;
    const bills = [];
    for (const inv of details) {
      if (!inv) continue;
      todayTotal += num(inv.total);
      todayOutstanding += inv.balance;
      bills.push({
        invoiceNo: inv.invoiceNo, name: inv.name, status: inv.status, createdAt: inv.createdAt,
        total: inv.total, amountPaid: inv.amountPaid, balance: inv.balance,
        lines: inv.lines.map((l) => ({ title: l.title, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
      });
    }

    // Money received TODAY, wherever it landed — settling an old bill still
    // counts. Summing the paid portion of today's bills reported £0 on days when
    // a customer cleared an older invoice.
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const todayPaid = receivedBetween(c, start, end);

    const numId = c.id.split("/").pop() || c.id;
    const dateStr = start.toISOString().slice(0, 10);
    return NextResponse.json({
      today: {
        id: c.id, name: c.name || c.company || "Customer", email: c.email || "", phone: c.phone || "",
        todayTotal, todayPaid, todayOutstanding, accountOutstanding, bills,
      },
      shareUrl: statementSharePath(numId, dateStr),
      waConfigured: await waConfigured(),
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load today's statement.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
