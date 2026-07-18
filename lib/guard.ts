// Server-side feature-permission guard for API routes.
// Returns null when allowed, or a 401/403 NextResponse when blocked.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getPortalUser, permsFor, isOwner, type PermKey } from "@/lib/portal-users";

// True when the request is the owner (Google/ID) OR the master-password admin fallback.
export async function isOwnerRequest(): Promise<boolean> {
  const session = await auth().catch(() => null);
  if (isOwner(session?.user?.email)) return true;
  const c = await cookies();
  const s = c.get("mi_session")?.value;
  return !!(s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET);
}

export async function requirePermission(perm: PermKey): Promise<NextResponse | null> {
  const session = await auth().catch(() => null);
  const email = session?.user?.email;

  if (email) {
    if (isOwner(email)) return null;
    try {
      const perms = permsFor(await getPortalUser(email));
      if (perms.includes(perm)) return null;
    } catch {
      /* fall through to deny */
    }
    return NextResponse.json({ error: `You don't have access to ${perm}.` }, { status: 403 });
  }

  // Master-password session → full access.
  const c = await cookies();
  const s = c.get("mi_session")?.value;
  if (s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET) return null;

  return NextResponse.json({ error: "Sign in first." }, { status: 401 });
}
