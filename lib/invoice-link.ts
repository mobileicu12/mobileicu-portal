// Signed capability tokens for public invoice links (shared via WhatsApp).
// The numeric draft-order id is sequential/guessable, so a share link must carry
// an HMAC token — without it the public viewer refuses to load the invoice.
import crypto from "crypto";

const SECRET = process.env.PORTAL_SESSION_SECRET || "mi-invoice-dev-secret";

export function signInvoiceToken(id: string): string {
  return crypto.createHmac("sha256", SECRET).update(`inv:${id}`).digest("base64url");
}

export function verifyInvoiceToken(id: string, token: string | undefined | null): boolean {
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(signInvoiceToken(id)));
  } catch {
    return false;
  }
}

// Relative share path for an invoice (prepend the origin on the client).
export function invoiceSharePath(numericId: string): string {
  return `/i/${numericId}?t=${signInvoiceToken(numericId)}`;
}
