import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// Public paths (no admin login needed): the storefront, auth endpoints, and login.
// "/" is the store homepage (redirects to /shop) and must stay public.
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/auth", "/api/me", "/shop", "/api/shop", "/no-access"];

// Feature gate per portal page prefix. Anything else under /portal is open to any
// signed-in teammate (Dashboard, Add product, Import/Export, Channels).
const GATE: { prefix: string; perm: string }[] = [
  { prefix: "/portal/inventory", perm: "inventory" },
  { prefix: "/portal/collections", perm: "collections" },
  { prefix: "/portal/customers", perm: "customers" },
  { prefix: "/portal/billing", perm: "billing" },
  { prefix: "/portal/invoices", perm: "invoices" },
  { prefix: "/portal/orders", perm: "orders" },
  { prefix: "/portal/reports", perm: "reports" },
  { prefix: "/portal/settings", perm: "settings" },
  { prefix: "/portal/users", perm: "users" },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Store homepage + public storefront pages.
  if (pathname === "/") return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) return NextResponse.next();

  // Everything that needs admin auth (the portal + its data APIs).
  const email = req.auth?.user?.email;
  const role = req.auth?.user?.role;
  const perms = req.auth?.user?.permissions ?? [];

  const authed = !!email || (() => {
    const s = req.cookies.get("mi_session")?.value;
    return !!(s && process.env.PORTAL_SESSION_SECRET && s === process.env.PORTAL_SESSION_SECRET);
  })();

  if (!authed) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Feature-permission gate for members (owner / master-password = full access).
  if (email && role !== "owner") {
    const gate = GATE.find((g) => pathname === g.prefix || pathname.startsWith(g.prefix + "/"));
    if (gate && perms.length > 0 && !(perms as string[]).includes(gate.perm)) {
      const url = req.nextUrl.clone();
      url.pathname = "/no-access";
      url.searchParams.set("feature", gate.perm);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
