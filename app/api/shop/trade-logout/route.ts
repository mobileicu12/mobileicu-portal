import { NextResponse } from "next/server";
import { TRADE_COOKIE } from "@/lib/trade";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRADE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
