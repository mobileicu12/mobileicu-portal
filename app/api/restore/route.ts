import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { restoreFromSnapshot, isValidSnapshot } from "@/lib/restore";
import { buildBackupSnapshot } from "@/lib/backup-snapshot";
import { uploadTextToDrive, driveConfigured } from "@/lib/google-drive";
import { loadBusiness } from "@/lib/business";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Owner-only restore of the metafield-held data (settings + customer ledgers /
 * opening balances) from a backup file. Products, customers and orders are NOT
 * touched — they live in Shopify. A pre-restore snapshot of the current state
 * is saved to Drive first (best effort) as an undo point.
 */
export async function POST(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  try {
    const body = await req.json().catch(() => null);
    const snapshot =
      body && typeof body === "object" && "snapshot" in body ? body.snapshot : body;

    if (!isValidSnapshot(snapshot)) {
      return NextResponse.json(
        { error: "That file is not a valid MOBILE ICU backup." },
        { status: 400 },
      );
    }

    let safety: string | null = null;
    if (driveConfigured()) {
      try {
        const biz = await loadBusiness();
        const current = await buildBackupSnapshot();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = await uploadTextToDrive({
          folderName: `${biz.name} Backups`,
          filename: `pre-restore-${stamp}.json`,
          content: JSON.stringify(current),
          mimeType: "application/json",
        });
        safety = file.name;
      } catch {
        /* a failed safety backup must not block a deliberate restore */
      }
    }

    const result = await restoreFromSnapshot(snapshot);
    return NextResponse.json({ ok: true, restored: result, safetyBackup: safety });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Restore failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
