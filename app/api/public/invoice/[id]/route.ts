import { NextResponse } from "next/server";
import { getInvoiceDetail } from "@/lib/billing";
import { getSettings } from "@/lib/settings";
import { BUSINESS, type Business } from "@/lib/business";
import { verifyInvoiceToken } from "@/lib/invoice-link";
import { buildInvoiceDoc, invoiceFilename } from "@/lib/invoice-pdf";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Public invoice PDF for a WhatsApp share link. Requires a valid HMAC token so
// invoices can't be enumerated by id. Returns a real application/pdf so it opens
// directly in the phone's PDF viewer.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const numId = id.split("/").pop() || id;
  if (!verifyInvoiceToken(numId, token)) return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
  try {
    const invoice = await getInvoiceDetail(numId);
    const s = await getSettings().catch(() => null);
    const business: Business = s
      ? { name: s.bizName || BUSINESS.name, tagline: s.tagline || BUSINESS.tagline, addressLines: String(s.address || "").split("\n").map((x) => x.trim()).filter(Boolean), email: s.email || "", phone: s.phone || "", website: s.website || "", vatNumber: s.vatNumber || "", bank: s.bank || s.invoiceFooter || "" }
      : BUSINESS;
    const buf = buildInvoiceDoc(invoice, business).output("arraybuffer");
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoiceFilename(invoice, business)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Invoice not found.";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
