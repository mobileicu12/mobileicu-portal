import { NextResponse } from "next/server";
import { importRows, type ImportRow } from "@/lib/products";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as ImportRow | null;
  if (!body || !body.title?.trim()) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  try {
    const [result] = await importRows([body]);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Failed to save." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, action: result.action });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to save product.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
