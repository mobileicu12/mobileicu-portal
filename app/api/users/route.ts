import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPortalUsers, addPortalUser, removePortalUser, isOwner } from "@/lib/portal-users";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ users: [], canManage: false });
  const session = await auth();
  try {
    return NextResponse.json({ users: await getPortalUsers(), canManage: isOwner(session?.user?.email), me: session?.user?.email ?? null });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load users.";
    return NextResponse.json({ error: msg, users: [], canManage: false }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "Only the owner can add teammates (sign in with Google as the owner)." }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  try {
    return NextResponse.json({ users: await addPortalUser(email) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to add.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "Only the owner can remove teammates." }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  try {
    return NextResponse.json({ users: await removePortalUser(email) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to remove.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
