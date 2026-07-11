import { NextResponse } from "next/server";
import { completeInvoice, duplicateInvoice, sendInvoiceEmail } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// POST /api/billing/<id>/action  body: { action: "complete"|"duplicate"|"send", ... }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    paymentPending?: boolean;
    to?: string;
    subject?: string;
    message?: string;
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
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
