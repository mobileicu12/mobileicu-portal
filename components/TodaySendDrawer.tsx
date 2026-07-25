"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildCustomerDayItemisedDoc, type ItemisedBill } from "@/lib/report-pdf";
import { loadBusiness } from "@/lib/business";
import { useMe } from "@/lib/use-me";

type TodayCustomer = { id: string; name: string; email: string; phone: string; todayTotal: number; todayPaid: number; todayOutstanding: number; accountOutstanding: number; bills: ItemisedBill[] };

const dateKey = () => new Date().toISOString().slice(0, 10);
const sentKey = (cid: string) => `micu:sent:${dateKey()}:${cid.split("/").pop()}`;
function isSent(cid: string) { try { return localStorage.getItem(sentKey(cid)) === "1"; } catch { return false; } }
function markSent(cid: string) { try { localStorage.setItem(sentKey(cid), "1"); } catch { /* ignore */ } }

export default function TodaySendDrawer() {
  const me = useMe();
  const canUse = !!me && (me.role === "owner" || me.permissions.includes("customers"));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [custs, setCusts] = useState<TodayCustomer[] | null>(null);
  const [busyId, setBusyId] = useState<string>("");
  const [sentTick, setSentTick] = useState(0); // re-render trigger after marking sent
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/reports/today-customers");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load.");
      setCusts(d.customers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }, []);

  function toggle() {
    const n = !open;
    setOpen(n);
    if (n && custs === null) refresh();
  }

  async function sendOne(c: TodayCustomer): Promise<boolean> {
    const biz = await loadBusiness();
    const dateLabel = new Date().toLocaleDateString("en-GB");
    const doc = buildCustomerDayItemisedDoc(c.name, c.bills,
      { todayTotal: c.todayTotal, todayPaid: c.todayPaid, todayOutstanding: c.todayOutstanding, accountOutstanding: c.accountOutstanding },
      { dateLabel, business: biz });
    const pdfBase64 = doc.output("datauristring").split("base64,").pop();
    const filename = `${c.name.replace(/[^\w-]/g, "_")}_${dateLabel.replace(/\//g, "-")}.pdf`;
    let ok = false;
    if (c.email) {
      try {
        const er = await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.email, subject: `Your account summary — ${dateLabel}`, message: `Hi ${c.name}, your itemised summary for ${dateLabel} is attached.\nToday's total: £${c.todayTotal.toFixed(2)} · Total outstanding: £${c.accountOutstanding.toFixed(2)}`, pdfBase64, filename }) });
        if (er.ok) ok = true;
      } catch { /* ignore */ }
    }
    if (c.phone) {
      try {
        const list = c.bills.map((b) => `• ${b.invoiceNo}: ${b.lines.map((l) => `${l.quantity}× ${l.title}`).join(", ")} = £${Number(b.total).toFixed(2)}${b.status === "COMPLETED" ? " (paid)" : ""}`).join("\n");
        const msg = `Hi ${c.name}, today's summary from MOBILE ICU:\n${list}\n\nToday's total: £${c.todayTotal.toFixed(2)}\nPaid today: £${c.todayPaid.toFixed(2)}\nToday's outstanding: £${c.todayOutstanding.toFixed(2)}\nTotal outstanding: £${c.accountOutstanding.toFixed(2)}\n\nThank you.`;
        const wr = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: c.phone, message: msg }) });
        if (wr.ok) ok = true;
      } catch { /* whatsapp optional */ }
    }
    if (ok || (!c.email && !c.phone)) { markSent(c.id); setSentTick((t) => t + 1); }
    return ok;
  }

  async function handleSend(c: TodayCustomer) {
    setBusyId(c.id);
    await sendOne(c);
    setBusyId("");
  }

  async function sendAllPending() {
    if (!pending.length) return;
    setBusyId("all");
    for (const c of pending) { await sendOne(c); }
    setBusyId("");
  }

  if (!canUse) return null;

  const pending = (custs ?? []).filter((c) => !isSent(c.id));
  const sent = (custs ?? []).filter((c) => isSent(c.id));
  void sentTick; // dependency for re-render

  return (
    <>
      {/* Right-edge toggle tab (closed by default) */}
      {!open && (
        <button
          onClick={toggle}
          title="Today's sending"
          className="fixed right-0 top-1/3 z-40 flex items-center gap-1.5 rounded-l-xl border border-r-0 border-neutral-200 bg-white py-3 pl-3 pr-2 text-xs font-semibold text-neutral-700 shadow-lg transition hover:bg-amber-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          style={{ writingMode: "vertical-rl" }}
        >
          <span className="rotate-180">📤 Today&apos;s sending</span>
          {pending.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-neutral-900">{pending.length}</span>}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.28, ease: "easeInOut" }}
              className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Today&apos;s sending</h2>
                  <p className="text-xs text-neutral-500">{pending.length} to send · {sent.length} sent</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={refresh} disabled={loading} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300">↻</button>
                  <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100">✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading && <p className="py-10 text-center text-sm text-neutral-400">Loading today&apos;s customers…</p>}
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
                {!loading && !error && custs !== null && custs.length === 0 && <p className="py-10 text-center text-sm text-neutral-400">No customer sales today.</p>}

                {pending.length > 0 && (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">To send ({pending.length})</p>
                      <button onClick={sendAllPending} disabled={!!busyId} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-50">{busyId === "all" ? "Sending…" : "Send all"}</button>
                    </div>
                    <div className="space-y-2">
                      {pending.map((c) => (
                        <div key={c.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{c.name}</p>
                              <p className="text-xs text-neutral-500">{c.bills.length} bill(s) · £{c.todayTotal.toFixed(2)} today{c.accountOutstanding > 0 ? ` · £${c.accountOutstanding.toFixed(2)} due` : ""}</p>
                              <p className="text-[11px] text-neutral-400">{[c.email, c.phone].filter(Boolean).join(" · ") || "no contact on file"}</p>
                            </div>
                            <button onClick={() => handleSend(c)} disabled={!!busyId} className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">{busyId === c.id ? "…" : "Send"}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {sent.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Sent ({sent.length})</p>
                    <div className="space-y-1.5">
                      {sent.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-500/10">
                          <span className="truncate text-neutral-700 dark:text-neutral-200">{c.name}</span>
                          <span className="text-xs font-medium text-emerald-600">✓ sent</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
