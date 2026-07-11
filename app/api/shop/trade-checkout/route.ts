import { NextResponse } from "next/server";
import { getTradeCustomerId } from "@/lib/trade";
import { createTradeCheckout } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const customerId = await getTradeCustomerId();
  if (!customerId) return NextResponse.json({ error: "Trade session expired. Please log in again." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { lines?: { variantId: string; quantity: number; unitPrice: number }[] } | null;
  if (!body?.lines?.length) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  try {
    const { invoiceUrl } = await createTradeCheckout(customerId, body.lines);
    return NextResponse.json({ ok: true, invoiceUrl });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Checkout failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
