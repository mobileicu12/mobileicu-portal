import { NextResponse } from "next/server";
import {
  getCollection,
  updateCollection,
  deleteCollection,
  removeProductsFromCollection,
  setCollectionParent,
} from "@/lib/collections";
import { bulkAddToCollection } from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Collection/${id}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  try {
    const collection = await getCollection(gid(id), searchParams.get("after"));
    return NextResponse.json({ collection });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load collection.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action: "update" | "addProducts" | "removeProducts" | "setParent";
    title?: string;
    descriptionHtml?: string;
    productIds?: string[];
    parentId?: string | null;
  };
  try {
    if (body.action === "update") {
      await updateCollection(gid(id), { title: body.title, descriptionHtml: body.descriptionHtml });
    } else if (body.action === "addProducts") {
      await bulkAddToCollection(body.productIds ?? [], gid(id));
    } else if (body.action === "removeProducts") {
      await removeProductsFromCollection(gid(id), body.productIds ?? []);
    } else if (body.action === "setParent") {
      await setCollectionParent(gid(id), body.parentId ? gid(body.parentId) : null);
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    await deleteCollection(gid(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to delete.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
