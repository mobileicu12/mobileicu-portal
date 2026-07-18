import { NextResponse } from "next/server";
import {
  getProductForEdit,
  updateFullProduct,
  addProductImage,
  deleteProductImage,
  type ProductEditInput,
} from "@/lib/product-edit";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const product = await getProductForEdit(gid(id));
    return NextResponse.json({ product });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load product.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as
    | ({ action: "update" } & ProductEditInput)
    | { action: "addImage"; url: string }
    | { action: "deleteImage"; mediaId: string };
  try {
    if (body.action === "addImage") {
      await addProductImage(gid(id), body.url);
    } else if (body.action === "deleteImage") {
      await deleteProductImage(gid(id), body.mediaId);
    } else {
      await updateFullProduct(gid(id), body);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Update failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
