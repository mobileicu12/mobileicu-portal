import { NextResponse } from "next/server";
import { lookupByCode } from "@/lib/barcodes";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Scan lookup: find a product variant by exact barcode or SKU. Used by POS.
export async function GET(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ hit: null });
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!code.trim()) return NextResponse.json({ hit: null });
  try {
    const hit = await lookupByCode(code);
    return NextResponse.json({ hit });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Lookup failed.";
    return NextResponse.json({ error: msg, hit: null }, { status: 502 });
  }
}
