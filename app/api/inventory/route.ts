import { NextResponse } from "next/server";
import {
  getInventory,
  setAvailable,
  shopifyConfigured,
  ShopifyError,
} from "@/lib/shopify";

export async function GET(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json(
      { error: "Shopify not configured. Add your token to .env.local." },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";
  const after = searchParams.get("after");
  const sort = searchParams.get("sort") ?? undefined;
  const reverse = searchParams.get("reverse") === "1";
  try {
    const result = await getInventory({ query, after, first: 25, sortKey: sort, reverse });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load inventory.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json(
      { error: "Shopify not configured." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as {
    inventoryItemId?: string;
    locationId?: string;
    quantity?: number;
  };
  const { inventoryItemId, locationId, quantity } = body;
  if (!inventoryItemId || !locationId || typeof quantity !== "number") {
    return NextResponse.json(
      { error: "inventoryItemId, locationId and quantity are required." },
      { status: 400 },
    );
  }
  try {
    await setAvailable(inventoryItemId, locationId, Math.max(0, Math.round(quantity)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
