"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import { generateStatementPdf } from "@/lib/statement-pdf";
import { buildInvoiceDoc } from "@/lib/invoice-pdf";
import PdfPreviewModal from "@/components/PdfPreviewModal";
import { loadBusiness } from "@/lib/business";
import type { InvoiceDetail } from "@/lib/billing";
import type { jsPDF } from "jspdf";

type Payment = { date: string; amount: number; method: string; note: string };
type Invoice = { id: string; name: string; status: string; total: string; createdAt: string; invoiceUrl: string | null; amountPaid: number; balance: number };
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

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [invFilter, setInvFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [invSort, setInvSort] = useState<"new" | "old" | "high">("new");
  const [invQ, setInvQ] = useState("");
  const [payMethod, setPayMethod] = useState("all");
  const [outDoc, setOutDoc] = useState<jsPDF | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setC(d.customer);
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

  // --- Payments: filter by method (keep the original ledger index for edit/revoke) ---
  const methods = Array.from(new Set(c.ledger.payments.map((p) => p.method)));
  const shownPayments = c.ledger.payments
    .map((p, i) => ({ ...p, _i: i }))
    .filter((p) => payMethod === "all" || p.method === payMethod)
    .reverse();
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
            onClick={() => (window.location.href = `/api/customers/${id}/export`)}
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

      {editing && <EditCard customerId={id} c={c} onSaved={() => { setEditing(false); load(); }} />}
      <SegmentEditor customerId={id} current={c.segments} onSaved={load} />
      {c.segments.includes("online") && <TradeCodeCard customerId={id} code={c.tradeCode} onSaved={load} />}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total billed" value={billed} />
        <Stat label="Total paid" value={paid} tone="emerald" />
        <Stat label={outstanding < -0.001 ? "Account credit" : "Outstanding"} value={Math.abs(outstanding)} tone={outstanding > 0.001 ? "red" : "emerald"} />
        <Stat label="Invoices" raw={c.invoices.length} />
      </div>

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
                  <p className="text-xs text-neutral-500">{new Date(i.createdAt).toLocaleDateString("en-GB")} · {i.status === "COMPLETED" ? "Paid" : "Draft"}</p>
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
            {methods.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button onClick={() => setPayMethod("all")} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${payMethod === "all" ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"}`}>All</button>
                {methods.map((m) => (
                  <button key={m} onClick={() => setPayMethod(m)} className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${payMethod === m ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"}`}>{m}</button>
                ))}
              </div>
            )}
            <RecordPayment customerId={id} outstanding={outstanding} onAdded={load} />
          </div>
          <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto px-4 dark:divide-neutral-800">
            {shownPayments.map((p) => (
              <div key={p._i} className="group relative flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">£{Number(p.amount).toFixed(2)} <span className="font-normal text-neutral-500">· {p.method}</span></p>
                  <p className="truncate text-xs text-neutral-500">{new Date(p.date).toLocaleDateString("en-GB")}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <EditPaymentButton payment={p} onSave={(patch) => paymentAction({ action: "editPayment", index: p._i, ...patch })} />
                  <button onClick={() => revokePayment(p._i)} className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50" title="Revoke / delete this payment">Revoke</button>
                </div>
              </div>
            ))}
            {shownPayments.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{c.ledger.payments.length === 0 ? "No payments recorded." : "None match this filter."}</p>}
          </div>
        </section>
      </div>

      {outDoc && (
        <PdfPreviewModal
          doc={outDoc}
          filename={`mobileicu-outstanding-${(c.name || "customer").replace(/[^\w-]/g, "_")}.pdf`}
          title="Outstanding balance invoice"
          subtitle={`£${outstanding.toFixed(2)} due · ${c.name}`}
          onClose={() => setOutDoc(null)}
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

function RecordPayment({ customerId, outstanding, onAdded }: { customerId: string; outstanding: number; onAdded: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, method, note, date: new Date().toISOString() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setAmount("");
      setNote("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const input = "rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <div className="mt-3 rounded-xl bg-neutral-50 p-3">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
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
