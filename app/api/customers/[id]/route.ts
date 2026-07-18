import { NextResponse } from "next/server";
import { getCustomer, addPayment, setCustomerSegments, setTradeCode, updateCustomer, type Payment } from "@/lib/customers";
import type { SegmentKey } from "@/lib/segments";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

function gid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/Customer/${id}`;
}

type UpdateFields = { firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; note?: string; openingBalance?: number };

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("customers");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { segments?: SegmentKey[]; action?: string; update?: UpdateFields } | null;
  try {
    if (body?.action === "generateTradeCode") {
      const code = await setTradeCode(gid(id));
      return NextResponse.json({ ok: true, tradeCode: code });
    }
    if (body?.update) {
      await updateCustomer(gid(id), body.update);
      return NextResponse.json({ ok: true });
    }
    if (body && Array.isArray(body.segments)) {
      const segments = await setCustomerSegments(gid(id), body.segments);
      return NextResponse.json({ ok: true, segments });
    }
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update.";
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
  const denied = await requirePermission("customers");
  if (denied) return denied;
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
