import { NextResponse } from "next/server";
import { bulkSetStatus, bulkDelete } from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    action?: "activate" | "draft" | "delete";
    ids?: string[];
  } | null;

  if (!body || !Array.isArray(body.ids) || body.ids.length === 0 || !body.action) {
    return NextResponse.json({ error: "Provide an action and product ids." }, { status: 400 });
  }
  if (body.ids.length > 200) {
    return NextResponse.json({ error: "Select 200 products or fewer at a time." }, { status: 400 });
  }

  try {
    let result;
    if (body.action === "activate") result = await bulkSetStatus(body.ids, "ACTIVE");
    else if (body.action === "draft") result = await bulkSetStatus(body.ids, "DRAFT");
    else result = await bulkDelete(body.ids);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Bulk action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
