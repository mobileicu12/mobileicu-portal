import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requirePermission } from "@/lib/guard";
import { getAllProductsForExport } from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Total value and units of stock on hand across the whole catalogue.
 *
 * There was no way to see how much stock is sitting in the shop. Paging every
 * product is heavy, so this is cached for 2 minutes and loaded on its own by the
 * inventory page (it never blocks the product table). Value = available × the
 * product's price, summed over everything with stock on hand.
 */
const compute = unstable_cache(
  async () => {
    const products = await getAllProductsForExport();
    let stockUnits = 0;
    let stockValue = 0;
    for (const p of products) {
      const available = Number(p.available) || 0;
      if (available <= 0) continue;
      stockUnits += available;
      stockValue += available * (parseFloat(p.price) || 0);
    }
    return { stockUnits, stockValue: Math.round(stockValue * 100) / 100 };
  },
  ["inventory-value"],
  { revalidate: 120 },
);

export async function GET() {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ stockUnits: 0, stockValue: 0, configured: false });
  }
  try {
    return NextResponse.json({ ...(await compute()), configured: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to total the stock.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
