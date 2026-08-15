"use client";

import { useEffect, useState, use } from "react";
import { downloadFile } from "@/lib/download";
import Link from "next/link";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { generateStatementPdf, buildStatementDoc, statementFilename, buildPeriodStatementDoc, periodStatementFilename, type PeriodCharge, type PeriodPayment } from "@/lib/statement-pdf";
import { buildReceiptDoc, receiptFilename, type ReceiptInput } from "@/lib/receipt-pdf";
import { buildInvoiceDoc } from "@/lib/invoice-pdf";
import { buildCustomerDayItemisedDoc, type ItemisedBill } from "@/lib/report-pdf";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import { loadBusiness } from "@/lib/business";
import { SITE_URL } from "@/lib/site";
import type { InvoiceDetail } from "@/lib/billing";
import type { jsPDF } from "jspdf";
import { useCanSeeFinance } from "@/lib/use-me";
import { FinanceLockBar } from "@/components/Finance";
import { invoiceStatus } from "@/lib/invoice-status";
import { BRAND_SLUG } from "@/lib/brand";
import { BUSINESS } from "@/lib/business";

type Payment = { date: string; amount: number; method: string; note: string };
type Invoice = { id: string; name: string; status: string; total: string; createdAt: string; invoiceUrl: string | null; amountPaid: number; balance: number; paymentEntries: Payment[] };
// A unified payment-history row: either an on-account credit (editable/revocable
// via its ledger index) or a payment recorded against a specific invoice.
type CombinedPay = Payment & { source: "account" | "invoice"; invoiceName?: string; invoiceId?: string; ledgerIndex?: number };
type Detail = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  note: string;
  orders: number;
  totalSpent: string;
  segments: SegmentKey[];
  tradeCode: string;
  openingBalance: number;
  address: string[];
  ledger: { payments: Payment[] };
  invoices: Invoice[];
};

// Selectable statement periods. "custom" reveals two date inputs.
const STATEMENT_PERIODS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "1m", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "1y", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

// Turn a period key (+ optional custom dates) into a concrete [start, end] range
// and a human label. `end` runs through the end of today (or the custom "to" day).
function periodRange(key: string, fromStr: string, toStr: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  let start = new Date();
  let end = new Date(); end.setHours(23, 59, 59, 999);
  switch (key) {
    case "today": start.setHours(0, 0, 0, 0); break;
    case "7d": start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); break;
    case "1m": start.setMonth(now.getMonth() - 1); start.setHours(0, 0, 0, 0); break;
    case "3m": start.setMonth(now.getMonth() - 3); start.setHours(0, 0, 0, 0); break;
    case "6m": start.setMonth(now.getMonth() - 6); start.setHours(0, 0, 0, 0); break;
    case "1y": start.setFullYear(now.getFullYear() - 1); start.setHours(0, 0, 0, 0); break;
    case "all": start = new Date(0); break;
    case "custom":
      start = fromStr ? new Date(`${fromStr}T00:00:00`) : new Date(0);
      end = toStr ? new Date(`${toStr}T23:59:59`) : end;
      break;
  }
  const label = key === "all" ? "All time" : `${start.toLocaleDateString("en-GB")} – ${end.toLocaleDateString("en-GB")}`;
  return { start, end, label };
}

