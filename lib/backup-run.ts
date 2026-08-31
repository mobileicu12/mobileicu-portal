// One nightly backup run: build the snapshot, send it everywhere that will take
// it, write the result down, and shout if it didn't land anywhere.
//
// Why more than one destination:
//
// Google Drive is the nicest place for these files, but it hangs on an OAuth
// refresh token, and a refresh token issued by a Google Cloud project whose
// consent screen is still in "Testing" **expires after 7 days**. That is the
// weekly re-authorisation this shop kept having to do, and it's a setting in the
// Google console, not something code can fix from here — publishing the app to
// "In production" stops it (the drive.file scope this uses needs no Google
// review, so publishing is instant). Until someone does that, or on the day the
// token is revoked for any other reason, Drive silently stops accepting files.
//
// So Drive is no longer the only copy. Email is the second destination: the
// Resend key is already in use for the daily digest, it does not expire, the
// file lands in an inbox that is kept forever, and if email breaks the shop
// notices the same evening because the digest stops too. A backup with two
// unrelated ways to fail is one that keeps working while one of them is broken.

import { gzipSync } from "node:zlib";
import { buildBackupSnapshot, backupFilename } from "./backup-snapshot";
import { uploadTextToDrive, driveConfigured } from "./google-drive";
import { loadBusiness } from "./business";
import { getSettings } from "./settings";
import { sendEmail, emailConfigured } from "./email";
import { recordBackupRun, readBackupLog, healthFrom, type BackupRun, type DestinationResult } from "./backup-log";

/** Resend caps a message at 40MB, and base64 adds a third. Stay well under. */
const MAX_EMAIL_BYTES = 12 * 1024 * 1024;
/** Keep this many dated files in Drive — a fortnight of daily snapshots. */
const DRIVE_KEEP = 14;

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ownerEmail(settings: { digestOwnerEmail: string; email: string }): string {
  return (settings.digestOwnerEmail || settings.email || "").trim();
}

/**
 * Google's own wording for an expired-or-revoked refresh token is `invalid_grant`,
 * which tells the owner nothing. Say what actually causes it here, because it is
 * almost always the same thing and the fix is one checkbox away.
 */
function explain(detail: string): string {
  if (/invalid_grant/i.test(detail)) {
    return `${detail}\n\nThis is nearly always the Google project's consent screen still being in "Testing", which makes every refresh token expire after 7 days. In the Google Cloud console → APIs & Services → OAuth consent screen, set the publishing status to "In production" and generate the token once more. The drive.file scope needs no Google review, so this takes effect immediately and the token then stops expiring.`;
  }
  return detail;
}

async function toDrive(content: string, bizName: string): Promise<DestinationResult> {
  try {
    const file = await uploadTextToDrive({
      // Each site backs up to its own folder, so several can share one Drive.
      folderName: `${bizName} Backups`,
      filename: backupFilename(bizName),
      content,
      mimeType: "application/json",
      keep: DRIVE_KEEP,
    });
    return { name: "Google Drive", ok: true, detail: file.link || file.name };
  } catch (e) {
    return { name: "Google Drive", ok: false, detail: explain(reason(e)) };
  }
}

async function toEmail(content: string, bizName: string, to: string, counts: Record<string, number>): Promise<DestinationResult> {
  try {
    // Gzipped, because the raw JSON is mostly repeated field names — it usually
    // comes down by a factor of ten, which is the difference between a file that
    // emails and one that doesn't.
    const gz = gzipSync(Buffer.from(content, "utf8"));
    if (gz.length > MAX_EMAIL_BYTES) {
      return {
        name: "Email",
        ok: false,
        detail: `The backup is ${(gz.length / 1048576).toFixed(1)}MB compressed — too large to email. Google Drive holds the full copy.`,
      };
    }
    const rows = Object.entries(counts)
      .map(([k, v]) => `<tr><td style="padding:2px 10px 2px 0">${k}</td><td><strong>${v}</strong></td></tr>`)
      .join("");
    await sendEmail({
      to,
      subject: `${bizName} backup — ${new Date().toISOString().slice(0, 10)}`,
      html: `<p>Attached is tonight's full portal backup (gzipped JSON).</p>
             <table style="font:14px system-ui;border-collapse:collapse">${rows}</table>
             <p style="color:#666;font-size:12px">Keep this email. To put the data back, download the attachment, unzip it, and use Settings → Backup &amp; restore in the portal.</p>`,
      attachments: [{ filename: backupFilename(bizName, "json.gz"), content: gz.toString("base64") }],
    });
    return { name: "Email", ok: true, detail: `${to} (${(gz.length / 1048576).toFixed(1)}MB)` };
  } catch (e) {
    return { name: "Email", ok: false, detail: reason(e) };
  }
}

