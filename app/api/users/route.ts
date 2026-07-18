import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getPublicUsers,
  addPortalUser,
  updatePortalUser,
  removePortalUser,
  type PermKey,
} from "@/lib/portal-users";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

async function ownerGuard() {
  return { ok: await isOwnerRequest() };
}

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ users: [], canManage: false });
  const session = await auth().catch(() => null);
  try {
    return NextResponse.json({
      users: await getPublicUsers(),
      canManage: await isOwnerRequest(),
      me: session?.user?.email ?? null,
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load users.";
    return NextResponse.json({ error: msg, users: [], canManage: false }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { ok } = await ownerGuard();
  if (!ok) return NextResponse.json({ error: "Only the owner can add teammates (sign in as the owner)." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; phone?: string; password?: string; permissions?: PermKey[] };
  if (!body.email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  try {
    return NextResponse.json({ users: await addPortalUser({ email: body.email, name: body.name, phone: body.phone, password: body.password, permissions: body.permissions }) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to add.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const { ok } = await ownerGuard();
  if (!ok) return NextResponse.json({ error: "Only the owner can change teammate access." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { email?: string; newEmail?: string; name?: string; phone?: string; permissions?: PermKey[]; password?: string | null };
  if (!body.email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  try {
    return NextResponse.json({ users: await updatePortalUser(body.email, { email: body.newEmail, name: body.name, phone: body.phone, permissions: body.permissions, password: body.password }) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to update.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { ok } = await ownerGuard();
  if (!ok) return NextResponse.json({ error: "Only the owner can remove teammates." }, { status: 403 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });
  try {
    return NextResponse.json({ users: await removePortalUser(email) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to remove.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
