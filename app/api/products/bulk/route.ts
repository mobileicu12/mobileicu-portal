import { NextResponse } from "next/server";
import {
  bulkSetStatus,
  bulkDelete,
  bulkSetPrice,
  bulkSetStock,
  bulkAddToCollection,
} from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  action: "activate" | "draft" | "delete" | "price" | "stock" | "collection";
  productIds?: string[];
  variants?: { id: string; productId: string }[];
  inventoryItemIds?: string[];
  value?: number;
  collectionId?: string;
  locationId?: string;
};

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.action) {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }

  try {
    let result: { ok: number; failed: number };
    switch (body.action) {
      case "activate":
        result = await bulkSetStatus(body.productIds ?? [], "ACTIVE");
        break;
      case "draft":
        result = await bulkSetStatus(body.productIds ?? [], "DRAFT");
        break;
      case "delete":
        result = await bulkDelete(body.productIds ?? []);
        break;
      case "price":
        if (typeof body.value !== "number")
          return NextResponse.json({ error: "Price value required." }, { status: 400 });
        result = await bulkSetPrice(body.variants ?? [], body.value);
        break;
      case "stock":
        if (typeof body.value !== "number" || !body.locationId)
          return NextResponse.json({ error: "Stock value and location required." }, { status: 400 });
        result = await bulkSetStock(body.inventoryItemIds ?? [], body.locationId, body.value);
        break;
      case "collection":
        if (!body.collectionId)
          return NextResponse.json({ error: "Collection required." }, { status: 400 });
        result = await bulkAddToCollection(body.productIds ?? [], body.collectionId);
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Bulk action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
