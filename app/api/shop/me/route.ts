import { NextResponse } from "next/server";
import { getTradeCustomerId } from "@/lib/trade";
import { adminGraphQL, shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";

// Basic info about the logged-in trade customer, for the on-site checkout page.
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ customer: null });
  const id = await getTradeCustomerId();
  if (!id) return NextResponse.json({ customer: null });
  try {
    const d = await adminGraphQL<{ customer: { displayName: string | null; email: string | null; phone: string | null; defaultAddress: { company: string | null } | null } | null }>(
      `query($id: ID!) { customer(id: $id) { displayName email phone defaultAddress { company } } }`,
      { id },
    );
    const c = d.customer;
    return NextResponse.json({ customer: c ? { name: c.displayName || "", email: c.email || "", phone: c.phone || "", company: c.defaultAddress?.company || "" } : null });
  } catch {
    return NextResponse.json({ customer: null });
  }
}
