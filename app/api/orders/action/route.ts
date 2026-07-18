import { NextResponse } from "next/server";
import { closeOrders, reopenOrders, deleteOrders } from "@/lib/orders";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

// POST /api/orders/action  { action: "archive"|"unarchive"|"delete", ids: [] }
export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { action?: string; ids?: string[] } | null;
  if (!body?.ids?.length) return NextResponse.json({ error: "Select at least one order." }, { status: 400 });
  try {
    let r: { ok: number; failed: number };
    if (body.action === "archive") r = await closeOrders(body.ids);
    else if (body.action === "unarchive") r = await reopenOrders(body.ids);
    else if (body.action === "delete") r = await deleteOrders(body.ids);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: r.ok, failed: r.failed });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Action failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
