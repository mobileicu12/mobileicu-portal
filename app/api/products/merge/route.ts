import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/guard";
import { currentActor } from "@/lib/audit";
import { getMergeCandidates, mergeProducts, mergeDuplicatesAuto } from "@/lib/merge";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

// Authoritative details for the merge modal (stock, status, price, age).
export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ candidates: [] });
  try {
    const ids = (new URL(req.url).searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return NextResponse.json({ candidates: await getMergeCandidates(ids) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Could not load these products.";
    return NextResponse.json({ error: msg, candidates: [] }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  try {
    const body = (await req.json()) as {
      survivorId?: string;
      mergedIds?: string[];
      detailsFrom?: string;
      addStock?: boolean;
      strategy?: "newest" | "oldest";
    };
    const who = await currentActor();

    if (body.strategy === "newest" || body.strategy === "oldest") {
      const result = await mergeDuplicatesAuto(body.strategy, { addStock: !!body.addStock, who });
      return NextResponse.json(result);
    }

    if (!body.survivorId) {
      return NextResponse.json({ error: "Choose which product to keep." }, { status: 400 });
    }
    if (!Array.isArray(body.mergedIds) || body.mergedIds.length === 0) {
      return NextResponse.json({ error: "Choose at least one product to merge in." }, { status: 400 });
    }
    const result = await mergeProducts(body.survivorId, body.mergedIds, {
      detailsFrom: body.detailsFrom,
      addStock: !!body.addStock,
      who,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Merge failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
