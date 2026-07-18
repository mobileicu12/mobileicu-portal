import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { listInvoices, summarizeByStaff } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ byStaff: [] });
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }
  try {
    const invoices = await listInvoices();
    return NextResponse.json({ byStaff: summarizeByStaff(invoices) });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load report.";
    return NextResponse.json({ error: msg, byStaff: [] }, { status: 502 });
  }
}
