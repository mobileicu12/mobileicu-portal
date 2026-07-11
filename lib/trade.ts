// Trade (wholesale) session — a signed cookie proving an approved trade customer.
import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.PORTAL_SESSION_SECRET || "mi-trade-dev-secret";
export const TRADE_COOKIE = "mi_trade";

export function signTrade(customerId: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(customerId).digest("base64url");
  return `${Buffer.from(customerId).toString("base64url")}.${mac}`;
}

export function verifyTradeValue(val: string | undefined | null): string | null {
  if (!val) return null;
  const [b64, mac] = val.split(".");
  if (!b64 || !mac) return null;
  const customerId = Buffer.from(b64, "base64url").toString();
  const expect = crypto.createHmac("sha256", SECRET).update(customerId).digest("base64url");
  try {
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect)) ? customerId : null;
  } catch {
    return null;
  }
}

// Server components / route handlers: returns the trade customer id or null.
export async function getTradeCustomerId(): Promise<string | null> {
  const c = (await cookies()).get(TRADE_COOKIE)?.value;
  return verifyTradeValue(c);
}
