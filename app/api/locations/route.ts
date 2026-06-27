import { NextResponse } from "next/server";
import { getLocations, shopifyConfigured, ShopifyError } from "@/lib/shopify";

export async function GET() {
  if (!shopifyConfigured()) {
    return NextResponse.json({ locations: [] });
  }
  try {
    const locations = await getLocations();
    return NextResponse.json({ locations });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load locations.";
    return NextResponse.json({ error: msg, locations: [] }, { status: 502 });
  }
}
