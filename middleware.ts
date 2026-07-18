import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// Public: login, auth endpoints, the storefront, and their data APIs.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/auth", "/api/me", "/shop", "/api/shop", "/no-access"];

// Page prefix -> feature permission required. Anything not listed is open to any
// signed-in teammate (e.g. Dashboard, Add product, Import/Export, Channels, Account).
const GATE: { prefix: string; perm: string }[] = [
  { prefix: "/inventory", perm: "inventory" },
  { prefix: "/collections", perm: "collections" },
  { prefix: "/customers", perm: "customers" },
  { prefix: "/billing", perm: "billing" },
  { prefix: "/invoices", perm: "invoices" },
  { prefix: "/orders", perm: "orders" },
  { prefix: "/reports", perm: "reports" },
  { prefix: "/settings", perm: "settings" },
  { prefix: "/users", perm: "users" },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const email = req.auth?.user?.email;
  const role = req.auth?.user?.role;
  const perms = req.auth?.user?.permissions ?? [];

  // 1) Signed-in via Google or ID+password
  if (email) {
    if (role === "owner") return NextResponse.next();
    // Legacy members (no perms baked yet) get full access until they re-login.
    const gate = GATE.find((g) => pathname === g.prefix || pathname.startsWith(g.prefix + "/"));
    if (gate && perms.length > 0 && !(perms as string[]).includes(gate.perm)) {
      const url = req.nextUrl.clone();
      url.pathname = "/no-access";
      url.searchParams.set("feature", gate.perm);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 2) Legacy master-password session (fallback so you're never locked out) — full access
  const session = req.cookies.get("mi_session")?.value;
  const secret = process.env.PORTAL_SESSION_SECRET;
  if (session && secret && session === secret) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
