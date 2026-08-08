import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { listBuying, addBuying, setBuyingIncluded, deleteBuying } from "@/lib/settlements";
import { listInvoices } from "@/lib/billing";
import { audit } from "@/lib/audit";
import { auth } from "@/auth";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Sales money actually received in a date window (sum of each bill's amountPaid
// for bills created in the window). This is the gross that buying is settled against.
async function salesReceived(fromMs: number, toMs: number): Promise<number> {
  const all = await listInvoices();
  let sum = 0;
  for (const r of all) {
    const t = +new Date(r.createdAt);
    if (t >= fromMs && t <= toMs) sum += Number(r.amountPaid) || 0;
  }
  return Math.round(sum * 100) / 100;
}

export async function GET(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  if (!shopifyConfigured()) return NextResponse.json({ buying: [], salesReceived: 0 });
  const url = new URL(req.url);
  const fromMs = url.searchParams.get("from") ? +new Date(`${url.searchParams.get("from")}T00:00:00`) : 0;
  const toMs = url.searchParams.get("to") ? +new Date(`${url.searchParams.get("to")}T23:59:59`) : Date.now();
  try {
    const [buying, sales] = await Promise.all([listBuying(), salesReceived(fromMs, toMs)]);
    return NextResponse.json({ buying, salesReceived: sales });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed to load." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { date?: string; supplier?: string; description?: string; amount?: number; included?: boolean } | null;
  if (!body || typeof body.amount !== "number" || body.amount <= 0) {
    return NextResponse.json({ error: "A positive amount is required." }, { status: 400 });
  }
  try {
    const session = await auth().catch(() => null);
    const who = session?.user?.name || session?.user?.email || "owner";
    const b = await addBuying({ ...body, amount: body.amount, createdBy: who });
    await audit("buying.add", { detail: `£${b.amount.toFixed(2)}${b.supplier ? ` · ${b.supplier}` : ""}` });
    return NextResponse.json({ ok: true, buying: b });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed to add." }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: string; included?: boolean } | null;
  if (!body?.id || typeof body.included !== "boolean") return NextResponse.json({ error: "id and included required." }, { status: 400 });
  try {
    await setBuyingIncluded(body.id, body.included);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  try {
    await deleteBuying(id);
    await audit("buying.delete", { detail: `Deleted buying ${id}` });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}
