import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/collections";
import { requireAnyPermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAnyPermission(["inventory", "collections"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ products: [] });
  const { searchParams } = new URL(req.url);
  try {
    const products = await searchProducts(searchParams.get("q") ?? "");
    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Search failed.";
    return NextResponse.json({ error: msg, products: [] }, { status: 502 });
  }
}
