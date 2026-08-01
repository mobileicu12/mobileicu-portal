import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { buildBackupSnapshot } from "@/lib/backup-snapshot";

export const runtime = "nodejs";
export const maxDuration = 300;

// Full owner backup: a single JSON snapshot of everything that matters — including
// the customer ledgers / opening balances that live only in metafields (not in
// Shopify's native data), so nothing important is lost if something goes wrong.
export async function GET() {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  try {
    const backup = await buildBackupSnapshot();
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
