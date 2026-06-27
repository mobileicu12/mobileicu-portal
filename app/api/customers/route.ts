import { NextResponse } from "next/server";
import { createCustomer, listCustomers } from "@/lib/customers";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ customers: [] });
  const { searchParams } = new URL(req.url);
  try {
    const customers = await listCustomers(searchParams.get("q") ?? undefined);
    return NextResponse.json({ customers });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load customers.";
    return NextResponse.json({ error: msg, customers: [] }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const result = await createCustomer(body);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to create customer.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
