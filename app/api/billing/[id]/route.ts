import { NextResponse } from "next/server";
import { getInvoiceDetail, updateInvoice, deleteInvoice, type UpdateInvoiceInput } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const { id } = await params;
  try {
    const invoice = await getInvoiceDetail(decodeURIComponent(id));
    return NextResponse.json({ invoice });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as UpdateInvoiceInput | null;
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "An invoice needs at least one product." }, { status: 400 });
  }
  try {
    const result = await updateInvoice(decodeURIComponent(id), body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  try {
    await deleteInvoice(decodeURIComponent(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to delete invoice.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
