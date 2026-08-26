import { NextResponse } from "next/server";
import { listRuns, getRunForDisplay } from "@/lib/import-runs";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// GET /api/import/runs        -> every recorded import, newest first
// GET /api/import/runs?id=<x> -> one run with its per-row outcome
export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const run = await getRunForDisplay(id);
      if (!run) return NextResponse.json({ error: "Import run not found." }, { status: 404 });
      return NextResponse.json({ run });
    }
    return NextResponse.json({ runs: await listRuns() });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't load import history.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
