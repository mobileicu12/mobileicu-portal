"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadFile } from "@/lib/download";
import { buildCashUpDoc, cashUpFilename } from "@/lib/cashup-pdf";
import { sheetTotals, emptyCashUp, type CashUp, type CashUpLine, type DayTakings } from "@/lib/cashup-types";
import { loadBusiness, BUSINESS } from "@/lib/business";

const gbp = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const METHODS = ["cash", "card", "bank transfer", "other"];

export default function CashUpPage() {
  const [date, setDate] = useState(todayStr());
  const [takings, setTakings] = useState<DayTakings | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [savedAt, setSavedAt] = useState<{ by: string; at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState("");

  // The sheet staff fill in.
  const [sheet, setSheet] = useState<CashUp>(() => emptyCashUp(todayStr()));

  const load = useCallback(() => {
    return fetch(`/api/cashup?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setError(d.error || "");
        if (d.error) return;
        const sys: DayTakings | null = d.takings ?? null;
        setTakings(sys);
        setHistory(d.history ?? []);
        const saved: CashUp | null = d.saved ?? null;
        if (saved) {
          setSheet({ ...emptyCashUp(date), ...saved });
          setSavedAt({ by: saved.closedBy, at: saved.closedAt });
        } else {
          // Fresh sheet. Customer payments and "other" start BLANK on purpose —
          // they're the independent count. Expenses are pre-filled from the
          // Expenses page, because staff are confirming a list that already
          // exists rather than inventing one.
          setSheet({ ...emptyCashUp(date), expenseLines: sys?.expenseLines ?? [] });
          setSavedAt(null);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const t = sheetTotals(sheet);
  const expectedCash = sheet.openingFloat + t.byMethod.cash - t.cashExpenses;
  const variance = sheet.countedCash - expectedCash;
  const balanced = Math.abs(variance) < 0.01;

  // Sheet vs portal, per method.
  const diffs = takings
    ? [
        { label: "Cash", sheet: t.byMethod.cash, sys: takings.receivedByMethod.cash },
        { label: "Card", sheet: t.byMethod.card, sys: takings.receivedByMethod.card },
        { label: "Total received", sheet: t.receivedTotal, sys: takings.receivedTotal },
      ]
    : [];
  const anyDrift = diffs.some((d) => Math.abs(d.sheet - d.sys) >= 0.01);

  function set<K extends keyof CashUp>(k: K, v: CashUp[K]) { setSheet((p) => ({ ...p, [k]: v })); }
  function setLine(key: "customerLines" | "expenseLines", i: number, patch: Partial<CashUpLine>) {
    setSheet((p) => ({ ...p, [key]: p[key].map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  }
  function addLine(key: "customerLines" | "expenseLines") {
    setSheet((p) => ({ ...p, [key]: [...p[key], { name: "", amount: 0, method: "cash" }] }));
  }
  function removeLine(key: "customerLines" | "expenseLines", i: number) {
    setSheet((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));
  }

  async function save() {
    setBusy("save"); setError(""); setFlash("");
    try {
      const res = await fetch("/api/cashup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sheet, date }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      setFlash(`Cash-up saved for ${dayLabel(date)}.`);
      setTimeout(() => setFlash(""), 6000);
      setLoading(true);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); } finally { setBusy(""); }
  }

  async function pdf(): Promise<Blob> {
    const doc = buildCashUpDoc(date, { ...sheet, date }, takings, await loadBusiness());
    return doc.output("blob");
  }

  async function downloadPdf() {
    setBusy("pdf");
    try {
      const url = URL.createObjectURL(await pdf());
      const a = document.createElement("a");
      a.href = url; a.download = cashUpFilename(date, await loadBusiness()); a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(""); }
  }

  function downloadExcel() {
    // Server-rendered from the SAVED record, so save first or you'll export stale numbers.
    if (!savedAt) { setError("Save the cash-up first — the Excel export is built from the saved record."); return; }
    setBusy("excel"); setError("");
    downloadFile(`/api/cashup/export?date=${date}`, `cashup-${date}.xlsx`)
      .catch((e) => setError(e instanceof Error ? e.message : "Export failed."))
      .finally(() => setBusy(""));
  }

  // Share to a WhatsApp group: wa.me can't attach a file, so the message carries
  // the figures and the PDF is downloaded alongside for manual attachment.
  async function shareWhatsApp() {
    setBusy("share");
    try {
      const lines = sheet.customerLines.filter((l) => l.name.trim() || l.amount > 0)
        .map((l) => `• ${l.name || "—"}: ${gbp(l.amount)} ${l.method}`).join("\n");
      const msg =
        `*${BUSINESS.name} — Cash-up ${dayLabel(date)}*\n\n` +
        (lines ? `*Wholesale paid*\n${lines}\n\n` : "") +
        `*Other collected*\nCash ${gbp(sheet.otherCash)} · Card ${gbp(sheet.otherCard)}\n\n` +
        `*Totals*\nCash ${gbp(t.byMethod.cash)}\nCard ${gbp(t.byMethod.card)}\nTotal ${gbp(t.receivedTotal)}\n\n` +
        `*Expenses* ${gbp(t.expensesTotal)} (${gbp(t.cashExpenses)} from till)\n\n` +
        `*Left in drawer*\nExpected ${gbp(expectedCash)}\nCounted ${gbp(sheet.countedCash)}\n` +
        (balanced ? "✅ Balances" : `⚠️ ${variance > 0 ? "Over" : "Short"} ${gbp(Math.abs(variance))}`) +
        (sheet.note ? `\n\nNote: ${sheet.note}` : "");
      await downloadPdf();
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    } finally { setBusy(""); }
  }

  const inp = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";
  const num = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cash-up</h1>
          <p className="text-sm text-muted">Enter the day by hand, then check it against the portal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} max={todayStr()} onChange={(e) => { setDate(e.target.value); setLoading(true); }} className={num} />
          <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">↻</button>
          <button onClick={save} disabled={!!busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:bg-accent hover:text-accentfg disabled:opacity-50">
            {busy === "save" ? "Saving…" : savedAt ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{flash}</p>}
      {savedAt && !flash && (
        <p className="mb-4 rounded-lg border border-line bg-subtle px-4 py-2.5 text-xs text-muted">
          Saved by <strong className="text-ink">{savedAt.by}</strong> at {new Date(savedAt.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Saving again replaces it.
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Working out the day&apos;s money…</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Wholesale customers — typed by hand */}
            <Panel title="Wholesale customers paid" hint="Type these from your own record — leaving them blank is what makes the check below meaningful.">
              <div className="space-y-2">
                {sheet.customerLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inp} flex-1`} placeholder="Customer name" value={l.name} onChange={(e) => setLine("customerLines", i, { name: e.target.value })} />
                    <input type="number" step="0.01" min="0" inputMode="decimal" className={`${num} w-24`} placeholder="0.00" value={l.amount || ""} onChange={(e) => setLine("customerLines", i, { amount: Number(e.target.value) || 0 })} />
                    <select className={`${num} w-28`} value={l.method} onChange={(e) => setLine("customerLines", i, { method: e.target.value })}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={() => removeLine("customerLines", i)} className="px-1 text-muted hover:text-red-600" title="Remove">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addLine("customerLines")} className="mt-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent">
                + Add customer payment
              </button>
              <Total label="From customers" value={t.fromCustomers} />
            </Panel>

            {/* Other collected */}
            <Panel title="Other collected" hint="Counter / mix sales that aren't against a customer account.">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Cash</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} placeholder="0.00" value={sheet.otherCash || ""} onChange={(e) => set("otherCash", Number(e.target.value) || 0)} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Card</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} placeholder="0.00" value={sheet.otherCard || ""} onChange={(e) => set("otherCard", Number(e.target.value) || 0)} />
              </label>
              <Total label="From other" value={t.fromOther} />
              <div className="mt-4 border-t border-line pt-3">
                <Row label="All takings — cash" value={t.byMethod.cash} />
                <Row label="All takings — card" value={t.byMethod.card} />
                <Total label="Total received" value={t.receivedTotal} />
              </div>
            </Panel>
          </div>

          {/* Expenses — pre-filled, editable */}
          <div className="mt-6">
            <Panel title="Expenses" hint="Pre-filled from the Expenses page for this day. Edit, add or remove — only lines marked cash come out of the till.">
              <div className="space-y-2">
                {sheet.expenseLines.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inp} flex-1`} placeholder="What was it for" value={l.name} onChange={(e) => setLine("expenseLines", i, { name: e.target.value })} />
                    <input type="number" step="0.01" min="0" inputMode="decimal" className={`${num} w-24`} placeholder="0.00" value={l.amount || ""} onChange={(e) => setLine("expenseLines", i, { amount: Number(e.target.value) || 0 })} />
                    <select className={`${num} w-32`} value={l.method} onChange={(e) => setLine("expenseLines", i, { method: e.target.value })}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button onClick={() => removeLine("expenseLines", i)} className="px-1 text-muted hover:text-red-600" title="Remove">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addLine("expenseLines")} className="mt-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-accent">
                + Add expense
              </button>
              <Row label="Total out" value={t.expensesTotal} />
              <Total label="Out of the till (cash only)" value={t.cashExpenses} />
            </Panel>
          </div>

          {/* Verify */}
          {takings && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your sheet vs the portal</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr><th className="py-2">&nbsp;</th><th className="py-2 text-right">Sheet</th><th className="py-2 text-right">Portal</th><th className="py-2 text-right">Difference</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {diffs.map((d) => {
                      const gap = d.sheet - d.sys;
                      const off = Math.abs(gap) >= 0.01;
                      return (
                        <tr key={d.label}>
                          <td className="py-2 text-muted">{d.label}</td>
                          <td className="py-2 text-right text-ink">{gbp(d.sheet)}</td>
                          <td className="py-2 text-right text-ink">{gbp(d.sys)}</td>
                          <td className={`py-2 text-right font-semibold ${off ? "text-red-600" : "text-emerald-600"}`}>{off ? gbp(gap) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${anyDrift ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-700"}`}>
                {anyDrift
                  ? "⚠ Your sheet and the portal disagree. Check today's invoices before closing — one side has a payment the other doesn't."
                  : "✓ Your sheet matches the portal exactly."}
              </p>
              {takings.accountLines.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">Portal says these customers paid ({takings.accountLines.length})</summary>
                  <div className="mt-2 space-y-1">
                    {takings.accountLines.map((l, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted">{l.name} <span className="text-xs">· {l.method}</span></span>
                        <span className="text-ink">{gbp(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Close the drawer */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Count the drawer">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Opening float</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} placeholder="0.00" value={sheet.openingFloat || ""} onChange={(e) => set("openingFloat", Number(e.target.value) || 0)} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Cash counted now</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} placeholder="0.00" value={sheet.countedCash || ""} onChange={(e) => set("countedCash", Number(e.target.value) || 0)} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Card terminal total <span className="font-normal text-muted">(optional)</span></span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} placeholder="0.00" value={sheet.countedCard || ""} onChange={(e) => set("countedCard", Number(e.target.value) || 0)} />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Note <span className="font-normal text-muted">(optional)</span></span>
                <input className={inp} value={sheet.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. £5 short, paid supplier from till" />
              </label>
            </Panel>

            <Panel title="What's left">
              <Row label="Opening float" value={sheet.openingFloat} />
              <Row label="+ Cash taken today" value={t.byMethod.cash} />
              <Row label="− Cash expenses" value={-t.cashExpenses} />
              <Total label="Expected in drawer" value={expectedCash} />
              <div className={`mt-3 rounded-xl px-4 py-3 ${balanced ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`text-sm font-medium ${balanced ? "text-emerald-700" : "text-red-600"}`}>Counted {gbp(sheet.countedCash)}</span>
                  <span className={`text-lg font-bold ${balanced ? "text-emerald-700" : "text-red-600"}`}>
                    {balanced ? "Balances" : `${variance > 0 ? "Over" : "Short"} ${gbp(Math.abs(variance))}`}
                  </span>
                </div>
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <Row label="Card today" value={t.byMethod.card} />
                <Total label="Cash + card today" value={t.receivedTotal} />
              </div>
            </Panel>
          </div>

          {/* Export & share */}
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-5">
            <span className="mr-2 text-sm font-semibold text-ink">Report</span>
            <button onClick={downloadPdf} disabled={!!busy} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-50">
              {busy === "pdf" ? "…" : "📄 PDF"}
            </button>
            <button onClick={downloadExcel} disabled={!!busy} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-50">
              ⬇ Excel
            </button>
            <button onClick={shareWhatsApp} disabled={!!busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {busy === "share" ? "…" : "📤 Send to group"}
            </button>
            <span className="text-xs text-muted">
              Excel is built from the saved record — save first. Sending downloads the PDF and opens WhatsApp with the figures; attach the file in the chat.
            </span>
          </div>

          {history.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent cash-ups</h2>
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-line bg-subtle text-xs uppercase text-muted">
                    <tr><th className="px-4 py-3">Day</th><th className="px-4 py-3">Opening</th><th className="px-4 py-3">Counted</th><th className="px-4 py-3">By</th><th className="px-4 py-3">Note</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.slice(0, 30).map((c) => (
                      <tr key={c.date} className="cursor-pointer hover:bg-subtle" onClick={() => { setDate(c.date); setLoading(true); }}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{dayLabel(c.date)}</td>
                        <td className="px-4 py-3 text-muted">{gbp(c.openingFloat)}</td>
                        <td className="px-4 py-3 font-medium text-ink">{gbp(c.countedCash)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{c.closedBy}</td>
                        <td className="px-4 py-3 text-xs text-muted">{c.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {hint && <p className="mb-3 mt-1 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{gbp(value)}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base font-semibold text-ink">
      <span>{label}</span>
      <span>{gbp(value)}</span>
    </div>
  );
}
