import { NextResponse } from "next/server";
import { listOrders, summarizeOrders } from "@/lib/orders";
import type { SegmentKey } from "@/lib/segments";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ orders: [], stats: null });
  const { searchParams } = new URL(req.url);
  const seg = searchParams.get("segment");
  try {
    const orders = await listOrders({
      query: searchParams.get("q") ?? undefined,
      segment: (seg as SegmentKey) || undefined,
    });
    return NextResponse.json({ orders, stats: summarizeOrders(orders) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load orders.";
    return NextResponse.json({ error: msg, orders: [], stats: null }, { status: 502 });
  }
}
