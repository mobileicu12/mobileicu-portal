// Portal access control: owner + invited teammates. Stored in a shop metafield.
// Teammates can sign in with Google OR an owner-issued ID (email) + password,
// and the owner grants each teammate access to specific features only.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { adminGraphQL, ShopifyError } from "./shopify";
import { ALL_PERMS, DEFAULT_MEMBER_PERMS, type PermKey } from "./permissions";

export { PERMISSIONS, ALL_PERMS, DEFAULT_MEMBER_PERMS, type PermKey } from "./permissions";

function normPerms(v: unknown): PermKey[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const set = new Set(ALL_PERMS as string[]);
  return v.filter((x): x is PermKey => typeof x === "string" && set.has(x));
}

export type PortalUser = {
  email: string;
  name?: string;
  role: "owner" | "member";
  addedAt: string;
  passwordHash?: string;
  permissions?: PermKey[]; // undefined = full access (legacy members); [] = none
};

// What the browser is allowed to see (no password hash).
export type PublicUser = {
  email: string;
  name: string;
  role: "owner" | "member";
  addedAt: string;
  hasPassword: boolean;
  permissions: PermKey[];
};

export const OWNER_EMAIL = (process.env.PORTAL_OWNER_EMAIL || "mobileicu12@gmail.com").toLowerCase();
const NS = "portal";
const KEY = "users";

// ---- password hashing (scrypt) ------------------------------------------
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function verifyHash(pw: string, stored?: string): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  try {
    const test = scryptSync(pw, salt, 64);
    const orig = Buffer.from(hash, "hex");
    return orig.length === test.length && timingSafeEqual(orig, test);
  } catch {
    return false;
  }
}

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

// Raw list including secrets — server-only.
export async function getPortalUsers(): Promise<PortalUser[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  let list: PortalUser[] = [];
  if (d.shop.metafield?.value) {
    try {
      const a = JSON.parse(d.shop.metafield.value);
      if (Array.isArray(a)) list = a;
    } catch {
      /* ignore */
    }
  }
  list = list
    .filter((u) => u && typeof u.email === "string")
    .map((u) => ({
      email: u.email.toLowerCase(),
      name: typeof u.name === "string" ? u.name : undefined,
      role: "member",
      addedAt: u.addedAt || "",
      passwordHash: typeof u.passwordHash === "string" ? u.passwordHash : undefined,
      permissions: normPerms(u.permissions),
    }));
  if (!list.some((u) => u.email === OWNER_EMAIL)) {
    list = [{ email: OWNER_EMAIL, role: "owner", addedAt: "", permissions: ALL_PERMS }, ...list];
  }
  return list.map((u) => (u.email === OWNER_EMAIL ? { ...u, role: "owner", permissions: ALL_PERMS } : u));
}

export function toPublic(u: PortalUser): PublicUser {
  return {
    email: u.email,
    name: u.name || "",
    role: u.role,
    addedAt: u.addedAt,
    hasPassword: !!u.passwordHash,
    permissions: u.role === "owner" ? ALL_PERMS : u.permissions ?? ALL_PERMS,
  };
}

export async function getPublicUsers(): Promise<PublicUser[]> {
  return (await getPortalUsers()).map(toPublic);
}

export async function getPortalUser(email?: string | null): Promise<PortalUser | null> {
  if (!email) return null;
  const e = email.toLowerCase();
  return (await getPortalUsers()).find((u) => u.email === e) ?? null;
}

export async function isAuthorizedEmail(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase();
  if (e === OWNER_EMAIL) return true;
  try {
    return (await getPortalUsers()).some((u) => u.email === e);
  } catch {
    return false;
  }
}

export function isOwner(email?: string | null): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}

// Resolve a user's effective permissions (owner = all; legacy undefined = all).
export function permsFor(u: PortalUser | null): PermKey[] {
  if (!u) return [];
  if (u.role === "owner") return ALL_PERMS;
  return u.permissions ?? ALL_PERMS;
}

