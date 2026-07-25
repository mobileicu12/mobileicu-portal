// End-of-day digest: each wholesale customer gets their own day summary (their
// bills today + total outstanding) by email + WhatsApp, and the owner gets an
// all-customers summary report. Customers are grouped strictly by account so one
// customer's invoices are never mixed into another's message.
import { listInvoices, type InvoiceRow } from "./billing";
import { getCustomer } from "./customers";
import { getSettings, saveSettings } from "./settings";
import { sendEmail, emailConfigured } from "./email";
import { waConfigured, sendWhatsApp } from "./whatsapp";

const gbp = (n: number) => `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
const num = (s: string) => parseFloat(s) || 0;
const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "failed");

export type DigestResult = {
  date: string;
  customersBilled: number;
  emailsSent: number;
  whatsappsSent: number;
  ownerSent: boolean;
  skipped?: "disabled" | "already-sent-today";
  errors: string[];
};

export async function runDailyDigest(opts: { force?: boolean } = {}): Promise<DigestResult> {
  const settings = await getSettings();
  const key = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  const base: DigestResult = { date: key, customersBilled: 0, emailsSent: 0, whatsappsSent: 0, ownerSent: false, errors };

  if (!opts.force && !settings.dailyDigest) return { ...base, skipped: "disabled" };
  if (!opts.force && settings.digestLastRun === key) return { ...base, skipped: "already-sent-today" };

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const todays = (await listInvoices()).filter((r) => new Date(r.createdAt) >= start);

  // Group by customer account. Walk-ins (no account) only feed the owner report.
  const byCustomer = new Map<string, InvoiceRow[]>();
  const walkins: InvoiceRow[] = [];
  for (const r of todays) {
    if (r.customerId) {
      const arr = byCustomer.get(r.customerId) ?? [];
      arr.push(r);
      byCustomer.set(r.customerId, arr);
    } else walkins.push(r);
  }

  const bizName = settings.bizName || "MOBILE ICU";
  const canWa = await waConfigured();
  const canEmail = emailConfigured();
  let emailsSent = 0, whatsappsSent = 0;
  const ownerRows: { name: string; bills: number; today: number; outstanding: number }[] = [];

  for (const [cid, rows] of byCustomer) {
    const numId = cid.split("/").pop()!;
    let detail;
    try { detail = await getCustomer(numId); } catch (e) { errors.push(`load ${numId}: ${errMsg(e)}`); continue; }

    const todayTotal = rows.reduce((s, r) => s + num(r.total), 0);
    const invoiceDue = detail.invoices.reduce((s, i) => s + Number(i.balance || 0), 0);
    const ledgerPaid = detail.ledger.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, (detail.openingBalance || 0) + invoiceDue - ledgerPaid);
    const custName = detail.name || detail.company || "Customer";
    ownerRows.push({ name: custName, bills: rows.length, today: todayTotal, outstanding });

    if (settings.digestCustomers === false) continue;

    if (detail.email && canEmail) {
      try {
        await sendEmail({
          to: detail.email,
          subject: `${bizName} — your account summary (${key})`,
          html: customerHtml(bizName, custName, rows, todayTotal, outstanding, key),
        });
        emailsSent++;
      } catch (e) { errors.push(`email ${detail.email}: ${errMsg(e)}`); }
    }
    if (detail.phone && canWa) {
      try {
        await sendWhatsApp(detail.phone, customerText(bizName, custName, rows, todayTotal, outstanding));
        whatsappsSent++;
      } catch (e) { errors.push(`whatsapp ${detail.phone}: ${errMsg(e)}`); }
    }
  }

  // ---- Owner report (everyone's summary + grand totals) ----
  const grand = todays.reduce((s, r) => s + num(r.total), 0);
  const paid = todays.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + num(r.total), 0);
  const walkTotal = walkins.reduce((s, r) => s + num(r.total), 0);
  let ownerSent = false;
  const ownerEmail = (settings.digestOwnerEmail || settings.email || "").trim();

  if (settings.digestOwner !== false && ownerEmail && canEmail) {
    try {
      await sendEmail({
        to: ownerEmail,
        subject: `${bizName} — daily report ${key}`,
        html: ownerHtml(bizName, key, todays.length, grand, paid, ownerRows, walkins.length, walkTotal),
      });
      ownerSent = true;
    } catch (e) { errors.push(`owner email: ${errMsg(e)}`); }
  }
  if (settings.digestOwner !== false && settings.digestOwnerPhone && canWa) {
    try {
      await sendWhatsApp(
        settings.digestOwnerPhone,
        `${bizName} — daily report ${key}\nBills: ${todays.length}\nSales: ${gbp(grand)}\nPaid: ${gbp(paid)}\nCustomers billed: ${byCustomer.size}${walkins.length ? `\nWalk-ins: ${walkins.length} (${gbp(walkTotal)})` : ""}`,
      );
    } catch (e) { errors.push(`owner whatsapp: ${errMsg(e)}`); }
  }

  await saveSettings({ digestLastRun: key });
  return { date: key, customersBilled: byCustomer.size, emailsSent, whatsappsSent, ownerSent, errors };
}

// ---------- message builders ----------

function customerText(biz: string, name: string, rows: InvoiceRow[], today: number, outstanding: number): string {
  const list = rows.map((r) => `• ${r.invoiceNo} — ${gbp(num(r.total))}${r.status === "COMPLETED" ? " (paid)" : ""}`).join("\n");
  return `Hi ${name},\n\nToday's summary from ${biz}:\n${list}\n\nToday's bills: ${gbp(today)}\nTotal outstanding: ${gbp(outstanding)}\n\nThank you for your business.`;
}

const WRAP = (inner: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">${inner}</div>`;
const HEAD = (biz: string, title: string, sub: string) =>
  `<div style="border-bottom:2px solid #a9791d;padding-bottom:10px;margin-bottom:16px">
     <div style="font-size:18px;font-weight:bold">${esc(biz)}</div>
     <div style="font-size:13px;color:#6b655c">${esc(title)} · ${esc(sub)}</div>
   </div>`;
