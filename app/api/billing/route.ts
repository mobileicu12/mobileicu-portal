import { NextResponse } from "next/server";
import { createBill, listInvoices, summarizeInvoices, type CreateBillInput } from "@/lib/billing";
import { auth } from "@/auth";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ invoices: [], stats: null });
  try {
    const invoices = await listInvoices();
    return NextResponse.json({ invoices, stats: summarizeInvoices(invoices) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load invoices.";
    return NextResponse.json({ error: msg, invoices: [], stats: null }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as CreateBillInput | null;
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "Add at least one product." }, { status: 400 });
  }
  try {
    const session = await auth().catch(() => null);
    const staff = session?.user?.email || undefined;
    const result = await createBill({ ...body, staff });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to create bill.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
