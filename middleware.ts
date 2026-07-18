import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "./auth.config";

const { auth } = NextAuth(authConfig);

// Public: login, auth endpoints, the storefront, and their data APIs.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/auth", "/shop", "/api/shop"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // 1) Google session (owner or invited teammate)
  if (req.auth?.user?.email) return NextResponse.next();

  // 2) Legacy password session (fallback so you're never locked out)
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
