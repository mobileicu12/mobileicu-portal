import { NextResponse } from "next/server";
import { bulkCustomerSegments, bulkDeleteCustomers } from "@/lib/customers";
import type { SegmentKey } from "@/lib/segments";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;
}

// POST /api/customers/bulk  { action: "addSegments"|"removeSegments"|"delete", ids: [], segments?: [] }
export async function POST(req: Request) {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    ids?: string[];
    segments?: SegmentKey[];
  } | null;
  if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "Select at least one customer." }, { status: 400 });
  }
  const ids = body.ids.map(gid);
  try {
    if (body.action === "addSegments" || body.action === "removeSegments") {
      if (!body.segments?.length) return NextResponse.json({ error: "Choose a segment." }, { status: 400 });
      const r = await bulkCustomerSegments(ids, body.segments, body.action === "addSegments" ? "add" : "remove");
      return NextResponse.json({ ok: r.ok, failed: r.failed });
    }
    if (body.action === "delete") {
      const r = await bulkDeleteCustomers(ids);
      return NextResponse.json({ ok: r.ok, failed: r.failed });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Bulk action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
