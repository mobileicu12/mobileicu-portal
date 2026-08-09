"use client";

import { useCallback, useEffect, useState } from "react";
import type { CashUp, DayTakings } from "@/lib/cashup";

const gbp = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export default function CashUpPage() {
  const [date, setDate] = useState(todayStr());
  const [takings, setTakings] = useState<DayTakings | null>(null);
  const [saved, setSaved] = useState<CashUp | null>(null);
  const [history, setHistory] = useState<CashUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  // Counted by staff.
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [countedCard, setCountedCard] = useState("");
  const [note, setNote] = useState("");

  // No synchronous setState here — this runs straight from an effect, and
  // setting state in an effect body cascades an extra render.
  const load = useCallback(() => {
    return fetch(`/api/cashup?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        setError(d.error || "");
        if (d.error) return;
        setTakings(d.takings ?? null);
        setSaved(d.saved ?? null);
        setHistory(d.history ?? []);
        const s: CashUp | null = d.saved ?? null;
        setOpeningFloat(s ? String(s.openingFloat) : "");
        setCountedCash(s ? String(s.countedCash) : "");
        setCountedCard(s ? String(s.countedCard) : "");
        setNote(s?.note ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const n = (v: string) => Number(v) || 0;
  const expectedCash = takings ? n(openingFloat) + takings.receivedByMethod.cash - takings.cashExpenses : 0;
  const cashVariance = n(countedCash) - expectedCash;
  const expectedCard = takings?.receivedByMethod.card ?? 0;
  const cardVariance = n(countedCard) - expectedCard;
  const counted = countedCash.trim() !== "";

  async function save() {
    setBusy(true); setError(""); setFlash("");
    try {
      const res = await fetch("/api/cashup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, openingFloat: n(openingFloat), countedCash: n(countedCash), countedCard: n(countedCard), note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      setSaved(d.saved);
      setFlash(`Cash-up saved for ${dayLabel(date)}.`);
      setTimeout(() => setFlash(""), 6000);
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg/95 px-8 py-3 backdrop-blur">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cash-up</h1>
          <p className="text-sm text-muted">What the system took, against what&apos;s actually in the drawer.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} max={todayStr()} onChange={(e) => { setDate(e.target.value); setLoading(true); }} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <button onClick={() => { setLoading(true); void load(); }} className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">↻</button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{flash}</p>}
      {saved && !flash && (
        <p className="mb-4 rounded-lg border border-line bg-subtle px-4 py-2.5 text-xs text-muted">
          Already counted for this day by <strong className="text-ink">{saved.closedBy}</strong> at{" "}
          {new Date(saved.closedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Saving again replaces it.
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Working out the day&apos;s money…</p>
      ) : !takings ? (
        <p className="py-16 text-center text-sm text-muted">Nothing to show for this day.</p>
      ) : (
        <>
          {/* The paper sheet's two-way check */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Where it came from">
              <Row label="Customer account payments" value={takings.fromAccounts} />
              <Row label="Counter / walk-in sales" value={takings.fromCounter} />
              {takings.onAccountCredit > 0.001 && <Row label="Paid on account (no bill yet)" value={takings.onAccountCredit} />}
              <Total label="Total" value={takings.sourcesTotal} />
            </Panel>

            <Panel title="How it was paid">
              <Row label="Cash" value={takings.receivedByMethod.cash} />
              <Row label="Card" value={takings.receivedByMethod.card} />
              <Row label="Bank transfer" value={takings.receivedByMethod["bank transfer"]} />
              <Row label="Other" value={takings.receivedByMethod.other} />
              <Total label="Total" value={takings.receivedTotal} />
            </Panel>
          </div>

          <div className={`mt-3 rounded-xl px-4 py-3 text-sm font-medium ${takings.balanced ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>
            {takings.balanced
              ? `✓ Both sides agree at ${gbp(takings.receivedTotal)} — nothing missing.`
              : `⚠ The two totals disagree by ${gbp(Math.abs(takings.sourcesTotal - takings.receivedTotal))}. A bill or a payment is unaccounted for — check today's invoices before closing.`}
          </div>

          {/* Expenses out */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Expenses today">
              <Row label="Paid in cash (out of the drawer)" value={takings.expensesByMethod.cash} />
              <Row label="Card" value={takings.expensesByMethod.card} />
              <Row label="Bank transfer (not from the drawer)" value={takings.expensesByMethod["bank transfer"]} />
              <Row label="Other" value={takings.expensesByMethod.other} />
              <Total label="Total out" value={takings.expensesTotal} />
              <p className="pt-2 text-xs text-muted">
                Only expenses marked <strong className="text-ink">Cash</strong> come out of the till. Record them on the{" "}
                <a href="/portal/expenses" className="text-accent hover:underline">Expenses</a> page.
              </p>
            </Panel>

            {/* The count */}
            <Panel title="Count the drawer">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink">Opening float (counted this morning)</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00" />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Cash counted now</span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder="0.00" />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Card terminal total <span className="font-normal text-muted">(optional)</span></span>
                <input type="number" step="0.01" min="0" inputMode="decimal" className={inp} value={countedCard} onChange={(e) => setCountedCard(e.target.value)} placeholder="0.00" />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-sm font-medium text-ink">Note <span className="font-normal text-muted">(optional)</span></span>
                <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. £5 short, customer paid partly in coins" />
              </label>
            </Panel>
          </div>

          {/* The answer */}
          <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">What should be left on hand</h2>
            <div className="mt-3 max-w-md space-y-1.5 text-sm">
              <Row label="Opening float" value={n(openingFloat)} />
              <Row label="+ Cash taken today" value={takings.receivedByMethod.cash} />
              <Row label="− Cash expenses" value={-takings.cashExpenses} />
              <Total label="Expected in drawer" value={expectedCash} />
            </div>

            {counted && (
              <div className={`mt-4 rounded-xl px-4 py-3 ${Math.abs(cashVariance) < 0.01 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`text-sm font-medium ${Math.abs(cashVariance) < 0.01 ? "text-emerald-700" : "text-red-600"}`}>
                    Counted {gbp(n(countedCash))} · expected {gbp(expectedCash)}
                  </span>
                  <span className={`text-lg font-bold ${Math.abs(cashVariance) < 0.01 ? "text-emerald-700" : "text-red-600"}`}>
                    {Math.abs(cashVariance) < 0.01 ? "Balances exactly" : `${cashVariance > 0 ? "Over" : "Short"} ${gbp(Math.abs(cashVariance))}`}
                  </span>
                </div>
                {countedCard.trim() !== "" && (
                  <p className="mt-1.5 text-xs text-muted">
                    Card: counted {gbp(n(countedCard))} · expected {gbp(expectedCard)} ·{" "}
                    {Math.abs(cardVariance) < 0.01 ? "matches" : `${cardVariance > 0 ? "over" : "short"} ${gbp(Math.abs(cardVariance))}`}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={save}
              disabled={busy || !counted}
              title={!counted ? "Enter the cash you counted first" : undefined}
              className="mt-4 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent hover:text-accentfg disabled:opacity-50"
            >
              {busy ? "Saving…" : saved ? "Update cash-up" : "Save cash-up"}
            </button>
          </div>

          {/* Recent days */}
          {history.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent cash-ups</h2>
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-line bg-subtle text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3">Day</th>
                      <th className="px-4 py-3">Opening</th>
                      <th className="px-4 py-3">Counted</th>
                      <th className="px-4 py-3">By</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
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
