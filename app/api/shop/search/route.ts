import { NextResponse } from "next/server";
import { searchStorefront } from "@/lib/storefront";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";

// Public live-search suggestions for the storefront (no prices — the shop is gated).
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!shopifyConfigured() || q.length < 2) return NextResponse.json({ hits: [] });
  try {
    const products = await searchStorefront(q, 6);
    const hits = products.map((p) => ({
      handle: p.handle,
      title: p.title,
      image: p.image,
      label: p.brand || p.type || "",
      available: p.available,
    }));
    return NextResponse.json({ hits });
  } catch {
    return NextResponse.json({ hits: [] });
  }
}
