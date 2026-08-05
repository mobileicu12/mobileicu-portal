import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { verifyAccountToken } from "@/lib/invoice-link";
import { buildStatementDoc, statementFilename, type StatementInput } from "@/lib/statement-pdf";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

// Public, token-protected FULL account statement: every bill and every payment
// with a running balance. Rendered server-side so a customer can open it from a
// WhatsApp or email link without an account.
//
// Refuses with 404 rather than 403 on a bad token — customer ids are sequential,
// and a 403 would confirm which ones exist.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  const numId = id.split("/").pop() || id;
  if (!verifyAccountToken(numId, token)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const c = await getCustomer(`gid://shopify/Customer/${numId}`);

    const input: StatementInput = {
      customerName: c.name || c.company || "Customer",
      company: c.company,
      email: c.email,
      phone: c.phone,
      openingBalance: c.openingBalance,
      invoices: c.invoices.map((i) => ({
        name: i.name,
        createdAt: i.createdAt,
        status: i.status,
        total: i.total,
        amountPaid: i.amountPaid,
        balance: i.balance,
        paymentEntries: i.paymentEntries,
      })),
      payments: c.ledger.payments,
    };

    const buf = Buffer.from(buildStatementDoc(input).output("arraybuffer"));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        // inline so it opens in the phone's viewer rather than downloading blind
        "Content-Disposition": `inline; filename="${statementFilename(input)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't build the statement.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
