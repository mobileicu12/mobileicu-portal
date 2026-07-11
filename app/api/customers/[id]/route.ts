import { NextResponse } from "next/server";
import { getCustomer, addPayment, setCustomerSegments, type Payment } from "@/lib/customers";
import type { SegmentKey } from "@/lib/segments";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { segments?: SegmentKey[] } | null;
  if (!body || !Array.isArray(body.segments)) {
    return NextResponse.json({ error: "segments array required." }, { status: 400 });
  }
  try {
    const segments = await setCustomerSegments(gid(id), body.segments);
    return NextResponse.json({ ok: true, segments });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update segments.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  try {
    const customer = await getCustomer(gid(id));
    return NextResponse.json({ customer });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load customer.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Payment | null;
  if (!body || typeof body.amount !== "number" || body.amount <= 0) {
    return NextResponse.json({ error: "A positive payment amount is required." }, { status: 400 });
  }
  try {
    const ledger = await addPayment(gid(id), {
      date: body.date || new Date().toISOString(),
      amount: body.amount,
      method: body.method || "cash",
      note: body.note || "",
    });
    return NextResponse.json({ ok: true, ledger });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to record payment.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
