import { NextResponse } from "next/server";
import { searchVariants } from "@/lib/billing";
import { requireAnyPermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing", "inventory"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ hits: [] });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  try {
    const hits = await searchVariants(q);
    return NextResponse.json({ hits });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Search failed.";
    return NextResponse.json({ error: msg, hits: [] }, { status: 502 });
  }
}
