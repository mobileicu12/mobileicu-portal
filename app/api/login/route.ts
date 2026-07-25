import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Constant-time string compare so login timing can't leak the password.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as {
    password?: string;
  };

  const expected = process.env.PORTAL_PASSWORD;
  const secret = process.env.PORTAL_SESSION_SECRET;

  if (!expected || !secret) {
    return NextResponse.json(
      { ok: false, error: "Portal password not configured on the server." },
      { status: 500 },
    );
  }

  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("mi_session", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("mi_session", "", { path: "/", maxAge: 0 });
  return res;
}
