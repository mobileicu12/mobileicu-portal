import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { stagedUploadImage } from "@/lib/shopify-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload a product image to Shopify's staged storage. Returns { url } — the
 * resourceUrl the product form then attaches as media (addImage / files).
 */
export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED.includes(mimeType.toLowerCase())) {
      return NextResponse.json(
        { error: "Unsupported image type. Use JPG, PNG, WEBP, GIF or AVIF." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Image too large (max ${MAX_BYTES / 1024 / 1024}MB).` },
        { status: 400 },
      );
    }
    const filename =
      (file instanceof File && file.name) || `upload-${Date.now()}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await stagedUploadImage(filename, mimeType, buffer);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Upload failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
