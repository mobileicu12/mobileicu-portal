"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AUDIT_LABELS, AUDIT_CRITICAL, type AuditEntry } from "@/lib/audit-labels";

type DeletedInvoice = { id: string; invoiceNo: string; customer: string; total: string; createdAt: string };

const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function LogsPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [deleted, setDeleted] = useState<DeletedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [months, setMonths] = useState(3);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "critical">("all");
  const [busy, setBusy] = useState("");

  // No synchronous setState here: this runs straight from an effect, and setting
  // state in an effect body triggers a cascading render. `loading` starts true and
  // is cleared when the fetch settles; the refresh button sets it itself.
  const load = useCallback(() => {
    return fetch(`/api/logs?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setEntries(d.entries ?? []);
        setDeleted(d.deleted ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [months]);
  useEffect(() => { void load(); }, [load]);

  async function restore(inv: DeletedInvoice) {
    if (!confirm(`Restore invoice ${inv.invoiceNo} (£${Number(inv.total).toFixed(2)}) for ${inv.customer}?\n\nIt will reappear in the invoice list and count towards balances again.`)) return;
    setBusy(inv.id);
    try {
      const res = await fetch(`/api/billing/${encodeURIComponent(inv.id)}`, { method: "PUT" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't restore.");
      setFlash(`Restored ${inv.invoiceNo}.`);
      setTimeout(() => setFlash(""), 5000);
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore.");
    } finally {
      setBusy("");
    }
  }

  const shown = entries.filter((e) => {
    if (only === "critical" && !AUDIT_CRITICAL.has(e.action)) return false;
    if (!q.trim()) return true;
    const hay = `${e.who} ${e.action} ${AUDIT_LABELS[e.action] ?? ""} ${e.name ?? ""} ${e.detail ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Activity log</h1>
          <p className="text-sm text-muted">Every change to an invoice or a payment — who, what and when.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value={1}>This month</option>
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <button onClick={() => { setLoading(true); load(); }} className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">↻</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{flash}</p>}

      {/* Recoverable deletions */}
      {deleted.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/60 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            Deleted invoices — recoverable ({deleted.length})
          </h2>
          <p className="mt-1 text-xs text-amber-700/80">
            These are hidden from every list, report and balance, but nothing has been destroyed. Restore puts one back exactly as it was.
          </p>
          <div className="mt-3 divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-surface">
            {deleted.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{inv.invoiceNo}</p>
                  <p className="text-xs text-muted">{inv.customer} · {dt(inv.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink">£{Number(inv.total).toFixed(2)}</span>
                  <button
                    onClick={() => restore(inv)}
                    disabled={!!busy}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === inv.id ? "…" : "↩ Restore"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice #, person, amount…"
          className="w-72 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <div className="flex rounded-lg border border-line p-1">
          {(["all", "critical"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setOnly(k)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${only === k ? "bg-ink text-bg" : "text-muted"}`}
            >
              {k === "all" ? "Everything" : "Deletions & reversals"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{shown.length} entr{shown.length === 1 ? "y" : "ies"}</span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading the log…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface py-12 text-center text-sm text-muted">
          Nothing logged for this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-subtle text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">What</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((e, i) => {
                const critical = AUDIT_CRITICAL.has(e.action);
                return (
                  <tr key={`${e.at}-${i}`} className={critical ? "bg-red-500/5" : undefined}>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dt(e.at)}</td>
                    <td className="px-4 py-3 text-ink">{e.who}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${critical ? "bg-red-500/15 text-red-600" : "bg-subtle text-muted"}`}>
                        {AUDIT_LABELS[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">{e.name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{e.detail ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Kept for 12 months, newest first. Need the underlying records too?{" "}
        <Link href="/portal/settings" className="text-accent hover:underline">Settings → Download full backup</Link>.
      </p>
    </div>
  );
}
