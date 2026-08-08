import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getPortalUser, permsFor, isOwner, ALL_PERMS } from "@/lib/portal-users";
import { financeStatusFor } from "@/lib/finance-access";

export const runtime = "nodejs";

// Current signed-in identity + LIVE feature permissions (used to render the nav).
// Owners always see finance; members see it only during an owner-approved window.
export async function GET() {
  const session = await auth().catch(() => null);
  const email = session?.user?.email;

  if (email) {
    if (isOwner(email)) {
      return NextResponse.json({ email, name: "Owner", role: "owner", permissions: ALL_PERMS, auth: "session", canSeeFinance: true, financeExpiresAt: null, financePending: false });
    }
    let name = email.split("@")[0];
    let permissions = [] as ReturnType<typeof permsFor>;
    try {
      const u = await getPortalUser(email);
      name = u?.name || name;
      permissions = permsFor(u);
    } catch { /* keep defaults */ }
    let fin = { visible: false, expiresAt: null as string | null, pending: false };
    try { fin = await financeStatusFor(email); } catch { /* hidden on error */ }
    return NextResponse.json({ email, name, role: "member", permissions, auth: "session", canSeeFinance: fin.visible, financeExpiresAt: fin.expiresAt, financePending: fin.pending });
  }

  // Legacy master-password session → full access, no named user.
  const c = await cookies();
  const s = c.get("mi_session")?.value;
  if (s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET) {
    return NextResponse.json({ email: null, name: "Portal admin", role: "owner", permissions: ALL_PERMS, auth: "password", canSeeFinance: true, financeExpiresAt: null, financePending: false });
  }

  return NextResponse.json({ email: null, role: null, permissions: [], auth: null, canSeeFinance: false, financeExpiresAt: null, financePending: false }, { status: 401 });
}
