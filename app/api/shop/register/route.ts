import { NextResponse } from "next/server";
import { registerCustomer } from "@/lib/customers";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Registration is temporarily unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as {
    firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; note?: string; website?: string;
  } | null;
  // Honeypot: bots fill the hidden "website" field.
  if (!body || body.website) return NextResponse.json({ ok: true });
  if (!body.email?.trim()) return NextResponse.json({ error: "Please enter your email." }, { status: 400 });
  try {
    await registerCustomer({
      firstName: body.firstName, lastName: body.lastName, email: body.email,
      phone: body.phone, company: body.company, note: body.note,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Registration failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
