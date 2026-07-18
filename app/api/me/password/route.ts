import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { changeOwnPassword } from "@/lib/portal-users";
import { ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// Self-service: a signed-in teammate changes their own password.
export async function POST(req: Request) {
  const session = await auth().catch(() => null);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Sign in with your ID or Google first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { oldPassword?: string; newPassword?: string };
  if (!body.newPassword) return NextResponse.json({ error: "New password required." }, { status: 400 });
  try {
    await changeOwnPassword(email, body.oldPassword || "", body.newPassword);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to change password.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