export async function verifyPortalPassword(email: string, password: string): Promise<PortalUser | null> {
  if (!email || !password) return null;
  const u = await getPortalUser(email);
  if (!u || !u.passwordHash) return null;
  return verifyHash(password, u.passwordHash) ? u : null;
}

async function save(users: PortalUser[]): Promise<void> {
  const ownerId = await shopGid();
  const clean = users
    .filter((u) => u.email !== OWNER_EMAIL)
    .map((u) => ({
      email: u.email,
      name: u.name || undefined,
      addedAt: u.addedAt,
      passwordHash: u.passwordHash || undefined,
      permissions: u.permissions, // may be undefined
    }));
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(clean) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export type AddUserInput = { email: string; name?: string; password?: string; permissions?: PermKey[] };

export async function addPortalUser(input: AddUserInput | string): Promise<PublicUser[]> {
  const data: AddUserInput = typeof input === "string" ? { email: input } : input;
  const e = data.email.trim().toLowerCase();
  if (!e.includes("@") || e.length < 5) throw new ShopifyError("Enter a valid email address.");
  if (e === OWNER_EMAIL) throw new ShopifyError("The owner already has full access.");
  if (data.password && data.password.length < 6) throw new ShopifyError("Password must be at least 6 characters.");
  const users = await getPortalUsers();
  const existing = users.find((u) => u.email === e);
  if (existing) {
    if (data.name !== undefined) existing.name = data.name.trim() || undefined;
    if (data.permissions) existing.permissions = normPerms(data.permissions) ?? [];
    if (data.password) existing.passwordHash = hashPassword(data.password);
  } else {
    users.push({
      email: e,
      name: data.name?.trim() || undefined,
      role: "member",
      addedAt: new Date().toISOString(),
      passwordHash: data.password ? hashPassword(data.password) : undefined,
      permissions: normPerms(data.permissions) ?? DEFAULT_MEMBER_PERMS,
    });
  }
  await save(users);
  return getPublicUsers();
}

export type UpdateUserInput = { name?: string; permissions?: PermKey[]; password?: string | null };

export async function updatePortalUser(email: string, patch: UpdateUserInput): Promise<PublicUser[]> {
  const e = email.trim().toLowerCase();
  if (e === OWNER_EMAIL) throw new ShopifyError("The owner's access can't be changed here.");
  const users = await getPortalUsers();
  const u = users.find((x) => x.email === e);
  if (!u) throw new ShopifyError("Teammate not found.");
  if (patch.name !== undefined) u.name = patch.name.trim() || undefined;
  if (patch.permissions !== undefined) u.permissions = normPerms(patch.permissions) ?? [];
  if (patch.password !== undefined) {
    if (patch.password === null || patch.password === "") u.passwordHash = undefined; // revoke password login
    else {
      if (patch.password.length < 6) throw new ShopifyError("Password must be at least 6 characters.");
      u.passwordHash = hashPassword(patch.password);
    }
  }
  await save(users);
  return getPublicUsers();
}

// Self-service: a teammate changes their own password (must know the old one).
export async function changeOwnPassword(email: string, oldPassword: string, newPassword: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (!newPassword || newPassword.length < 6) throw new ShopifyError("New password must be at least 6 characters.");
  const users = await getPortalUsers();
  const u = users.find((x) => x.email === e);
  if (!u) throw new ShopifyError("Account not found.");
  // If they already have a password, verify the old one first.
  if (u.passwordHash && !verifyHash(oldPassword, u.passwordHash)) throw new ShopifyError("Current password is incorrect.");
  u.passwordHash = hashPassword(newPassword);
  await save(users);
}

export async function removePortalUser(email: string): Promise<PublicUser[]> {
  const e = email.trim().toLowerCase();
  if (e === OWNER_EMAIL) throw new ShopifyError("You can't remove the owner.");
  const users = (await getPortalUsers()).filter((u) => u.email !== e);
  await save(users);
  return getPublicUsers();
}
