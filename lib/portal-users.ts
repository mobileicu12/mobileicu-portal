// Portal access control: owner + invited teammates. Stored in a shop metafield.
import { adminGraphQL, ShopifyError } from "./shopify";

export type PortalUser = { email: string; role: "owner" | "member"; addedAt: string };

export const OWNER_EMAIL = (process.env.PORTAL_OWNER_EMAIL || "mobileicu12@gmail.com").toLowerCase();
const NS = "portal";
const KEY = "users";

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

export async function getPortalUsers(): Promise<PortalUser[]> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query { shop { metafield(namespace: "${NS}", key: "${KEY}") { value } } }`,
  );
  let list: PortalUser[] = [];
  if (d.shop.metafield?.value) {
    try { const a = JSON.parse(d.shop.metafield.value); if (Array.isArray(a)) list = a; } catch { /* ignore */ }
  }
  if (!list.some((u) => u.email.toLowerCase() === OWNER_EMAIL)) {
    list = [{ email: OWNER_EMAIL, role: "owner", addedAt: "" }, ...list];
  }
  return list.map((u) => ({ ...u, role: u.email.toLowerCase() === OWNER_EMAIL ? "owner" : "member" }));
}

export async function isAuthorizedEmail(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const e = email.toLowerCase();
  if (e === OWNER_EMAIL) return true;
  try {
    return (await getPortalUsers()).some((u) => u.email.toLowerCase() === e);
  } catch {
    return false;
  }
}

export function isOwner(email?: string | null): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL;
}

async function save(users: PortalUser[]): Promise<void> {
  const ownerId = await shopGid();
  const clean = users.filter((u) => u.email.toLowerCase() !== OWNER_EMAIL);
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key: KEY, type: "json", value: JSON.stringify(clean) }] },
  );
  if (res.metafieldsSet.userErrors.length) throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
}

export async function addPortalUser(email: string): Promise<PortalUser[]> {
  const e = email.trim().toLowerCase();
  if (!e.includes("@") || e.length < 5) throw new ShopifyError("Enter a valid email address.");
  const users = await getPortalUsers();
  if (!users.some((u) => u.email.toLowerCase() === e)) users.push({ email: e, role: "member", addedAt: new Date().toISOString() });
  await save(users);
  return getPortalUsers();
}

export async function removePortalUser(email: string): Promise<PortalUser[]> {
  const e = email.trim().toLowerCase();
  if (e === OWNER_EMAIL) throw new ShopifyError("You can't remove the owner.");
  const users = (await getPortalUsers()).filter((u) => u.email.toLowerCase() !== e);
  await save(users);
  return getPortalUsers();
}
