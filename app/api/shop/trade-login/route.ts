import { NextResponse } from "next/server";
import { verifyTradeLogin } from "@/lib/customers";
import { signTrade, TRADE_COOKIE } from "@/lib/trade";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { email?: string; code?: string } | null;
  if (!body?.email || !body?.code) return NextResponse.json({ error: "Enter your email and trade code." }, { status: 400 });
  try {
    const customerId = await verifyTradeLogin(body.email, body.code);
    if (!customerId) return NextResponse.json({ error: "Invalid details, or your trade account isn't approved yet." }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(TRADE_COOKIE, signTrade(customerId), {
      httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
