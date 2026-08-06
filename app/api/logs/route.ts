import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/guard";
import { readAudit } from "@/lib/audit";
import { listDeletedInvoices } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

// The audit trail plus the recoverable-deletions bin. Gated on "logs" so it can
// be granted without handing over Settings; the owner always has it.
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["logs"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ entries: [], deleted: [] });
  const months = Math.min(12, Math.max(1, Number(new URL(req.url).searchParams.get("months")) || 3));
  try {
    const [entries, deleted] = await Promise.all([
      readAudit(months),
      listDeletedInvoices().catch(() => []),
    ]);
    return NextResponse.json({ entries, deleted });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to load the log.";
    return NextResponse.json({ error: msg, entries: [], deleted: [] }, { status: 502 });
  }
}
