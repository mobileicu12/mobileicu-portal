import { NextResponse } from "next/server";
import { getCustomer, addPayment, allocatePayment, reapplyAccountCredits, removePayment, updatePaymentAt, setCustomerSegments, setTradeCode, updateCustomer, type Payment } from "@/lib/customers";
import type { SegmentKey } from "@/lib/segments";
import { requirePermission } from "@/lib/guard";
import { accountSharePath } from "@/lib/invoice-link";
import { audit } from "@/lib/audit";
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
  const body = (await req.json().catch(() => null)) as {
    segments?: SegmentKey[];
    action?: string;
    update?: UpdateFields;
    index?: number;
    amount?: number;
    method?: string;
    note?: string;
    date?: string;
  } | null;
  try {
    if (body?.action === "generateTradeCode") {
      const code = await setTradeCode(gid(id));
      return NextResponse.json({ ok: true, tradeCode: code });
    }
    if (body?.action === "reapplyCredits") {
      const { ledger, allocation } = await reapplyAccountCredits(gid(id));
      await audit("customer.credit.reapply", { ref: gid(id), detail: `Settled ${allocation.settled.length} bill(s)${allocation.partial ? `, part-paid ${allocation.partial.name} £${allocation.partial.amount.toFixed(2)}` : ""}, £${allocation.creditedToAccount.toFixed(2)} left on account` });
      return NextResponse.json({ ok: true, ledger, allocation });
    }
    if (body?.action === "removePayment") {
      if (typeof body.index !== "number") return NextResponse.json({ error: "index required." }, { status: 400 });
      const ledger = await removePayment(gid(id), body.index);
      await audit("customer.payment.revoke", { ref: gid(id), detail: `Revoked on-account payment #${body.index}` });
      return NextResponse.json({ ok: true, ledger });
    }
    if (body?.action === "editPayment") {
      if (typeof body.index !== "number") return NextResponse.json({ error: "index required." }, { status: 400 });
      const ledger = await updatePaymentAt(gid(id), body.index, { amount: body.amount, method: body.method, note: body.note, date: body.date });
      await audit("customer.payment.edit", { ref: gid(id), detail: `Payment #${body.index} → £${Number(body.amount ?? 0).toFixed(2)} ${body.method || ""}`.trim() });
      return NextResponse.json({ ok: true, ledger });
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
    // Signed link to the full account statement (every bill + every payment), so
    // the portal can share it without holding the signing secret.
    const numId = gid(id).split("/").pop() || id;
    return NextResponse.json({ customer, accountShareUrl: accountSharePath(numId) });
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
  const body = (await req.json().catch(() => null)) as (Payment & { allocate?: boolean }) | null;
  if (!body || typeof body.amount !== "number" || body.amount <= 0) {
    return NextResponse.json({ error: "A positive payment amount is required." }, { status: 400 });
  }
  try {
    // Default: allocate the payment to the customer's oldest open invoices, auto-marking
    // fully-covered ones as paid. Pass allocate:false for a plain account credit.
    if (body.allocate === false) {
      const ledger = await addPayment(gid(id), {
        date: body.date || new Date().toISOString(),
        amount: body.amount,
        method: body.method || "cash",
        note: body.note || "",
      });
      await audit("customer.payment.add", { ref: gid(id), detail: `£${body.amount.toFixed(2)} ${body.method || "cash"} held on account` });
      return NextResponse.json({ ok: true, ledger });
    }
    const { ledger, allocation } = await allocatePayment(gid(id), body.amount, {
      method: body.method || "cash",
      date: body.date || new Date().toISOString(),
      note: body.note || "",
    });
    await audit("customer.payment.add", {
      ref: gid(id),
      detail: `£${body.amount.toFixed(2)} ${body.method || "cash"} — settled ${allocation.settled.length} bill(s)${allocation.partial ? `, part-paid ${allocation.partial.name} £${allocation.partial.amount.toFixed(2)}` : ""}${allocation.creditedToAccount > 0.001 ? `, £${allocation.creditedToAccount.toFixed(2)} on account` : ""}`,
    });
    return NextResponse.json({ ok: true, ledger, allocation });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to record payment.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