// Split a customer's activity into: the balance carried into the period, charges
// raised inside it, and payments received inside it (from any bill, or on account).
function buildPeriodData(c: Detail, start: Date, end: Date): { charges: PeriodCharge[]; payments: PeriodPayment[]; broughtForward: number } {
  const s = +start, e = +end;
  const within = (iso: string) => { const t = +new Date(iso); return t >= s && t <= e; };
  const before = (iso: string) => +new Date(iso) < s;
  const charges: PeriodCharge[] = c.invoices
    .filter((i) => within(i.createdAt))
    .map((i) => ({ date: i.createdAt, name: i.name, amount: Number(i.total) || 0, status: i.status }));
  const payments: PeriodPayment[] = [];
  for (const i of c.invoices) for (const p of i.paymentEntries) if (within(p.date)) payments.push({ date: p.date, label: i.name, method: p.method, amount: Number(p.amount) || 0 });
  for (const p of c.ledger.payments) if (within(p.date)) payments.push({ date: p.date, label: "On account", method: p.method, amount: Number(p.amount) || 0 });
  // Balance carried in = old opening balance + everything charged before the
  // period − everything paid before the period.
  let chargedBefore = 0, paidBefore = 0;
  for (const i of c.invoices) if (before(i.createdAt)) chargedBefore += Number(i.total) || 0;
  for (const i of c.invoices) for (const p of i.paymentEntries) if (before(p.date)) paidBefore += Number(p.amount) || 0;
  for (const p of c.ledger.payments) if (before(p.date)) paidBefore += Number(p.amount) || 0;
  const broughtForward = (c.openingBalance || 0) + chargedBefore - paidBefore;
  return { charges, payments, broughtForward };
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const canSeeFinance = useCanSeeFinance();
  const [c, setC] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [invFilter, setInvFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [invSort, setInvSort] = useState<"new" | "old" | "high">("new");
  const [invQ, setInvQ] = useState("");
  const [payMethod, setPayMethod] = useState("all");
  const [outDoc, setOutDoc] = useState<jsPDF | null>(null);
  const [todayBusy, setTodayBusy] = useState("");
  const [todayMsg, setTodayMsg] = useState("");

  type TodayData = { name: string; email: string; phone: string; todayTotal: number; todayPaid: number; todayOutstanding: number; accountOutstanding: number; bills: ItemisedBill[] };
  type TodayResp = { t: TodayData; shareUrl: string; waConfigured: boolean };
  async function loadToday(): Promise<TodayResp | null> {
    const res = await fetch(`/api/customers/${id}/today`);
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed to load today's statement.");
    const t = d.today as TodayData | null;
    if (!t || !t.bills.length) { setTodayMsg("No bills for this customer today."); return null; }
    return { t, shareUrl: `${SITE_URL}${d.shareUrl}`, waConfigured: !!d.waConfigured };
  }

  async function generateToday() {
    setTodayBusy("gen"); setTodayMsg("");
    try {
      const r = await loadToday();
      if (!r) return;
      const t = r.t;
      const doc = buildCustomerDayItemisedDoc(t.name, t.bills,
        { todayTotal: t.todayTotal, todayPaid: t.todayPaid, todayOutstanding: t.todayOutstanding, accountOutstanding: t.accountOutstanding },
        { dateLabel: new Date().toLocaleDateString("en-GB"), business: await loadBusiness() });
      setOutDoc(doc);
    } catch (e) { setTodayMsg(e instanceof Error ? e.message : "Failed."); } finally { setTodayBusy(""); }
  }

  async function sendToday() {
    if (!confirm("Send this customer their today's itemised statement?")) return;
    setTodayBusy("send"); setTodayMsg("");
    try {
      const r = await loadToday();
      if (!r) return;
      const { t, shareUrl, waConfigured } = r;
      const dateLabel = new Date().toLocaleDateString("en-GB");
      const doc = buildCustomerDayItemisedDoc(t.name, t.bills,
        { todayTotal: t.todayTotal, todayPaid: t.todayPaid, todayOutstanding: t.todayOutstanding, accountOutstanding: t.accountOutstanding },
        { dateLabel, business: await loadBusiness() });
      const pdfBase64 = doc.output("datauristring").split("base64,").pop();
      const filename = `${t.name.replace(/[^\w-]/g, "_")}_${dateLabel.replace(/\//g, "-")}.pdf`;
      let sent = "";
      if (t.email) {
        const er = await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: t.email, subject: `Your account summary — ${dateLabel}`, message: `Hi ${t.name}, your itemised summary for ${dateLabel} is attached.\nToday's total: £${t.todayTotal.toFixed(2)} · Total outstanding: £${t.accountOutstanding.toFixed(2)}`, pdfBase64, filename }) });
        if (er.ok) sent += "email ";
      }
      if (t.phone) {
        const list = t.bills.map((b) => `• ${b.invoiceNo}: ${b.lines.map((l) => `${l.quantity}× ${l.title}`).join(", ")} = £${Number(b.total).toFixed(2)}${b.status === "COMPLETED" ? " (paid)" : ""}`).join("\n");
        const text = `Hi ${t.name}, today's summary from ${BUSINESS.name}:\n${list}\n\nToday's total: £${t.todayTotal.toFixed(2)}\nReceived today: £${t.todayPaid.toFixed(2)}\nToday's bills unpaid: £${t.todayOutstanding.toFixed(2)}\nTotal outstanding: £${t.accountOutstanding.toFixed(2)}`;
        if (waConfigured) {
          const wr = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: t.phone, message: `${text}\n\nView / download: ${shareUrl}` }) });
          if (wr.ok) sent += "WhatsApp";
        } else {
          // No WhatsApp API yet → open WhatsApp click-to-send with the text + PDF link.
          const digits = t.phone.replace(/[^0-9]/g, "");
          window.open(`https://wa.me/${digits}?text=${encodeURIComponent(`${text}\n\nView / download: ${shareUrl}`)}`, "_blank");
          sent += "WhatsApp";
        }
      }
      setTodayMsg(sent.trim() ? `Sent via ${sent.trim().replace(/\s+/, " + ")}.` : "No email or phone on file to send to.");
    } catch (e) { setTodayMsg(e instanceof Error ? e.message : "Failed."); } finally { setTodayBusy(""); }
  }

  // Signed public link to the full account statement (all bills + all payments).
  const [shareUrl, setShareUrl] = useState("");
  const [stmtBusy, setStmtBusy] = useState("");
  const [stmtMsg, setStmtMsg] = useState("");

  // Send the FULL account statement: every bill (paid and unpaid), every payment
  // received, and the balance still owed.
  async function sendStatement() {
    if (!c) return;
    if (!confirm("Send this customer their full account statement — all bills, all payments and the balance owed?")) return;
    setStmtBusy("send"); setStmtMsg("");
    try {
      const biz = await loadBusiness();
      const input = { customerName: c.name || c.company || "Customer", company: c.company, email: c.email, phone: c.phone, invoices: c.invoices, openingBalance: c.openingBalance, payments: c.ledger.payments };
      const doc = buildStatementDoc(input, biz);
      const pdfBase64 = doc.output("datauristring").split("base64,").pop();
      const summary = `Total billed: £${billed.toFixed(2)}\nTotal paid: £${paid.toFixed(2)}\nStill outstanding: £${outstanding.toFixed(2)}`;
      let sent = "";
      if (c.email) {
        const er = await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.email, subject: `Your account statement — ${BUSINESS.name}`, message: `Hi ${c.name}, your full account statement is attached.\n${summary}`, pdfBase64, filename: statementFilename(input) }) });
        if (er.ok) sent += "email ";
      }
      if (c.phone) {
        const text = `Hi ${c.name}, your account statement from ${BUSINESS.name}:\n${summary}${shareUrl ? `\n\nView / download: ${shareUrl}` : ""}`;
        const wr = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: c.phone, message: text }) });
        if (!wr.ok) {
          // No WhatsApp API configured — fall back to click-to-send.
          window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
        }
        sent += "WhatsApp";
      }
      setStmtMsg(sent.trim() ? `Statement sent via ${sent.trim().replace(/\s+/, " + ")}.` : "No email or phone on file to send to.");
    } catch (e) { setStmtMsg(e instanceof Error ? e.message : "Failed to send."); } finally { setStmtBusy(""); }
  }

  function load() {
    setLoading(true);
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setC(d.customer); setShareUrl(d.accountShareUrl ? `${SITE_URL}${d.accountShareUrl}` : ""); }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  if (loading) return <div className="px-8 py-7 text-sm text-neutral-400">Loading…</div>;
  if (error) return <div className="px-8 py-7"><p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p></div>;
  if (!c) return null;

  const invoiceTotal = c.invoices.reduce((s, i) => s + Number(i.total || 0), 0);
  // Unpaid portion of invoices (completed invoices already count as fully paid).
  const invoiceOutstanding = c.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
  const ledgerPaid = c.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const billed = c.openingBalance + invoiceTotal;
  // Paid = what's settled on invoices (completed + partial) + on-account payments.
  const paid = invoiceTotal - invoiceOutstanding + ledgerPaid;
  // Owed = old opening balance + still-unpaid invoices − on-account payments received.
  const outstanding = c.openingBalance + invoiceOutstanding - ledgerPaid;

  // --- Invoices: filter + search + sort ---
  const shownInvoices = c.invoices
    .filter((i) => {
      if (invFilter === "paid" && i.balance > 0.001) return false;
      if (invFilter === "unpaid" && i.balance <= 0.001) return false;
      if (invQ.trim()) return i.name.toLowerCase().includes(invQ.trim().toLowerCase());
      return true;
    })
    .sort((a, b) =>
      invSort === "high"
        ? Number(b.total) - Number(a.total)
        : invSort === "old"
          ? +new Date(a.createdAt) - +new Date(b.createdAt)
          : +new Date(b.createdAt) - +new Date(a.createdAt),
    );

  // --- Payments: combine on-account credits + per-invoice payments so received
  // money stays visible after it's applied to bills. Account payments keep their
  // ledger index for edit/revoke; invoice payments link back to the invoice. ---
  const accountPays: CombinedPay[] = c.ledger.payments.map((p, i) => ({ ...p, source: "account", ledgerIndex: i }));
  const invoicePays: CombinedPay[] = c.invoices.flatMap((inv) =>
    inv.paymentEntries.map((p) => ({ ...p, source: "invoice", invoiceName: inv.name, invoiceId: inv.id })),
  );
  const allPays = [...accountPays, ...invoicePays];
  const methods = Array.from(new Set(allPays.map((p) => p.method)));
  const shownPayments = allPays
    .filter((p) => payMethod === "all" || p.method === payMethod)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const shownPaymentsTotal = shownPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  async function paymentAction(body: Record<string, unknown>) {
    const res = await fetch(`/api/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) { setError(d.error || "Failed"); return; }
    load();
  }
  async function revokePayment(index: number) {
    if (!confirm("Revoke (delete) this payment? The customer's outstanding will be recalculated.")) return;
    await paymentAction({ action: "removePayment", index });
  }
  async function reapplyCredits() {
    if (!confirm("Move all 'on account' credit onto this customer's open bills, oldest first? Bills it covers are marked paid; the oldest one it can't cover is part-paid. Outstanding total stays the same.")) return;
    await paymentAction({ action: "reapplyCredits" });
  }

  return (
    <div className="px-8 py-7">
      <Link href="/portal/customers" className="text-sm text-neutral-500 hover:text-neutral-900">← Customers</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{c.name || "(no name)"}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {c.company && <span className="font-medium text-neutral-700 dark:text-neutral-300">{c.company} · </span>}
            {c.email || "no email"}{c.phone ? ` · ${c.phone}` : ""}
          </p>
          {c.address.length > 0 && <p className="mt-0.5 text-sm text-neutral-400">{c.address.join(", ")}</p>}
          {c.openingBalance > 0 && <p className="mt-0.5 text-xs text-amber-600">Opening balance brought forward: £{c.openingBalance.toFixed(2)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200">{editing ? "Close" : "✏ Edit"}</button>
          <button
            onClick={() => void downloadFile(`/api/customers/${id}/export`, "customer.xlsx").catch((e) => setError(e instanceof Error ? e.message : "Export failed."))}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200"
            title="Download this customer's full record (profile, invoices, payments) as Excel"
          >
            ⬇ Export data
          </button>
          <button
            onClick={async () => generateStatementPdf({ customerName: c.name || "Customer", company: c.company, email: c.email, phone: c.phone, invoices: c.invoices, openingBalance: c.openingBalance, payments: c.ledger.payments }, await loadBusiness())}
            disabled={c.invoices.length === 0 && c.openingBalance <= 0}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
          >
            📄 Statement
          </button>
          <button
            onClick={sendStatement}
            disabled={!!stmtBusy || (c.invoices.length === 0 && c.openingBalance <= 0)}
            title="Email the full statement (all bills + all payments + balance) and WhatsApp the customer a link"
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200"
          >
            {stmtBusy === "send" ? "Sending…" : "📤 Send statement"}
          </button>
          <button onClick={generateToday} disabled={!!todayBusy} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200" title="Preview / download this customer's itemised bills for today">
            {todayBusy === "gen" ? "…" : "📅 Today's statement"}
          </button>
          <button onClick={sendToday} disabled={!!todayBusy} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-60" title="Email the PDF + WhatsApp this customer their today's summary">
            {todayBusy === "send" ? "Sending…" : "📤 Send today"}
          </button>
          {outstanding > 0.001 && (
            <button
              onClick={async () => setOutDoc(buildOutstandingInvoiceDoc(c, outstanding, await loadBusiness()))}
              className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-500/10"
            >
              🧾 Invoice outstanding (£{outstanding.toFixed(2)})
            </button>
          )}
          <Link
            href={`/portal/billing?customer=${id}`}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900"
          >
            + New bill
          </Link>
        </div>
      </div>

      {stmtMsg && <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">{stmtMsg}</p>}
      {todayMsg && <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">{todayMsg}</p>}

      {editing && <EditCard customerId={id} c={c} onSaved={() => { setEditing(false); load(); }} />}
      <SegmentEditor customerId={id} current={c.segments} onSaved={load} />
      {c.segments.includes("online") && <TradeCodeCard customerId={id} code={c.tradeCode} onSaved={load} />}

      <FinanceLockBar label="This customer's billed / paid totals" />
      <div className={`mt-6 grid grid-cols-2 gap-4 ${canSeeFinance ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        {canSeeFinance && <Stat label="Total billed" value={billed} />}
        {canSeeFinance && <Stat label="Total paid" value={paid} tone="emerald" />}
        <Stat label={outstanding < -0.001 ? "Account credit" : "Outstanding"} value={Math.abs(outstanding)} tone={outstanding > 0.001 ? "red" : "emerald"} />
        <Stat label="Invoices" raw={c.invoices.length} />
      </div>

      <PeriodStatementCard c={c} />

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        {/* Invoices */}
        <section className="flex max-h-[520px] flex-col rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Invoices <span className="text-sm font-normal text-neutral-400">({shownInvoices.length})</span></h2>
              <Link href={`/portal/billing?customer=${id}`} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">+ New</Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
                {(["all", "unpaid", "paid"] as const).map((f) => (
                  <button key={f} onClick={() => setInvFilter(f)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${invFilter === f ? "bg-neutral-900 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{f}</button>
                ))}
              </div>
              <select value={invSort} onChange={(e) => setInvSort(e.target.value as "new" | "old" | "high")} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                <option value="new">Newest</option>
                <option value="old">Oldest</option>
                <option value="high">Highest £</option>
              </select>
              <input value={invQ} onChange={(e) => setInvQ(e.target.value)} placeholder="Search #" className="w-24 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto px-4 dark:divide-neutral-800">
            {shownInvoices.map((i) => (
              <Link key={i.id} href={`/portal/invoices/${i.id.split("/").pop()}`} className="flex items-center justify-between py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">{i.name}</p>
                  <p className="text-xs text-neutral-500">{new Date(i.createdAt).toLocaleDateString("en-GB")} · {invoiceStatus(i).label}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">£{i.total}</p>
                  {i.balance > 0.001 ? (
                    <p className="text-xs text-red-600">£{i.balance.toFixed(2)} due</p>
                  ) : i.amountPaid > 0 ? (
                    <p className="text-xs text-emerald-600">paid</p>
                  ) : null}
                </div>
              </Link>
            ))}
            {shownInvoices.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{c.invoices.length === 0 ? "No invoices yet." : "None match this filter."}</p>}
          </div>
        </section>

        {/* Payments */}
        <section className="flex max-h-[520px] flex-col rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Payment history</h2>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10">Received £{shownPaymentsTotal.toFixed(2)}</span>
            </div>
            {c.ledger.payments.length > 0 && outstanding > 0.001 && (
              <button
                onClick={reapplyCredits}
                title="Move this on-account credit onto the customer's open bills (marks coverable bills paid, part-pays the rest)"
                className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-500/10"
              >
                ↻ Re-apply account credit to bills
              </button>
            )}
            {methods.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button onClick={() => setPayMethod("all")} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${payMethod === "all" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"}`}>All</button>
                {methods.map((m) => (
                  <button key={m} onClick={() => setPayMethod(m)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${payMethod === m ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"}`}>{m}</button>
                ))}
              </div>
            )}
            <RecordPayment customerId={id} customer={c} outstanding={outstanding} onAdded={load} />
          </div>
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto px-4 dark:divide-neutral-800">
            {shownPayments.map((p, idx) => (
              <div key={`${p.source}-${p.ledgerIndex ?? p.invoiceId ?? ""}-${idx}`} className="group relative flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">£{Number(p.amount).toFixed(2)} <span className="font-normal text-neutral-500">· {p.method}</span></p>
                  <p className="truncate text-xs text-neutral-500">
                    {new Date(p.date).toLocaleDateString("en-GB")}
                    {" · "}
                    {p.source === "invoice"
                      ? <Link href={`/portal/invoices/${(p.invoiceId || "").split("/").pop()}`} className="text-amber-600 hover:underline">{p.invoiceName}</Link>
                      : <span className="text-neutral-400">On account</span>}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                {p.source === "account" && p.ledgerIndex !== undefined ? (
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <EditPaymentButton payment={p} onSave={(patch) => paymentAction({ action: "editPayment", index: p.ledgerIndex, ...patch })} />
                    <button onClick={() => revokePayment(p.ledgerIndex!)} className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50" title="Revoke / delete this payment">Revoke</button>
                  </div>
                ) : (
                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10" title="Recorded against this bill — manage it on the invoice">on bill</span>
                )}
              </div>
            ))}
            {shownPayments.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{allPays.length === 0 ? "No payments recorded." : "None match this filter."}</p>}
          </div>
        </section>
      </div>

      {outDoc && (
        <PdfPreviewModal
          doc={outDoc}
          filename={`${BRAND_SLUG}-outstanding-${(c.name || "customer").replace(/[^\w-]/g, "_")}.pdf`}
          title="Outstanding balance invoice"
          subtitle={`£${outstanding.toFixed(2)} due · ${c.name}`}
          onClose={() => setOutDoc(null)}
        />
      )}
    </div>
  );
}

// Account statement for a chosen period — preview/download or send by email +
// WhatsApp. Shows the balance brought into the period, activity within it, and
// the closing balance, so a customer can see exactly what happened in that time.
function PeriodStatementCard({ c }: { c: Detail }) {
  const [period, setPeriod] = useState("1m");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [doc, setDoc] = useState<jsPDF | null>(null);

  function compute() {
    const { start, end, label } = periodRange(period, from, to);
    const { charges, payments, broughtForward } = buildPeriodData(c, start, end);
    const input = {
      customerName: c.name || c.company || "Customer",
      company: c.company, email: c.email, phone: c.phone,
      periodLabel: label, broughtForward, charges, payments,
    };
    return { input, label };
  }

  async function preview() {
    setBusy("gen"); setMsg("");
    try {
      const { input } = compute();
      if (!input.charges.length && !input.payments.length && Math.abs(input.broughtForward) < 0.001) { setMsg("No activity in this period."); return; }
      setDoc(buildPeriodStatementDoc(input, await loadBusiness()));
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  }

  async function send() {
    const { input, label } = compute();
    if (!input.charges.length && !input.payments.length && Math.abs(input.broughtForward) < 0.001) { setMsg("No activity in this period."); return; }
    if (!c.email && !c.phone) { setMsg("No email or phone on file to send to."); return; }
    if (!confirm(`Send ${c.name || "this customer"} their account statement for ${label}?`)) return;
    setBusy("send"); setMsg("");
    try {
      const pdf = buildPeriodStatementDoc(input, await loadBusiness());
      const pdfBase64 = pdf.output("datauristring").split("base64,").pop();
      const filename = periodStatementFilename(input.customerName, label);
      const chargesTotal = input.charges.reduce((a, x) => a + x.amount, 0);
      const paymentsTotal = input.payments.reduce((a, x) => a + x.amount, 0);
      const closing = input.broughtForward + chargesTotal - paymentsTotal;
      const summary = `Period: ${label}\nBrought forward: £${input.broughtForward.toFixed(2)}\nCharges: £${chargesTotal.toFixed(2)}\nPayments: £${paymentsTotal.toFixed(2)}\nBalance now: £${closing.toFixed(2)}`;
      let sent = "";
      if (c.email) {
        const er = await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: c.email, subject: `Your account statement (${label}) — ${BUSINESS.name}`, message: `Hi ${c.name}, your account statement for ${label} is attached.\n${summary}`, pdfBase64, filename }) });
        if (er.ok) sent += "email ";
      }
      if (c.phone) {
        const text = `Hi ${c.name}, your account statement from ${BUSINESS.name}:\n${summary}`;
        const wr = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: c.phone, message: text }) });
        if (!wr.ok) window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
        sent += "WhatsApp";
      }
      setMsg(sent.trim() ? `Statement sent via ${sent.trim().replace(/\s+/, " + ")}.` : "No email or phone on file to send to.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Failed to send."); } finally { setBusy(""); }
  }

  const sel = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">📄 Account statement for period:</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={sel}>
          {STATEMENT_PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} title="From" />
            <span className="text-sm text-neutral-400">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} title="To" />
          </>
        )}
        <button onClick={preview} disabled={!!busy} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
          {busy === "gen" ? "…" : "Preview / download"}
        </button>
        <button onClick={send} disabled={!!busy} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400 disabled:opacity-60" title="Email the PDF + WhatsApp the customer this period's statement">
          {busy === "send" ? "Sending…" : "📤 Send"}
        </button>
      </div>
      {msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10">{msg}</p>}
      {doc && (
        <PdfPreviewModal
          doc={doc}
          filename={periodStatementFilename(c.name || "customer", periodRange(period, from, to).label)}
          title="Account statement"
          subtitle={`${c.name} · ${periodRange(period, from, to).label}`}
          onClose={() => setDoc(null)}
        />
      )}
    </div>
  );
}

