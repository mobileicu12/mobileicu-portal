"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { BRAND_INVOICE_PREFIX } from "@/lib/brand";

type Settings = {
  bizName: string;
  tagline: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  vatNumber: string;
  bank: string;
  invoiceFooter: string;
  invoicePrefix: string;
  vatRate: number;
  lowStock: number;
  faviconUrl: string;
  dailyDigest: boolean;
  digestCustomers: boolean;
  digestOwner: boolean;
  digestOwnerEmail: string;
  digestOwnerPhone: string;
  reportButtonHour: number;
  requireTapIn: boolean;
  financeGrantMinutes: number;
};

type Shift = { email: string; name?: string; tapIn: string; tapOut?: string; open: boolean; autoOut?: boolean; minutes: number };

type BackupDestination = { name: string; ok: boolean; detail: string };
type BackupStatus = {
  destinations: { name: string; configured: boolean; target?: string }[];
  lastRun: { at: string; ok: boolean; bytes: number; destinations: BackupDestination[] } | null;
  ageHours: number | null;
  stale: boolean;
  critical: boolean;
};

function hoursAgo(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // WhatsApp integration (secret token handled separately, never echoed back).
  const [wa, setWa] = useState<{ configured: boolean; phoneId: string; template: string }>({ configured: false, phoneId: "", template: "" });
  const [waToken, setWaToken] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // Off-site backup. "Configured" was never the useful question — credentials
  // stay present for weeks after they stop being accepted — so this shows when a
  // file last actually landed, and where.
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMsg, setDriveMsg] = useState("");

  const loadBackup = () =>
    fetch("/api/backup/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BackupStatus | null) => d && setBackup(d))
      .catch(() => {});

  async function backupNow() {
    setDriveBusy(true); setDriveMsg("");
    try {
      const res = await fetch("/api/cron/backup-drive", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      const dests: { name: string; ok: boolean; detail: string }[] = d.destinations ?? [];
      if (!res.ok && !dests.length) throw new Error(d.error || "Backup failed.");
      const good = dests.filter((x) => x.ok);
      const bad = dests.filter((x) => !x.ok);
      setDriveMsg(
        (good.length ? `✓ Saved to ${good.map((x) => x.name).join(" and ")}. ` : "Backup did not save anywhere. ") +
          bad.map((x) => `${x.name}: ${x.detail}`).join("  ·  "),
      );
      await loadBackup();
    } catch (e) {
      setDriveMsg(e instanceof Error ? e.message : "Backup failed.");
    } finally { setDriveBusy(false); }
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
        `Restored: ${r.customersRestored} customer ledger${r.customersRestored === 1 ? "" : "s"}${r.customersFailed ? `, ${r.customersFailed} skipped (no longer in Shopify)` : ""}${r.settings ? ", settings" : ""}${r.shopFieldsRestored ? `, ${r.shopFieldsRestored} shop record${r.shopFieldsRestored === 1 ? "" : "s"} (cash-ups, expenses, staff…)` : ""}${r.shopFieldsFailed ? `, ${r.shopFieldsFailed} shop record(s) refused` : ""}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  }

  const loadShifts = () => fetch("/api/attendance").then((r) => (r.ok ? r.json() : null)).then((d) => d && setShifts(d.today ?? [])).catch(() => {});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setS(d.settings))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetch("/api/settings/whatsapp").then((r) => (r.ok ? r.json() : null)).then((d) => d && setWa({ configured: !!d.configured, phoneId: d.phoneId || "", template: d.template || "" })).catch(() => {});
    loadBackup();
    loadShifts();
  }, []);

  async function saveWhatsApp() {
    setWaSaving(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsappToken: waToken, whatsappPhoneId: wa.phoneId, whatsappTemplate: wa.template }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setWa({ configured: !!d.configured, phoneId: d.phoneId || "", template: d.template || "" });
      setWaToken("");
      setMsg("WhatsApp settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); } finally { setWaSaving(false); }
  }

  async function sendDigestNow() {
    if (!confirm("Send today's end-of-day summaries now? Customers with an email/WhatsApp on file will be messaged.")) return;
    setDigestBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/cron/daily-digest?force=1", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setMsg(`Digest sent — ${d.customersBilled} customer(s), ${d.emailsSent} email(s), ${d.whatsappsSent} WhatsApp(s)${d.ownerSent ? ", owner report ✓" : ""}${d.errors?.length ? ` · ${d.errors.length} issue(s)` : ""}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setDigestBusy(false); }
  }

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      setMsg("Saved. Invoices & statements will use these details.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !s) return <div className="px-8 py-7 text-sm text-neutral-400">Loading settings…</div>;

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Settings</h1>
          <p className="text-sm text-neutral-500">Business details used on your invoices, statements &amp; PDFs.</p>
        </div>
        <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{msg}</p>}

      <div className="mt-6 grid max-w-4xl gap-6 lg:grid-cols-2">
        <Section title="Business identity">
          <Field label="Business name"><input className={inp} value={s.bizName} onChange={(e) => set("bizName", e.target.value)} /></Field>
          <Field label="Tagline"><input className={inp} value={s.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
          <Field label="Address (one line per row)">
            <textarea rows={4} className={inp} value={s.address} onChange={(e) => set("address", e.target.value)} placeholder={"Unit 1, Example Road\nLondon\nSW1A 1AA\nUnited Kingdom"} />
          </Field>
          <Field label="Favicon URL (browser tab icon)">
            <div className="flex items-center gap-3">
              <input className={inp} value={s.faviconUrl} onChange={(e) => set("faviconUrl", e.target.value)} placeholder="https://…/icon.png or .ico/.svg" />
              {s.faviconUrl?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.faviconUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-neutral-200 object-contain dark:border-neutral-700" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-dashed border-neutral-300 text-[10px] text-neutral-400 dark:border-neutral-600">icon</span>
              )}
            </div>
            <span className="mt-1 block text-xs text-neutral-400">Paste a public image URL (PNG/ICO/SVG, square). Applies after saving &amp; a refresh.</span>
          </Field>
        </Section>

        <Section title="Contact & legal">
          <Field label="Email"><input className={inp} value={s.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><input className={inp} value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Website"><input className={inp} value={s.website} onChange={(e) => set("website", e.target.value)} /></Field>
          <Field label="VAT number (shown on VAT invoices)"><input className={inp} value={s.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} placeholder="GB123456789" /></Field>
        </Section>

        <Section title="Invoice footer">
          <Field label="Bank / payment details (footer)">
            <textarea rows={3} className={inp} value={s.bank} onChange={(e) => set("bank", e.target.value)} placeholder="Bank: … · Sort: … · Acc: …" />
          </Field>
          <Field label="Footer note"><input className={inp} value={s.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} /></Field>
        </Section>

        <Section title="Defaults">
          <Field label="Invoice number prefix"><input className={inp} value={s.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} placeholder={BRAND_INVOICE_PREFIX} /></Field>
          <p className="text-xs text-neutral-400">New invoices are numbered <strong>{s.invoicePrefix || BRAND_INVOICE_PREFIX}-{new Date().getFullYear()}-0001</strong>, incrementing uniquely.</p>
          <Field label="VAT rate (%)"><input type="number" className={inp} value={s.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))} /></Field>
          <p className="text-xs text-neutral-400">Used for the total shown on the billing screen. The tax actually charged is applied by Shopify from its own tax settings — keep the two the same.</p>
          <Field label="Low-stock threshold"><input type="number" className={inp} value={s.lowStock} onChange={(e) => set("lowStock", Number(e.target.value))} /></Field>
          <p className="text-xs text-neutral-400">Drives the &ldquo;Low stock&rdquo; count on the dashboard and the Low filter in Inventory.</p>
        </Section>

        <Section title="Financial privacy">
          <p className="text-xs text-neutral-500">Sales, earnings and takings figures are hidden from staff by default. When a staff member requests access, you approve it from the dashboard for this long — then it hides again automatically. You can also revoke instantly.</p>
          <Field label="Reveal window (minutes)"><input type="number" min={1} max={120} className={inp} value={s.financeGrantMinutes} onChange={(e) => set("financeGrantMinutes", Math.min(120, Math.max(1, Number(e.target.value))))} /></Field>
        </Section>

        <Section title="Automatic WhatsApp">
          <p className="text-xs text-neutral-500">Paste your <strong>WhatsApp Cloud API</strong> credentials to enable automatic WhatsApp messages. Until both are set, nothing is sent (email still works).</p>
          <Field label="Access token">
            <input className={inp} type="password" value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder={wa.configured ? "•••••••• (saved — paste to replace)" : "paste token"} autoComplete="off" />
          </Field>
          <Field label="Phone number ID"><input className={inp} value={wa.phoneId} onChange={(e) => setWa((p) => ({ ...p, phoneId: e.target.value }))} placeholder="e.g. 123456789012345" /></Field>
          <Field label="Message template name (optional)"><input className={inp} value={wa.template} onChange={(e) => setWa((p) => ({ ...p, template: e.target.value }))} placeholder="leave blank for plain text (24h window only)" /></Field>
          <div className="flex items-center gap-3">
            <button onClick={saveWhatsApp} disabled={waSaving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{waSaving ? "Saving…" : "Save WhatsApp"}</button>
            <span className={`text-xs font-medium ${wa.configured ? "text-emerald-600" : "text-neutral-400"}`}>{wa.configured ? "● Connected" : "○ Not connected"}</span>
          </div>
        </Section>

        <Section title="Daily digest (end of day)">
          <p className="text-xs text-neutral-500">At the scheduled time each evening, send every wholesale customer their own day&apos;s bills + total outstanding, and send you an all-customers summary. Runs ~21:30 UK.</p>
          <label className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-700 dark:text-neutral-300">Enable daily digest</span><input type="checkbox" checked={s.dailyDigest} onChange={(e) => set("dailyDigest", e.target.checked)} className="h-4 w-4 accent-amber-500" /></label>
          <label className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-700 dark:text-neutral-300">Send each customer their summary</span><input type="checkbox" checked={s.digestCustomers} onChange={(e) => set("digestCustomers", e.target.checked)} className="h-4 w-4 accent-amber-500" /></label>
          <label className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-700 dark:text-neutral-300">Send me the owner report</span><input type="checkbox" checked={s.digestOwner} onChange={(e) => set("digestOwner", e.target.checked)} className="h-4 w-4 accent-amber-500" /></label>
          <Field label="Owner report email (blank = business email)"><input className={inp} value={s.digestOwnerEmail} onChange={(e) => set("digestOwnerEmail", e.target.value)} placeholder={s.email} /></Field>
          <Field label="Owner WhatsApp number (optional)"><input className={inp} value={s.digestOwnerPhone} onChange={(e) => set("digestOwnerPhone", e.target.value)} placeholder="+44…" /></Field>
          <Field label="Show the header 'Today's reports' button after (hour, 0–23)">
            <input type="number" min={0} max={23} className={inp} value={s.reportButtonHour} onChange={(e) => set("reportButtonHour", Math.min(23, Math.max(0, Number(e.target.value))))} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={save} disabled={saving} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-900 dark:border-neutral-600 dark:text-neutral-200">Save digest settings</button>
            <button onClick={sendDigestNow} disabled={digestBusy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-60">{digestBusy ? "Sending…" : "Send today's digest now"}</button>
          </div>
        </Section>

        <Section title="Backup & restore">
          <p className="text-xs text-neutral-500">Download a full snapshot of everything — products, collections, every customer (with balances &amp; ledgers), invoices, orders, and the shop&apos;s own records: cash-ups, expenses, settlements, till counts, staff accounts, attendance, audit log and import history — as one JSON file. Keep it safe; if anything goes wrong you can restore from it.</p>
          <a href="/api/backup" className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">⬇ Download full backup (.json)</a>
          <p className="text-xs text-neutral-400">Products &amp; collections can be re-imported from Excel. Customer balances and invoice history are preserved in the file for assisted restore.</p>
          <div className="mt-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Automatic nightly backup:</span>
              {backup === null ? (
                <span className="text-xs text-neutral-400">checking…</span>
              ) : backup.ageHours === null ? (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15">Never run</span>
              ) : backup.stale ? (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-500/15">
                  Last good backup {hoursAgo(backup.ageHours)} ago — overdue
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15">
                  Backed up {hoursAgo(backup.ageHours)} ago
                </span>
              )}
              <button onClick={backupNow} disabled={driveBusy} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
                {driveBusy ? "Backing up…" : "Back up now"}
              </button>
            </div>
            {driveMsg && <p className="mt-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">{driveMsg}</p>}

            {/* Where last night's file went, destination by destination. One
                being broken doesn't stop the backup — but it must be visible,
                because the whole failure mode here is nobody noticing. */}
            {backup?.lastRun && (
              <ul className="mt-2 space-y-1">
                {backup.lastRun.destinations.map((d) => (
                  <li key={d.name} className="text-xs">
                    <span className={d.ok ? "text-emerald-600" : "text-red-600"}>{d.ok ? "✓" : "✗"}</span>{" "}
                    <strong className="text-neutral-700 dark:text-neutral-300">{d.name}</strong>{" "}
                    <span className="text-neutral-500">{d.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-neutral-400">
              Runs by itself every night at ~22:00 and goes to every destination that is set up — a dated file in
              your &ldquo;{s.bizName || "Business"} Backups&rdquo; Drive folder (last 14 kept), and a compressed copy
              emailed to the owner. If a run saves nowhere, you get an email about it that evening.
            </p>
          </div>

          <div className="mt-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500">Restore from a backup: overwrites <strong>settings, every customer&apos;s ledger / opening balance, and the shop&apos;s own records</strong> — cash-ups, expenses, settlements, till counts, staff accounts and permissions, attendance, audit log — from the file. Products, customers and orders stay in Shopify and are not touched.</p>
            <label className="mt-2 inline-block">
              <input type="file" accept="application/json,.json" className="hidden" onChange={restoreBackup} disabled={restoreBusy} />
              <span className="inline-block cursor-pointer rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100">{restoreBusy ? "Restoring…" : "⟲ Restore from backup…"}</span>
            </label>
          </div>
        </Section>

        <Section title="Staff time-clock (tap in / out)">
          <p className="text-xs text-neutral-500">When on, everyone must re-enter their password to <strong>tap in</strong> after login before the portal opens. Staff tap out manually, and everyone is auto-tapped-out at ~21:30.</p>
          <label className="flex items-center justify-between text-sm"><span className="font-medium text-neutral-700 dark:text-neutral-300">Require tap in</span><input type="checkbox" checked={s.requireTapIn} onChange={(e) => set("requireTapIn", e.target.checked)} className="h-4 w-4 accent-amber-500" /></label>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
            <button onClick={loadShifts} className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-300">↻ Refresh</button>
          </div>
          <div className="mt-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Today&apos;s shifts</p>
            {shifts.length === 0 ? (
              <p className="text-xs text-neutral-400">No one has tapped in today.</p>
            ) : (
              <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {shifts.map((sh, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="truncate text-neutral-800 dark:text-neutral-200">{sh.name || sh.email}</span>
                    <span className="flex items-center gap-2 text-xs text-neutral-500">
                      <span>{new Date(sh.tapIn).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}{sh.tapOut ? `–${new Date(sh.tapOut).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                      <span>· {Math.floor(sh.minutes / 60)}h {sh.minutes % 60}m</span>
                      {sh.open ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">in</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800">{sh.autoOut ? "auto-out" : "out"}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      <button onClick={save} disabled={saving} className="mt-7 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
        {saving ? "Saving…" : "Save settings"}
      </button>
      {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
    </div>
  );
}

const inp = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      {children}
    </label>
  );
}
