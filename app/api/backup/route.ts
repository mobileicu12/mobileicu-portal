import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { getSettings, getIntegrations } from "@/lib/settings";
import { getAllProductsForExport, getCollectionsDetailed } from "@/lib/products";
import { listCustomers, getCustomer } from "@/lib/customers";
import { listInvoices } from "@/lib/billing";
import { mapLimit } from "@/lib/async";

export const runtime = "nodejs";
export const maxDuration = 300;

// Full owner backup: a single JSON snapshot of everything that matters — including
// the customer ledgers / opening balances that live only in metafields (not in
// Shopify's native data), so nothing important is lost if something goes wrong.
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  try {
    const [settings, integrations, products, collections, customerList, invoices] = await Promise.all([
      getSettings(),
      getIntegrations(),
      getAllProductsForExport(),
      getCollectionsDetailed(),
      listCustomers(),
      listInvoices(),
    ]);

    // Pull each customer's full detail (ledger, opening balance, invoices) — capped
    // to stay within the request budget on very large customer bases.
    const CAP = 500;
    const detailed = await mapLimit(customerList.slice(0, CAP), 4, (c) =>
      getCustomer(c.id).catch(() => ({ ...c, _detailError: true })),
    );

    const backup = {
      app: "mobileicu-portal",
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: { products: products.length, collections: collections.length, customers: detailed.length, invoices: invoices.length },
      settings,
      // token redacted even from the backup file; phone-id/template kept for reference.
      integrations: { whatsappPhoneId: integrations.whatsappPhoneId, whatsappTemplate: integrations.whatsappTemplate, whatsappTokenSet: !!integrations.whatsappToken },
      products,
      collections,
      customers: detailed,
      invoices,
      truncated: customerList.length > CAP ? { customers: customerList.length - CAP } : null,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="mobileicu-backup-${stamp}.json"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Backup failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
