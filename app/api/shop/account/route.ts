import { NextResponse } from "next/server";
import { getTradeCustomerId } from "@/lib/trade";
import { getCustomer, updateCustomer } from "@/lib/customers";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

// The logged-in trade customer's own account (profile + balance + recent orders).
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ account: null });
  const id = await getTradeCustomerId();
  if (!id) return NextResponse.json({ account: null }, { status: 401 });
  try {
    const c = await getCustomer(id);
    const invoiceDue = c.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
    const ledgerPaid = c.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, (c.openingBalance || 0) + invoiceDue - ledgerPaid);
    return NextResponse.json({
      account: {
        firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company,
        outstanding,
        orders: c.invoices.slice(0, 20).map((i) => ({ name: i.name, status: i.status, total: i.total, balance: i.balance, createdAt: i.createdAt })),
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load account.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// Update own profile (name / email / phone / company).
export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const id = await getTradeCustomerId();
  if (!id) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { firstName?: string; lastName?: string; email?: string; phone?: string; company?: string } | null;
  if (!b) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (b.email !== undefined && b.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  try {
    await updateCustomer(id, {
      firstName: b.firstName?.trim(),
      lastName: b.lastName?.trim(),
      email: b.email?.trim(),
      phone: b.phone?.trim(),
      company: b.company?.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't save your details.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