// A proper branded invoice for the customer's current outstanding balance —
// one line, total = amount due. A document to hand over; it does not create a
// new billable order (the debt already comes from existing invoices).
function buildOutstandingInvoiceDoc(c: Detail, outstanding: number, business: import("@/lib/business").Business): jsPDF {
  const today = new Date();
  const amt = outstanding.toFixed(2);
  const inv: InvoiceDetail = {
    id: "",
    name: `OUTSTANDING-${today.toISOString().slice(0, 10)}`,
    invoiceNo: `BAL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
    status: "OPEN",
    createdAt: today.toISOString(),
    note: "This invoice reflects the total outstanding balance on the account. Please settle at your earliest convenience.",
    currency: "GBP",
    customerName: c.name || "Customer",
    customerEmail: c.email,
    customerPhone: c.phone,
    billingAddress: [c.company, ...c.address].filter(Boolean) as string[],
    lines: [{ variantId: null, title: `Outstanding balance as of ${today.toLocaleDateString("en-GB")}`, sku: "", quantity: 1, unitPrice: amt, lineTotal: amt, image: null }],
    subtotal: amt,
    discount: "0.00",
    tax: "0.00",
    total: amt,
    taxExempt: true,
    payments: [],
    amountPaid: 0,
    balance: outstanding,
    voided: false,
    invoiceUrl: null,
    payMethod: null,
    paidMethod: null,
  };
  return buildInvoiceDoc(inv, business);
}

function EditPaymentButton({ payment, onSave }: { payment: { amount: number; method: string; note: string }; onSave: (patch: { amount: number; method: string; note: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method || "cash");
  const [note, setNote] = useState(payment.note || "");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Edit this payment">Edit</button>;
  return (
    <div className="absolute right-4 z-20 mt-1 w-60 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
      <div className="space-y-2">
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800" placeholder="Amount £" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          <option value="cash">Cash</option><option value="card">Card</option><option value="bank transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800" placeholder="Note" />
        <div className="flex gap-2">
          <button onClick={() => { const a = Number(amount); if (!a || a <= 0) return; onSave({ amount: a, method, note }); setOpen(false); }} className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 hover:text-neutral-900">Save</button>
          <button onClick={() => setOpen(false)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function SegmentEditor({ customerId, current, onSaved }: { customerId: string; current: SegmentKey[]; onSaved: () => void }) {
  const [sel, setSel] = useState<SegmentKey[]>(current);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const changed = sel.slice().sort().join(",") !== current.slice().sort().join(",");

  function toggle(k: SegmentKey) {
    setSel((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }
  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: sel }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Segment:</span>
      {SEGMENTS.map((s) => (
        <button
          key={s.key}
          onClick={() => toggle(s.key)}
          title={s.desc}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            sel.includes(s.key) ? s.badge : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
          }`}
        >
          {sel.includes(s.key) ? "✓ " : ""}{s.label}
        </button>
      ))}
      {changed && (
        <button onClick={save} disabled={saving} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
          {saving ? "…" : "Save"}
        </button>
      )}
      {msg && <span className="text-xs text-neutral-400">{msg}</span>}
    </div>
  );
}

