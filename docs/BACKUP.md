# Backup and restore

One setup, then it runs itself. Every night at ~22:00 UTC (`vercel.json` →
`/api/cron/backup-drive`) the portal builds one snapshot of everything and sends
it to every destination that is configured.

## What is in a snapshot

| Part | Where it normally lives | Why it's in the file |
| --- | --- | --- |
| Products, collections | Shopify | Re-importable from Excel; here as a reference copy |
| Customers — **all of them**, paged | Shopify | With their ledger, opening balance, trade code, company |
| Invoices, including the deleted bin | Shopify draft orders | With payments, methods and invoice numbers |
| Orders | Shopify | Compact list |
| Settings | shop metafield | |
| **Shop records** — cash-ups, expenses, settlements, till counts, staff accounts and permissions, attendance, audit log, invoice counter, import history | shop metafields, `portal` namespace | **These exist nowhere else.** Lose them and they are gone |

The shop records are copied by dumping the whole `portal` metafield namespace
(`lib/shop-metafields.ts`), not by naming each one. Anything a future feature
stores there is backed up from the day it starts writing, without anyone
remembering to add it here.

Two deliberate exclusions:

- **`import_stage_*`** — a spreadsheet parked mid-import; scratch, swept after 24h.
- **`import_run_<id>_<from>`** — the before-images that let an import be undone.
  Useful for days, megabytes in size, not a business record. The `import_runs`
  index itself *is* kept, so the history of what was imported and when survives.

The WhatsApp API token is **redacted**: a backup file must never be a way to hand
someone the shop's messaging account. Staff password hashes are kept (salted
scrypt) — a restore that can't restore logins isn't a restore.

## Destinations

Two, on purpose, because they fail for unrelated reasons.

### 1. Google Drive

A dated JSON file in a `<Business> Backups` folder, last 14 kept. Uses the
`drive.file` scope, so the app can only ever see files it created itself — never
the rest of the owner's Drive.

Environment: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` (both fall
back to `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`), `GOOGLE_DRIVE_REFRESH_TOKEN`.

> ### Why Drive kept dying every week — and the one-time fix
>
> A refresh token issued by a Google Cloud project whose **OAuth consent screen
> is still in "Testing" expires after 7 days.** That is the weekly
> re-authorisation. Google reports it afterwards as `invalid_grant`, which
> explains nothing, so the portal now rewrites that error to say this.
>
> **Fix it once:** Google Cloud console → *APIs & Services* → *OAuth consent
> screen* → set **Publishing status** to **In production**, then generate the
> refresh token one more time with the same client id/secret. The `drive.file`
> scope is not a sensitive scope, so this needs no Google review and takes effect
> immediately. Tokens then last until they are explicitly revoked.

### 2. Email

The same snapshot, gzipped (usually ~10× smaller) and attached to an email to the
owner address in Settings. Needs only `RESEND_API_KEY`, which does not expire,
and which the daily digest already uses — so if it breaks, the shop notices the
same evening. Skipped, with a reason, if the compressed file is over 12MB.

Neither destination is required for the other to run: if Drive is dead, the
email still goes, and the run is still recorded.

## Knowing it worked

Every run — success or failure — is written to the `portal.backup_log` shop
metafield (last 40) with its size, counts, duration, and the result of each
destination. Settings → *Backup & restore* shows how long ago a file last landed
and where last night's went. A run that saves **nowhere** emails the owner that
evening (once a day, not per retry).

`GET /api/backup/status` (owner only) returns the same thing as JSON:
`ageHours`, `stale` (nothing good in 26h), `critical` (72h), and the last 14 runs.

## Restoring

Settings → *Backup & restore* → *Restore from backup…*, or
`POST /api/restore` with the snapshot as the body. It overwrites, in place:

- settings
- every customer's ledger and opening balance, matched by id
- the shop records listed above, byte for byte

It **creates and deletes nothing** — products, customers and orders are recovered
the normal Shopify way, and recreating them from a file would duplicate live
records. `integrations` is never written back, because the redacted token would
overwrite a working one.

A manual copy is always available at `GET /api/backup` (owner only), which is the
same snapshot as a download.
