import { NextResponse } from "next/server";
import { searchVariants } from "@/lib/billing";
import { TILL_TAG } from "@/lib/channels";
import { requireAnyPermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing", "inventory"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ hits: [] });
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const tag = searchParams.get("scope") === "till" ? TILL_TAG : undefined;
  try {
    const hits = await searchVariants(q, { tag });
    return NextResponse.json({ hits });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Search failed.";
    return NextResponse.json({ error: msg, hits: [] }, { status: 502 });
  }
}
