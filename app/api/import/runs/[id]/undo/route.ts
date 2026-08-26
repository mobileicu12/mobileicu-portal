import { NextResponse } from "next/server";
import { undoRun, getRunForDisplay } from "@/lib/import-runs";
import { audit } from "@/lib/audit";
import { requirePermission, isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST /api/import/runs/<id>/undo
//
// Owner only. Undo deletes the products the import created and overwrites the
// ones it changed with their state from import time — so anything edited since
// is lost. That is a bigger hammer than any single-record action in the portal,
// which is why it sits behind the same ownership gate as deleting an invoice.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!(await isOwnerRequest())) {
    return NextResponse.json({ error: "Only the owner can undo an import." }, { status: 403 });
  }
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });

  const { id } = await params;
  const before = await getRunForDisplay(id).catch(() => null);
  try {
    const undone = await undoRun(id);
    await audit("import.undo", {
      ref: id,
      name: before?.filename || id,
      detail: `${undone.restored} restored, ${undone.deleted} deleted${undone.failed ? `, ${undone.failed} failed` : ""}`,
    });
    return NextResponse.json({ ok: true, undone });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Undo failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
