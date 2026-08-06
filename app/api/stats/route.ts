import { NextResponse } from "next/server";
import { getDashboardStats, shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { getSettings } from "@/lib/settings";

export async function GET() {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  try {
    // Honour the owner's low-stock threshold from Settings (cached, so this is
    // not an extra Shopify round trip per dashboard load).
    const lowStock = await getSettings().then((x) => x.lowStock).catch(() => 5);
    const stats = await getDashboardStats(lowStock);
    return NextResponse.json({ ...stats, lowStockThreshold: lowStock });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load stats.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
