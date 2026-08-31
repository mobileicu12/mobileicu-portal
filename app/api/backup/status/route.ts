import { NextResponse } from "next/server";
import { isOwnerRequest } from "@/lib/guard";
import { driveConfigured } from "@/lib/google-drive";
import { emailConfigured } from "@/lib/email";
import { readBackupLog, healthFrom, STALE_HOURS } from "@/lib/backup-log";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

// Owner-only, side-effect-free: how the backup is set up and when it last worked.
//
// The old drive-status endpoint answered only "are the credentials present?",
// which stays true for weeks after the credentials stop being accepted. What the
// owner needs to know is whether a file actually landed last night.
export async function GET() {
  if (!(await isOwnerRequest())) return NextResponse.json({ error: "Owner only." }, { status: 403 });

  const [log, settings] = await Promise.all([
    readBackupLog().catch(() => []),
    getSettings().catch(() => null),
  ]);
  const health = healthFrom(log);
  const to = (settings?.digestOwnerEmail || settings?.email || "").trim();

  return NextResponse.json({
    destinations: [
      { name: "Google Drive", configured: driveConfigured() },
      { name: "Email", configured: emailConfigured() && !!to, target: to },
    ],
    lastRun: health.lastRun,
    lastGood: health.lastGood,
    ageHours: health.ageHours,
    stale: health.stale,
    critical: health.critical,
    staleAfterHours: STALE_HOURS,
    runs: log.slice(0, 14),
  });
}
