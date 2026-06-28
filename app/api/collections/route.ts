import { NextResponse } from "next/server";
import { getCollectionsDetailed } from "@/lib/products";
import { createCollection } from "@/lib/collections";
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

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { title?: string; descriptionHtml?: string };
  try {
    const result = await createCollection({ title: body.title ?? "", descriptionHtml: body.descriptionHtml });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to create collection.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
