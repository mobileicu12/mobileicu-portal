import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup-run";
import { driveConfigured } from "@/lib/google-drive";
import { emailConfigured } from "@/lib/email";
import { isOwnerRequest } from "@/lib/guard";
import { shopifyConfigured } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The nightly backup (vercel.json fires this at 22:00 UTC).
 *
 * The path still says "drive" because that is what the deployed cron schedule
 * points at; the run itself now writes to every destination that is set up, so
 * one dead credential no longer means no backup at all.
 *
 * Authorised like the digest cron: a CRON_SECRET bearer (how Vercel Cron calls
 * it), the vercel-cron agent when no secret is set, or a signed-in owner using
 * the "Back up now" button.
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
  // Only refuse outright when there is nowhere at all to put the file. If Drive
  // is broken but email works, the run must still happen — that is the whole
  // point of having two.
  if (!driveConfigured() && !emailConfigured()) {
    return NextResponse.json(
      {
        error:
          "Nowhere to send the backup. Connect Google Drive (GOOGLE_DRIVE_REFRESH_TOKEN) or email (RESEND_API_KEY).",
      },
      { status: 503 },
    );
  }

  const trigger = (await isOwnerRequest()) ? "manual" : "cron";
  const run = await runBackup(trigger);
  // OK means the file landed somewhere, not that everything worked — the body
  // lists each destination with its reason, so "Back up now" can show a partial
  // success as a partial success.
  return NextResponse.json(run, { status: run.ok ? 200 : 500 });
}

// GET is the scheduled entry point; POST is the owner's "Back up now" button.
export const GET = (req: Request) => handle(req);
export const POST = (req: Request) => handle(req);
