// Full NextAuth (Node runtime) — used by the API route. Gates sign-in to authorized emails.
import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { isAuthorizedEmail } from "@/lib/portal-users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    async signIn({ user }) {
      // Only owner + invited teammates may sign in.
      try {
        return await isAuthorizedEmail(user.email);
      } catch {
        return false;
      }
    },
  },
});
