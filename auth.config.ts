// Edge-safe auth config (used by middleware). No Node-only / Shopify imports here.
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [Google],
  trustHost: true,
  pages: { signIn: "/login" },
} satisfies NextAuthConfig;
