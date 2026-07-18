// Full NextAuth (Node runtime) — used by the API route + server components.
// Supports Google sign-in AND owner-issued ID (email) + password for teammates.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { isAuthorizedEmail, isOwner, getPortalUser, permsFor, verifyPortalPassword, ALL_PERMS } from "@/lib/portal-users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Portal ID",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      authorize: async (creds) => {
        const email = String(creds?.email || "").trim().toLowerCase();
        const password = String(creds?.password || "");
        const u = await verifyPortalPassword(email, password).catch(() => null);
        if (!u) return null;
        return { id: email, email, name: u.name || email.split("@")[0] };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Only owner + invited teammates may sign in (credentials are already verified above).
      try {
        return await isAuthorizedEmail(user.email);
      } catch {
        return false;
      }
    },
    // Bake role + feature permissions into the JWT at sign-in so middleware (edge)
    // can gate pages without hitting Shopify on every request.
    async jwt({ token, user, trigger }) {
      const email = (user?.email || (token.email as string | undefined) || "").toLowerCase();
      if (email && (user || trigger === "signIn" || trigger === "update" || !token.role)) {
        token.email = email;
        if (isOwner(email)) {
          token.role = "owner";
          token.perms = ALL_PERMS;
        } else {
          token.role = "member";
          try {
            token.perms = permsFor(await getPortalUser(email));
          } catch {
            token.perms = token.perms ?? [];
          }
        }
      }
      return token;
    },
  },
});
