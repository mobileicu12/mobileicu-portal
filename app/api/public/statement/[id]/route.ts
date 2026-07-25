import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { getInvoiceDetail } from "@/lib/billing";
import { getSettings } from "@/lib/settings";
import { BUSINESS, type Business } from "@/lib/business";
import { verifyStatementToken } from "@/lib/invoice-link";
import { buildCustomerDayItemisedDoc } from "@/lib/report-pdf";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

// Public, token-protected itemised day-statement PDF (for WhatsApp links). Returns
// a real application/pdf so it opens directly in the phone's PDF viewer.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const date = url.searchParams.get("d") || "";
  const token = url.searchParams.get("t");
  const numId = id.split("/").pop() || id;
  if (!verifyStatementToken(numId, date, token)) return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });

  try {
    const c = await getCustomer(`gid://shopify/Customer/${numId}`);
    const invoiceDue = c.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
    const ledgerPaid = c.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const accountOutstanding = Math.max(0, (c.openingBalance || 0) + invoiceDue - ledgerPaid);

    const day = new Date(`${date}T00:00:00`);
    const end = new Date(day); end.setDate(end.getDate() + 1);
    const dayInv = c.invoices.filter((i) => { const t = new Date(i.createdAt); return t >= day && t < end; });

    const num = (s: string) => parseFloat(s) || 0;
    let todayTotal = 0, todayPaid = 0, todayOutstanding = 0;
    const bills = [];
    for (const i of dayInv) {
      let inv;
      try { inv = await getInvoiceDetail(i.id); } catch { continue; }
      todayTotal += num(inv.total); todayPaid += inv.amountPaid; todayOutstanding += inv.balance;
      bills.push({ invoiceNo: inv.invoiceNo, name: inv.name, status: inv.status, createdAt: inv.createdAt, total: inv.total, amountPaid: inv.amountPaid, balance: inv.balance, lines: inv.lines.map((l) => ({ title: l.title, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })) });
    }

    const s = await getSettings().catch(() => null);
    const business: Business = s
      ? { name: s.bizName || BUSINESS.name, tagline: s.tagline || BUSINESS.tagline, addressLines: String(s.address || "").split("\n").map((x) => x.trim()).filter(Boolean), email: s.email || "", phone: s.phone || "", website: s.website || "", vatNumber: s.vatNumber || "", bank: s.bank || s.invoiceFooter || "" }
      : BUSINESS;

    const name = c.name || c.company || "Customer";
    const doc = buildCustomerDayItemisedDoc(name, bills, { todayTotal, todayPaid, todayOutstanding, accountOutstanding }, { dateLabel: day.toLocaleDateString("en-GB"), business });
    const buf = doc.output("arraybuffer");
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name.replace(/[^\w-]/g, "_")}_${date}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Statement not found.";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