/** Tell the owner a run landed nowhere — but only once a day, not every retry. */
async function alertFailure(to: string, bizName: string, destinations: DestinationResult[], error?: string) {
  if (!to || !emailConfigured()) return;
  const log = await readBackupLog().catch(() => [] as BackupRun[]);
  const alreadyToday = log.some(
    (r) => !r.ok && r.at.slice(0, 10) === new Date().toISOString().slice(0, 10),
  );
  if (alreadyToday) return;
  const lines = destinations.map((d) => `<li><strong>${d.name}</strong>: ${d.detail}</li>`).join("");
  await sendEmail({
    to,
    subject: `⚠ ${bizName} backup did NOT run`,
    html: `<p>Tonight's backup did not save anywhere. Until this is fixed there is no fresh copy of the shop's data.</p>
           ${error ? `<p><strong>${error}</strong></p>` : ""}
           <ul>${lines}</ul>
           <p>Open the portal → Settings → Backup &amp; restore to try it by hand.</p>`,
  }).catch(() => { /* the alert failing must never mask the backup failure */ });
}

export type BackupRunResult = BackupRun & { destinationsTried: number };

/**
 * Run a full backup. Never throws: a failed run is a recorded failure, because a
 * backup system that dies quietly is exactly the thing being fixed here.
 */
export async function runBackup(trigger: BackupRun["trigger"]): Promise<BackupRunResult> {
  const started = Date.now();
  const [biz, settings] = await Promise.all([loadBusiness(), getSettings()]);
  const to = ownerEmail(settings);

  let content = "";
  let counts: Record<string, number> = {};
  try {
    const snapshot = await buildBackupSnapshot();
    counts = snapshot.counts;
    content = JSON.stringify(snapshot);
  } catch (e) {
    const run: BackupRun = {
      at: new Date().toISOString(),
      ok: false,
      bytes: 0,
      ms: Date.now() - started,
      trigger,
      counts: {},
      destinations: [],
      error: `Could not read the shop's data: ${reason(e)}`,
    };
    await alertFailure(to, biz.name, [], run.error);
    await recordBackupRun(run).catch(() => {});
    return { ...run, destinationsTried: 0 };
  }

  const destinations: DestinationResult[] = [];
  if (driveConfigured()) destinations.push(await toDrive(content, biz.name));
  else destinations.push({ name: "Google Drive", ok: false, detail: "Not connected — no GOOGLE_DRIVE_REFRESH_TOKEN set." });

  if (emailConfigured() && to) destinations.push(await toEmail(content, biz.name, to, counts));
  else destinations.push({
    name: "Email",
    ok: false,
    detail: emailConfigured() ? "No owner email set in Settings." : "Email isn't set up (no RESEND_API_KEY).",
  });

  const run: BackupRun = {
    at: new Date().toISOString(),
    ok: destinations.some((d) => d.ok),
    bytes: Buffer.byteLength(content),
    ms: Date.now() - started,
    trigger,
    counts,
    destinations,
  };
  if (!run.ok) await alertFailure(to, biz.name, destinations);
  await recordBackupRun(run).catch(() => { /* the run happened even if the note about it didn't */ });
  return { ...run, destinationsTried: destinations.length };
}

/** Is a fresh backup overdue? Used by the portal to nudge and to self-heal. */
export async function backupHealth() {
  return healthFrom(await readBackupLog());
}