function EditCard({ customerId, c, onSaved }: { customerId: string; c: Detail; onSaved: () => void }) {
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, note: c.note, openingBalance: String(c.openingBalance || "") });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  function set(k: keyof typeof f, v: string) { setF((p) => ({ ...p, [k]: v })); }
  async function save() {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update: { ...f, openingBalance: f.openingBalance ? Number(f.openingBalance) : 0 } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  }
  const inp = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (<label className="block"><span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>{children}</label>);
  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Edit customer</h2>
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <F label="First name"><input className={inp} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></F>
        <F label="Last name"><input className={inp} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></F>
        <F label="Company"><input className={inp} value={f.company} onChange={(e) => set("company", e.target.value)} /></F>
        <F label="Email"><input className={inp} value={f.email} onChange={(e) => set("email", e.target.value)} /></F>
        <F label="Phone"><input className={inp} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 7911 123456" /></F>
        <F label="Opening balance (£)"><input type="number" step="0.01" className={inp} value={f.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} /></F>
        <div className="sm:col-span-2"><F label="Note"><input className={inp} value={f.note} onChange={(e) => set("note", e.target.value)} /></F></div>
      </div>
      <button onClick={save} disabled={saving} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
    </div>
  );
}

function TradeCodeCard({ customerId, code, onSaved }: { customerId: string; code: string; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generateTradeCode" }) });
      if (res.ok) onSaved();
    } finally { setBusy(false); }
  }
  function copy() { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">🔑 Storefront trade code:</span>
      {code ? (
        <>
          <button onClick={copy} className="rounded-lg border border-emerald-300 bg-white px-3 py-1 font-mono text-sm font-semibold tracking-widest text-emerald-700 dark:bg-neutral-900" title="Copy">{code}</button>
          {copied && <span className="text-xs text-emerald-600">copied</span>}
          <button onClick={generate} disabled={busy} className="text-xs text-neutral-500 hover:text-neutral-900">{busy ? "…" : "Regenerate"}</button>
        </>
      ) : (
        <button onClick={generate} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? "…" : "Generate code"}</button>
      )}
      <span className="text-xs text-neutral-400">Give this to the customer — they log in with their email + this code to see wholesale prices online.</span>
    </div>
  );
}

