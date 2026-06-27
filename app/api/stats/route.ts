import { NextResponse } from "next/server";
import { getDashboardStats, shopifyConfigured, ShopifyError } from "@/lib/shopify";

export async function GET() {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load stats.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
