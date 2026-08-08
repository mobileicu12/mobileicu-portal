import { NextResponse } from "next/server";
import { getInvoiceDetail, completeInvoice, duplicateInvoice, sendInvoiceEmail, addInvoicePayment, removeInvoicePayment, voidInvoice } from "@/lib/billing";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/billing/<id>/action  body: { action: "complete"|"duplicate"|"send"|"payment", ... }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    paymentPending?: boolean;
    to?: string;
    subject?: string;
    message?: string;
    amount?: number;
    method?: string;
    note?: string;
    date?: string;
    index?: number;
  };
  // Label the log lines with the human invoice number, not the Shopify gid.
  const label = await getInvoiceDetail(decoded).then((i) => i.invoiceNo || i.name).catch(() => decoded);

  try {
    switch (body.action) {
      case "complete": {
        const r = await completeInvoice(decoded, !!body.paymentPending);
        await audit("invoice.complete", { ref: decoded, name: label, detail: "Marked paid; stock deducted" });
        return NextResponse.json({ ok: true, ...r });
      }
      case "duplicate": {
        const r = await duplicateInvoice(decoded);
        await audit("invoice.duplicate", { ref: decoded, name: label, detail: `Copied to ${r.name}` });
        return NextResponse.json({ ok: true, ...r });
      }
      case "send": {
        await sendInvoiceEmail(decoded, { to: body.to, subject: body.subject, message: body.message });
        return NextResponse.json({ ok: true });
      }
      case "payment": {
        if (typeof body.amount !== "number" || body.amount <= 0) {
          return NextResponse.json({ error: "A positive payment amount is required." }, { status: 400 });
        }
        const payments = await addInvoicePayment(decoded, {
          date: body.date || new Date().toISOString(),
          amount: body.amount,
          method: body.method || "cash",
          note: body.note || "",
        });
        await audit("invoice.payment.add", { ref: decoded, name: label, detail: `£${body.amount.toFixed(2)} ${body.method || "cash"}${body.note ? ` — ${body.note}` : ""}` });
        return NextResponse.json({ ok: true, payments });
      }
      case "removePayment": {
        if (typeof body.index !== "number") return NextResponse.json({ error: "index required." }, { status: 400 });
        const gone = (await getInvoiceDetail(decoded).catch(() => null))?.payments?.[body.index];
        const payments = await removeInvoicePayment(decoded, body.index);
        await audit("invoice.payment.revoke", { ref: decoded, name: label, detail: gone ? `Removed £${Number(gone.amount).toFixed(2)} ${gone.method}` : `Removed payment #${body.index}` });
        return NextResponse.json({ ok: true, payments });
      }
      case "void": {
        await voidInvoice(decoded);
        await audit("invoice.void", { ref: decoded, name: label, detail: "Voided — order cancelled and stock restored" });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