function Stat({ label, value, raw, tone }: { label: string; value?: number; raw?: number; tone?: "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-neutral-900";
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${color}`}>
        {raw !== undefined ? raw : `£${(value ?? 0).toFixed(2)}`}
      </p>
    </div>
  );
}

function RecordPayment({ customerId, customer, outstanding, onAdded }: { customerId: string; customer: Detail; outstanding: number; onAdded: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // Held after a successful payment so staff can hand the customer a receipt.
  const [receipt, setReceipt] = useState<ReceiptInput | null>(null);
  const [rBusy, setRBusy] = useState("");

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, note, date: new Date().toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      const settled = (d.allocation?.settled ?? []) as { name: string }[];
      const partial = d.allocation?.partial as { name: string; amount: number } | null | undefined;
      const credit = Number(d.allocation?.creditedToAccount ?? 0);
      const parts: string[] = [];
      if (settled.length) parts.push(`paid ${settled.length} bill(s): ${settled.map((s) => s.name).join(", ")}`);
      if (partial) parts.push(`£${partial.amount.toFixed(2)} part-paid on ${partial.name}`);
      if (credit > 0.001) parts.push(`£${credit.toFixed(2)} on account`);
      setOkMsg(parts.length ? `Applied — ${parts.join(" · ")}.` : "Payment recorded.");
      const settledFull = (d.allocation?.settled ?? []) as { name: string; amount: number }[];
      setReceipt({
        customerName: customer.name || customer.company || "Customer",
        company: customer.company, email: customer.email, phone: customer.phone,
        amount: amt, method, date: new Date().toISOString(), note,
        applied: [
          ...settledFull.map((x) => ({ name: x.name, amount: Number(x.amount) || 0, kind: "settled" as const })),
          ...(partial ? [{ name: partial.name, amount: Number(partial.amount) || 0, kind: "part" as const }] : []),
        ],
        creditedToAccount: credit,
        balanceBefore: outstanding,
        balanceAfter: Math.max(0, outstanding - amt),
      });
      setAmount("");
      setNote("");
      onAdded();
      setTimeout(() => setOkMsg(""), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function downloadReceipt() {
    if (!receipt) return;
    setRBusy("dl");
    try { buildReceiptDoc(receipt, await loadBusiness()).save(receiptFilename(receipt)); } finally { setRBusy(""); }
  }

  async function sendReceipt() {
    if (!receipt) return;
    setRBusy("send"); setError("");
    try {
      const doc = buildReceiptDoc(receipt, await loadBusiness());
      const pdfBase64 = doc.output("datauristring").split("base64,").pop();
      const line = `We received £${receipt.amount.toFixed(2)} (${receipt.method}). ${receipt.balanceAfter > 0.001 ? `Still outstanding: £${receipt.balanceAfter.toFixed(2)}.` : "Your account is now fully settled."}`;
      let sent = "";
      if (receipt.email) {
        const er = await fetch("/api/email/invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: receipt.email, subject: `Payment received — thank you`, message: `Hi ${receipt.customerName}, ${line}`, pdfBase64, filename: receiptFilename(receipt) }) });
        if (er.ok) sent += "email ";
      }
      if (receipt.phone) {
        const text = `Hi ${receipt.customerName}, ${line} — ${BUSINESS.name}`;
        const wr = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: receipt.phone, message: text }) });
        if (!wr.ok) window.open(`https://wa.me/${receipt.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`, "_blank");
        sent += "WhatsApp";
      }
      setOkMsg(sent.trim() ? `Receipt sent via ${sent.trim().replace(/\s+/, " + ")}.` : "No email or phone on file.");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send the receipt."); } finally { setRBusy(""); }
  }

  const input = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mt-3 rounded-xl bg-neutral-50 p-3">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {okMsg && <p className="mb-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">{okMsg}</p>}
      {receipt && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Receipt for £{receipt.amount.toFixed(2)} ready
          </span>
          <button onClick={downloadReceipt} disabled={!!rBusy} className="rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {rBusy === "dl" ? "…" : "📄 Download"}
          </button>
          <button onClick={sendReceipt} disabled={!!rBusy} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {rBusy === "send" ? "Sending…" : "📤 Send receipt"}
          </button>
          <button onClick={() => setReceipt(null)} className="ml-auto text-xs text-emerald-700/60 hover:text-emerald-900">dismiss</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} w-28`}
          type="number"
          step="0.01"
          placeholder="Amount £"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank transfer">Bank transfer</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
        <input className={`${input} flex-1`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
        >
          {saving ? "…" : "Record payment"}
        </button>
      </div>
      {outstanding > 0 && (
        <button onClick={() => setAmount(outstanding.toFixed(2))} className="mt-2 text-xs text-amber-600 hover:underline">
          Pay full outstanding (£{outstanding.toFixed(2)})
        </button>
      )}
    </div>
  );
}