const TH = 'style="text-align:left;padding:7px 8px;background:#f5f3ee;border:1px solid #e2ddd3;font-size:12px"';
const TD = 'style="padding:7px 8px;border:1px solid #e2ddd3;font-size:13px"';
const TDR = 'style="padding:7px 8px;border:1px solid #e2ddd3;font-size:13px;text-align:right"';

function customerHtml(biz: string, name: string, rows: InvoiceRow[], today: number, outstanding: number, date: string): string {
  const body = rows.map((r) =>
    `<tr><td ${TD}>${esc(r.invoiceNo)}</td><td ${TD}>${new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
       <td ${TD}>${r.status === "COMPLETED" ? "Paid" : "Unpaid"}</td><td ${TDR}>${gbp(num(r.total))}</td></tr>`,
  ).join("");
  return WRAP(`
    ${HEAD(biz, "Account summary", date)}
    <p style="font-size:14px">Hi ${esc(name)}, here is your summary for today.</p>
    <table style="border-collapse:collapse;width:100%;margin:8px 0">
      <thead><tr><th ${TH}>Invoice</th><th ${TH}>Time</th><th ${TH}>Status</th><th ${TH.replace("left", "right")}>Amount</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <table style="border-collapse:collapse;width:100%;margin-top:6px">
      <tr><td ${TD}><strong>Today's bills</strong></td><td ${TDR}><strong>${gbp(today)}</strong></td></tr>
      <tr><td ${TD}><strong>Total outstanding</strong></td><td ${TDR} ><strong style="color:${outstanding > 0 ? "#b3261e" : "#1a7f4b"}">${gbp(outstanding)}</strong></td></tr>
    </table>
    <p style="font-size:12px;color:#6b655c;margin-top:16px">Thank you for your business — ${esc(biz)}.</p>
  `);
}

function ownerHtml(
  biz: string, date: string, count: number, grand: number, paid: number,
  rows: { name: string; bills: number; today: number; outstanding: number }[],
  walkCount: number, walkTotal: number,
): string {
  const sorted = [...rows].sort((a, b) => b.today - a.today);
  const body = sorted.map((r) =>
    `<tr><td ${TD}>${esc(r.name)}</td><td ${TDR}>${r.bills}</td><td ${TDR}>${gbp(r.today)}</td><td ${TDR}>${gbp(r.outstanding)}</td></tr>`,
  ).join("") || `<tr><td ${TD} colspan="4">No account sales today.</td></tr>`;
  return WRAP(`
    ${HEAD(biz, "Daily report", date)}
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr>
        <td ${TD}><div style="font-size:11px;color:#6b655c">BILLS</div><div style="font-size:18px;font-weight:bold">${count}</div></td>
        <td ${TD}><div style="font-size:11px;color:#6b655c">TOTAL SALES</div><div style="font-size:18px;font-weight:bold">${gbp(grand)}</div></td>
        <td ${TD}><div style="font-size:11px;color:#6b655c">PAID</div><div style="font-size:18px;font-weight:bold;color:#1a7f4b">${gbp(paid)}</div></td>
      </tr>
    </table>
    <div style="font-size:13px;font-weight:bold;margin-bottom:6px">By customer</div>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr><th ${TH}>Customer</th><th ${TH.replace("left", "right")}>Bills</th><th ${TH.replace("left", "right")}>Today</th><th ${TH.replace("left", "right")}>Outstanding</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    ${walkCount ? `<p style="font-size:12px;color:#6b655c;margin-top:10px">Walk-in / one-off: ${walkCount} sale(s) · ${gbp(walkTotal)}</p>` : ""}
    <p style="font-size:12px;color:#6b655c;margin-top:16px">${esc(biz)} · automated end-of-day report.</p>
  `);
}
