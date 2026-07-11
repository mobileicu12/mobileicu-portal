import { NextResponse } from "next/server";
import { autoOrganizeCollections } from "@/lib/collections";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  try {
    const result = await autoOrganizeCollections();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Auto-organize failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
