import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isOwnerRequest } from "@/lib/guard";
import { financeStatusFor, requestFinanceAccess } from "@/lib/finance-access";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

// The current user's finance visibility — polled by the client so a fresh grant
// (or its expiry) is picked up without a full reload. Owner is always visible.
export async function GET() {
  if (await isOwnerRequest()) return NextResponse.json({ visible: true, expiresAt: null, pending: false, owner: true });
  const session = await auth().catch(() => null);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ visible: false, expiresAt: null, pending: false }, { status: 401 });
  try {
    return NextResponse.json(await financeStatusFor(email));
  } catch {
    return NextResponse.json({ visible: false, expiresAt: null, pending: false });
  }
}

// Staff asks the owner for a temporary reveal.
export async function POST() {
  if (await isOwnerRequest()) return NextResponse.json({ ok: true, owner: true });
  const session = await auth().catch(() => null);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await requestFinanceAccess(email, session?.user?.name || email.split("@")[0]);
    await audit("finance.access.request", { detail: `${email} requested finance access` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't send the request." }, { status: 502 });
  }
}
