import { NextResponse } from "next/server";

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

  if (!password || password !== expected) {
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
