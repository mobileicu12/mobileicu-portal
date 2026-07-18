import type { PermKey } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: "owner" | "member";
      permissions?: PermKey[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string;
    role?: "owner" | "member";
    perms?: PermKey[];
  }
}
