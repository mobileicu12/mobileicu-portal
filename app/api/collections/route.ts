import { NextResponse } from "next/server";
import { getCollectionsDetailed } from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ collections: [] });
  try {
    const collections = await getCollectionsDetailed();
    return NextResponse.json({ collections });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load collections.";
    return NextResponse.json({ error: msg, collections: [] }, { status: 502 });
  }
}
