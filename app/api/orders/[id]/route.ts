import { NextResponse } from "next/server";
import { getOrder } from "@/lib/orders";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const { id } = await params;
  try {
    const order = await getOrder(decodeURIComponent(id));
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load order.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
