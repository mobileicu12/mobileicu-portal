"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { buildCustomerDayItemisedDoc, type ItemisedBill } from "@/lib/report-pdf";
import { loadBusiness } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import { useMe } from "@/lib/use-me";

type TodayCustomer = { id: string; name: string; email: string; phone: string; todayTotal: number; todayPaid: number; todayOutstanding: number; accountOutstanding: number; bills: ItemisedBill[]; shareUrl: string };

const dateKey = () => new Date().toISOString().slice(0, 10);
const doneKey = (cid: string) => `micu:done:${dateKey()}:${cid.split("/").pop()}`;
function isDone(cid: string) { try { return localStorage.getItem(doneKey(cid)) === "1"; } catch { return false; } }
function markDone(cid: string) { try { localStorage.setItem(doneKey(cid), "1"); } catch { /* ignore */ } }

export default function TodaySendDrawer() {
  const me = useMe();
  const canUse = !!me && (me.role === "owner" || me.permissions.includes("customers"));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [custs, setCusts] = useState<TodayCustomer[] | null>(null);
  const [waOn, setWaOn] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [, setTick] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/reports/today-customers");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load.");
      setCusts(d.customers ?? []);
      setWaOn(!!d.waConfigured);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setLoading(false); }
  }, []);

  function toggle() {
    const n = !open;
    setOpen(n);
    if (n && custs === null) refresh();
  }

  const dateLabel = () => new Date().toLocaleDateString("en-GB");
  const safeName = (n: string) => (n || "customer").replace(/[^\w-]/g, "_").slice(0, 60) || "customer";
  function docFor(c: TodayCustomer) {
    return loadBusiness().then((biz) => buildCustomerDayItemisedDoc(c.name, c.bills,
      { todayTotal: c.todayTotal, todayPaid: c.todayPaid, todayOutstanding: c.todayOutstanding, accountOutstanding: c.accountOutstanding },
      { dateLabel: dateLabel(), business: biz }));
  }

  async function generateOne(c: TodayCustomer) {
    setBusyId(c.id);
    try {
      const doc = await docFor(c);
      const url = URL.createObjectURL(doc.output("blob"));
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName(c.name)}_${dateLabel().replace(/\//g, "-")}.pdf`; a.click();
      URL.revokeObjectURL(url);
      markDone(c.id); setTick((t) => t + 1);
    } finally { setBusyId(""); }
  }

  async function generateAll() {
    const list = pending.length ? pending : (custs ?? []);
    if (!list.length) return;
    setBusyId("gen-all");
    try {
      const biz = await loadBusiness();
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const stamp = dateLabel().replace(/\//g, "-");
      const used = new Set<string>();
      for (const c of list) {
        const doc = buildCustomerDayItemisedDoc(c.name, c.bills,
          { todayTotal: c.todayTotal, todayPaid: c.todayPaid, todayOutstanding: c.todayOutstanding, accountOutstanding: c.accountOutstanding },
          { dateLabel: dateLabel(), business: biz });
        let n = safeName(c.name); while (used.has(n)) n += "_"; used.add(n);
        zip.file(`${n}_${stamp}.pdf`, doc.output("arraybuffer"));
        markDone(c.id);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `todays-statements-${stamp}.zip`; a.click(); URL.revokeObjectURL(url);
      setTick((t) => t + 1);
    } finally { setBusyId(""); }
  }

  async function sendOne(c: TodayCustomer): Promise<void> {
    const doc = await docFor(c);
    const pdfBase64 = doc.output("datauristring").split("base64,").pop();
    const filename = `${safeName(c.name)}_${dateLabel().replace(/\//g, "-")}.pdf`;
    if (c.email) {
      try {
        await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.email, subject: `Your account summary — ${dateLabel()}`, message: `Hi ${c.name}, your itemised summary for ${dateLabel()} is attached.\nToday's total: £${c.todayTotal.toFixed(2)} · Total outstanding: £${c.accountOutstanding.toFixed(2)}`, pdfBase64, filename }) });
      } catch { /* ignore */ }
    }
    if (c.phone) {
      const list = c.bills.map((b) => `• ${b.invoiceNo}: ${b.lines.map((l) => `${l.quantity}× ${l.title}`).join(", ")} = £${Number(b.total).toFixed(2)}${b.status === "COMPLETED" ? " (paid)" : ""}`).join("\n");
      const link = `${SITE_URL}${c.shareUrl}`;
      const text = `Hi ${c.name}, today's summary from MOBILE ICU:\n${list}\n\nToday's total: £${c.todayTotal.toFixed(2)}\nPaid today: £${c.todayPaid.toFixed(2)}\nToday's outstanding: £${c.todayOutstanding.toFixed(2)}\nTotal outstanding: £${c.accountOutstanding.toFixed(2)}\n\nView / download: ${link}`;
      if (waOn) {
        try { await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: c.phone, message: text }) }); } catch { /* ignore */ }
      } else {
        // No WhatsApp API yet → open click-to-send with text + PDF link.
        window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
      }
    }
    markDone(c.id); setTick((t) => t + 1);
  }

  async function handleSend(c: TodayCustomer) { setBusyId(c.id + ":send"); await sendOne(c); setBusyId(""); }
  async function sendAll() {
    if (!pending.length) return;
    // With no WhatsApp API, we can't pop a tab per customer — email everyone, and note it.
    setBusyId("send-all");
    for (const c of pending) {
      if (!waOn && c.phone && !c.email) { markDone(c.id); continue; } // nothing to auto-send; skip
      await sendOne(c);
    }
    setBusyId("");
  }

  if (!canUse) return null;

  const all = custs ?? [];
  const pending = all.filter((c) => !isDone(c.id));
  const done = all.filter((c) => isDone(c.id));

  const Row = ({ c, faded }: { c: TodayCustomer; faded?: boolean }) => (
    <div className={`rounded-xl border border-neutral-200 p-3 dark:border-neutral-800 ${faded ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{c.name}</p>
        <p className="text-xs text-neutral-500">{c.bills.length} bill(s) · £{c.todayTotal.toFixed(2)} today{c.accountOutstanding > 0 ? ` · £${c.accountOutstanding.toFixed(2)} due` : ""}</p>
        <p className="text-[11px] text-neutral-400">{[c.email, c.phone].filter(Boolean).join(" · ") || "no contact on file"}</p>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => generateOne(c)} disabled={!!busyId} className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">{busyId === c.id ? "…" : "📄 Generate"}</button>
        <button onClick={() => handleSend(c)} disabled={!!busyId} className="flex-1 rounded-lg bg-neutral-900 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">{busyId === c.id + ":send" ? "…" : "📤 Send"}</button>
      </div>
    </div>
  );

  return (
    <>
      {!open && (
        <button onClick={toggle} title="Today's sending" className="fixed right-0 top-1/3 z-40 flex items-center gap-1.5 rounded-l-xl border border-r-0 border-neutral-200 bg-white py-3 pl-3 pr-2 text-xs font-semibold text-neutral-700 shadow-lg transition hover:bg-amber-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" style={{ writingMode: "vertical-rl" }}>
          <span className="rotate-180">📤 Today&apos;s sending</span>
          {pending.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-neutral-900">{pending.length}</span>}
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
            <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.28, ease: "easeInOut" }} className="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-sm flex-col border-l border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Today&apos;s sending</h2>
                  <p className="text-xs text-neutral-500">{pending.length} to do · {done.length} done{!waOn ? " · WhatsApp: click-to-send" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={refresh} disabled={loading} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-600 hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300">↻</button>
                  <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100">✕</button>
                </div>
              </div>

              {all.length > 0 && (
                <div className="flex gap-2 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
                  <button onClick={generateAll} disabled={!!busyId} className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">{busyId === "gen-all" ? "Zipping…" : "📦 Generate all (ZIP)"}</button>
                  <button onClick={sendAll} disabled={!!busyId || !pending.length} className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-50">{busyId === "send-all" ? "Sending…" : "📤 Send all"}</button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading && <p className="py-10 text-center text-sm text-neutral-400">Loading today&apos;s customers…</p>}
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
                {!loading && !error && all.length === 0 && <p className="py-10 text-center text-sm text-neutral-400">No customer sales today.</p>}

                {pending.length > 0 && (
                  <>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">To do ({pending.length})</p>
                    <div className="space-y-2">{pending.map((c) => <Row key={c.id} c={c} />)}</div>
                  </>
                )}
                {done.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Done ({done.length})</p>
                    <div className="space-y-2">{done.map((c) => <Row key={c.id} c={c} faded />)}</div>
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
