"use client";

import { useEffect, useState, type ChangeEvent } from "react";

type Destination = { name: string; ok: boolean; detail: string };
type Run = {
  at: string;
  ok: boolean;
  bytes: number;
  counts?: Record<string, number>;
  destinations: Destination[];
};
type Status = {
  destinations: { name: string; configured: boolean }[];
  lastRun: Run | null;
  ageHours: number | null;
  stale: boolean;
};

function hoursAgo(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

const COUNT_LABELS: Record<string, string> = {
  products: "products",
  collections: "collections",
  customers: "customers",
  invoices: "invoices",
  deletedInvoices: "deleted invoices",
  orders: "orders",
  shopFields: "shop records (cash-ups, expenses, settlements, staff, attendance, audit…)",
};

export default function BackupsClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch("/api/backup/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => d && setStatus(d))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  async function backupNow() {
    setDriveBusy(true);
    setDriveMsg("");
    try {
      const res = await fetch("/api/cron/backup-drive", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      const dests: Destination[] = d.destinations ?? [];
      if (!res.ok && !dests.length) throw new Error(d.error || "Backup failed.");
      const good = dests.filter((x) => x.ok);
      const bad = dests.filter((x) => !x.ok);
      setDriveMsg(
        (good.length ? `✓ Saved to ${good.map((x) => x.name).join(" and ")}. ` : "Backup did not save anywhere. ") +
          bad.map((x) => `${x.name}: ${x.detail}`).join("  ·  "),
      );
      await load();
    } catch (e) {
      setDriveMsg(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setDriveBusy(false);
    }
  }

  async function restoreBackup(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await file.text());
    } catch {
      setError("That file isn't valid JSON — pick a MOBILE ICU backup file.");
      return;
    }
    const typed = window.prompt(
      "Restore will overwrite, from this backup file:\n" +
        "  • settings\n" +
        "  • every customer's ledger / opening balance\n" +
        "  • cash-ups, expenses, settlements, till counts, staff accounts, attendance and the audit log\n\n" +
        "Products, customers and orders stay in Shopify and are NOT changed. Anything recorded since this backup was taken will be lost.\n\nType RESTORE to confirm:",
    );
    if (typed !== "RESTORE") {
      if (typed !== null) setError("Restore cancelled — you didn't type RESTORE.");
      return;
    }
    setRestoreBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Restore failed.");
      const r = d.restored;
      setMsg(
        `Restored: ${r.customersRestored} customer ledger${r.customersRestored === 1 ? "" : "s"}${r.customersFailed ? `, ${r.customersFailed} skipped (no longer in Shopify)` : ""}${r.settings ? ", settings" : ""}${r.shopFieldsRestored ? `, ${r.shopFieldsRestored} shop record${r.shopFieldsRestored === 1 ? "" : "s"}` : ""}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  }

  const counts = status?.lastRun?.counts;

  return (
    <div className="px-8 py-7 pb-16">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Backup</h1>
        <p className="text-sm text-neutral-500">A full snapshot of everything, automatic every night, plus restore.</p>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</p>}

      <div className="grid max-w-3xl gap-6">
        <Section title="Back up now">
          <p className="text-xs text-neutral-500">
            A full snapshot of everything — products, collections, every customer (with balances &amp; ledgers),
            invoices, orders, and the shop&apos;s own records: cash-ups, expenses, settlements, till counts, staff
            accounts, attendance, audit log and import history.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/backup" className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">
              ⬇ Download full backup (.json)
            </a>
            <button onClick={backupNow} disabled={driveBusy} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
              {driveBusy ? "Backing up…" : "Back up now"}
            </button>
          </div>
          {driveMsg && <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{driveMsg}</p>}
        </Section>

        <Section title="Status & verification">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Automatic nightly backup:</span>
            {status === null ? (
              <span className="text-xs text-neutral-400">checking…</span>
            ) : status.ageHours === null ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15">Never run</span>
            ) : status.stale ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15">
                Last good backup {hoursAgo(status.ageHours)} ago — overdue
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15">
                Backed up {hoursAgo(status.ageHours)} ago
              </span>
            )}
            <button onClick={load} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">↻ Refresh</button>
          </div>

          {/* Verification: exactly what the last backup captured. */}
          {counts ? (
            <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Last backup contained</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.entries(counts).map(([k, v]) => (
                  <li key={k} className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{v}</span>
                    <span className="text-xs text-neutral-500">{COUNT_LABELS[k] ?? k}</span>
                  </li>
                ))}
              </ul>
              {typeof status?.lastRun?.bytes === "number" && (
                <p className="mt-2 text-xs text-neutral-400">
                  File size {(status.lastRun.bytes / 1024 / 1024).toFixed(2)} MB. Cross-check these against your live
                  totals — if they match, everything is captured.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">
              Run a backup (or wait for tonight) to see exactly what it captured.
            </p>
          )}

          {status?.lastRun?.destinations?.length ? (
            <ul className="mt-1 space-y-1">
              {status.lastRun.destinations.map((d) => (
                <li key={d.name} className="text-xs">
                  <span className={d.ok ? "text-emerald-600" : "text-red-600"}>{d.ok ? "✓" : "✗"}</span>{" "}
                  <strong className="text-neutral-700 dark:text-neutral-300">{d.name}</strong>{" "}
                  <span className="text-neutral-500">{d.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs text-neutral-400">
            Runs by itself every night at ~22:00 to every destination that is set up — Cloudflare R2 (keys that never
            expire), a dated file in your Drive folder, and a compressed copy emailed to the owner.
          </p>
        </Section>

        <Section title="Restore from a file">
          <p className="text-xs text-neutral-500">
            Overwrites <strong>settings, every customer&apos;s ledger / opening balance, and the shop&apos;s own
            records</strong> (cash-ups, expenses, settlements, till, staff, attendance, audit log) from the file.
            Products, customers and orders stay in Shopify and are not touched.
          </p>
          <label className="inline-block">
            <input type="file" accept="application/json,.json" className="hidden" onChange={restoreBackup} disabled={restoreBusy} />
            <span className="inline-block cursor-pointer rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100">
              {restoreBusy ? "Restoring…" : "⟲ Restore from backup…"}
            </span>
          </label>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
