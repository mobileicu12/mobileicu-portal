import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { auth } from "@/auth";
import { getPortalUser, verifyPortalPassword, OWNER_EMAIL } from "@/lib/portal-users";
import { tapIn, tapOut, listToday, readAttendance, openRecord } from "@/lib/attendance";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export const TAPIN_COOKIE = "mi_tapin";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Seconds until the next auto tap-out (20:30 UTC ≈ 21:30 UK).
function secondsUntilAutoTapout(): number {
  const now = new Date();
  const t = new Date(now);
  t.setUTCHours(20, 30, 0, 0);
  if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
  return Math.max(60, Math.floor((t.getTime() - now.getTime()) / 1000));
}

async function whoAmI(): Promise<{ email: string; name?: string } | null> {
  const session = await auth().catch(() => null);
  const email = session?.user?.email?.toLowerCase();
  if (email) {
    const u = await getPortalUser(email).catch(() => null);
    return { email, name: u?.name || (session?.user?.name ?? undefined) };
  }
  // Master-password session → treat as owner.
  return { email: OWNER_EMAIL, name: "Owner" };
}

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ today: [], me: null });
  const me = await whoAmI();
  try {
    const today = await listToday();
    const open = me ? !!openRecord(await readAttendance(), me.email) : false;
    return NextResponse.json({ today, me: me ? { email: me.email, tappedIn: open } : null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const me = await whoAmI();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: "in" | "out"; password?: string } | null;
  if (!body?.action) return NextResponse.json({ error: "Missing action." }, { status: 400 });

  try {
    if (body.action === "out") {
      await tapOut(me.email);
      const res = NextResponse.json({ ok: true, tappedIn: false });
      res.cookies.set(TAPIN_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    // Tap in — re-verify the user's password (their own, or the master password).
    const pw = body.password || "";
    const master = process.env.PORTAL_PASSWORD;
    const ownPw = await verifyPortalPassword(me.email, pw).catch(() => null);
    const ok = !!ownPw || (!!master && safeEqual(pw, master));
    if (!ok) return NextResponse.json({ error: "Incorrect password." }, { status: 401 });

    await tapIn(me.email, me.name);
    const res = NextResponse.json({ ok: true, tappedIn: true });
    res.cookies.set(TAPIN_COOKIE, new Date().toISOString().slice(0, 10), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      maxAge: secondsUntilAutoTapout(),
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof ShopifyError ? e.message : "Failed." }, { status: 502 });
  }
}
