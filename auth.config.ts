// Edge-safe auth config (used by middleware). No Node-only / Shopify imports here.
// The session callback only reshapes the already-decoded JWT, so it is edge-safe.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { PermKey } from "@/lib/permissions";

export default {
  providers: [Google],
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as "owner" | "member") ?? "member";
        session.user.permissions = (token.perms as PermKey[] | undefined) ?? [];
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
