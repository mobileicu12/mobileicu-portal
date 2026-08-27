import { NextResponse } from "next/server";
import { buildBackupSnapshot, backupFilename } from "@/lib/backup-snapshot";
import { uploadTextToDrive, driveConfigured } from "@/lib/google-drive";
import { loadBusiness } from "@/lib/business";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily off-site backup to Google Drive.
 *
 * Authorised like the digest cron: a CRON_SECRET bearer (how Vercel Cron calls
 * it), the vercel-cron agent when no secret is set, or a signed-in owner using
 * the "Back up now" button. Each firing writes one dated JSON snapshot into a
 * "<Business> Backups" folder in the owner's Drive and prunes to the last 90.
 */
async function authorised(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
  } else if ((req.headers.get("user-agent") || "").toLowerCase().includes("vercel-cron")) {
    return true;
  }
  return isOwnerRequest();
}

async function handle(req: Request) {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!driveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive backup is not configured. Set GOOGLE_DRIVE_REFRESH_TOKEN." },
      { status: 503 },
    );
  }
  try {
    const biz = await loadBusiness();
    const snapshot = await buildBackupSnapshot();
    const file = await uploadTextToDrive({
      // Each site backs up to its own folder, so both can share one Drive.
      folderName: `${biz.name} Backups`,
      filename: backupFilename(biz.name),
      content: JSON.stringify(snapshot),
      mimeType: "application/json",
      keep: 14, // last 14 daily: yesterday + a weekly + a ~14-day-old
    });
    return NextResponse.json({ ok: true, file: file.name, link: file.link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed." },
      { status: 500 },
    );
  }
}

// GET is the scheduled entry point; POST is the owner's "Back up now" button.
export const GET = (req: Request) => handle(req);
export const POST = (req: Request) => handle(req);
