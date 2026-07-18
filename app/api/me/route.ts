import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getPortalUser, permsFor, isOwner, ALL_PERMS } from "@/lib/portal-users";

export const runtime = "nodejs";

// Current signed-in identity + LIVE feature permissions (used to render the nav).
export async function GET() {
  const session = await auth().catch(() => null);
  const email = session?.user?.email;

  if (email) {
    if (isOwner(email)) {
      return NextResponse.json({ email, name: "Owner", role: "owner", permissions: ALL_PERMS, auth: "session" });
    }
    try {
      const u = await getPortalUser(email);
      return NextResponse.json({ email, name: u?.name || email.split("@")[0], role: "member", permissions: permsFor(u), auth: "session" });
    } catch {
      return NextResponse.json({ email, name: email.split("@")[0], role: "member", permissions: [], auth: "session" });
    }
  }

  // Legacy master-password session → full access, no named user.
  const c = await cookies();
  const s = c.get("mi_session")?.value;
  if (s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET) {
    return NextResponse.json({ email: null, name: "Portal admin", role: "owner", permissions: ALL_PERMS, auth: "password" });
  }

  return NextResponse.json({ email: null, role: null, permissions: [], auth: null }, { status: 401 });
}
