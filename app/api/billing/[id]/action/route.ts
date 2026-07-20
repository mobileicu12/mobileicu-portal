import { NextResponse } from "next/server";
import { completeInvoice, duplicateInvoice, sendInvoiceEmail, addInvoicePayment, removeInvoicePayment, voidInvoice } from "@/lib/billing";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

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
  try {
    switch (body.action) {
      case "complete": {
        const r = await completeInvoice(decoded, !!body.paymentPending);
        return NextResponse.json({ ok: true, ...r });
      }
      case "duplicate": {
        const r = await duplicateInvoice(decoded);
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
        return NextResponse.json({ ok: true, payments });
      }
      case "removePayment": {
        if (typeof body.index !== "number") return NextResponse.json({ error: "index required." }, { status: 400 });
        const payments = await removeInvoicePayment(decoded, body.index);
        return NextResponse.json({ ok: true, payments });
      }
      case "void": {
        await voidInvoice(decoded);
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
