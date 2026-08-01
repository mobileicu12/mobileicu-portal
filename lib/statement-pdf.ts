// Client-side customer statement PDF via jsPDF + autotable.
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";

const INK = "#1a1a1a";
const GOLD = "#a9791d";
const MUTED = "#6b655c";
const LINE = "#e2ddd3";
const LIGHT = "#f5f3ee";

function money(n: number) {
  return `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
}

export type StatementPayment = { date: string; amount: number; method: string; note?: string };

export type StatementInvoice = {
  name: string;
  createdAt: string;
  status: string;
  total: string;
  amountPaid: number;
  balance: number;
  paymentEntries?: StatementPayment[]; // payments recorded against this bill
};

export type StatementInput = {
  customerName: string;
  company?: string;
  email?: string;
  phone?: string;
  invoices: StatementInvoice[];
  openingBalance?: number;
  payments?: StatementPayment[]; // on-account (ledger) payments
};

export function generateStatementPdf(s: StatementInput, business: Business = BUSINESS) {
  void business; // customer statements are issued without seller identity
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  // Header — no logo / shop details on customer statements.
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("STATEMENT", M, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(`As at ${new Date().toLocaleDateString("en-GB")}`, pageW - M, 50, { align: "right" });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 66, pageW - M, 66);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(M, 69, pageW - M, 69);

  // Statement-to (right) — seller identity intentionally omitted.
  const y = 94;
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.text("STATEMENT FOR", pageW - M, y, { align: "right" });
  doc.setTextColor(INK);
  doc.setFontSize(11);
  doc.text(s.customerName, pageW - M, y + 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const to = [s.company, s.email, s.phone].filter(Boolean) as string[];
  to.forEach((line, i) => doc.text(line, pageW - M, y + 29 + i * 12, { align: "right" }));

  // Build a true chronological account ledger: opening balance, each invoice as a
  // full charge, and every payment (recorded against a bill OR on account) as its
  // own dated credit line — with a running balance.
  const opening = s.openingBalance || 0;
  type Entry = { date: number; seq: number; row: [string, string, string, string, string]; delta: number };
  const entries: Entry[] = [];
  const d = (t: string) => new Date(t).toLocaleDateString("en-GB");

  for (const inv of s.invoices) {
    const charge = parseFloat(inv.total) || 0;
    // Full charge on the invoice date (payments are listed separately below).
    entries.push({
      date: +new Date(inv.createdAt),
      seq: 0,
      row: [d(inv.createdAt), inv.name, inv.status === "COMPLETED" ? "Invoice (paid)" : "Invoice", money(charge), ""],
      delta: charge,
    });
    // Each payment made against this bill, itemised on its own date.
    for (const p of inv.paymentEntries || []) {
      entries.push({
        date: +new Date(p.date),
        seq: 1, // sort a same-day payment after its charge
        row: [d(p.date), `Payment — ${inv.name}${p.method && p.method !== "paid" ? ` · ${p.method}` : ""}`, "Payment", "", money(p.amount)],
        delta: -(Number(p.amount) || 0),
      });
    }
  }
  for (const p of s.payments || []) {
    entries.push({
      date: +new Date(p.date),
      seq: 1,
      row: [d(p.date), `Payment received — ${p.method}`, "On account", "", money(p.amount)],
      delta: -(Number(p.amount) || 0),
    });
  }
  entries.sort((a, b) => a.date - b.date || a.seq - b.seq);

  let running = opening;
  const body: string[][] = [];
  if (opening > 0) body.push(["", "Opening balance brought forward", "", money(opening), "", money(running)]);
  for (const e of entries) {
    running += e.delta;
    body.push([...e.row, money(running)]);
  }

  autoTable(doc, {
    startY: y + 70,
    head: [["Date", "Detail", "Type", "Charge", "Paid", "Balance"]],
    body,
    theme: "grid",
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 9, lineColor: LINE, lineWidth: 0.6 },
    bodyStyles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
    alternateRowStyles: { fillColor: "#fbfaf7" },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  const totalCharged = opening + s.invoices.reduce((s2, i) => s2 + (parseFloat(i.total) || 0), 0);
  const totalPaid = s.invoices.reduce((s2, i) => s2 + i.amountPaid, 0) + (s.payments || []).reduce((s2, p) => s2 + (Number(p.amount) || 0), 0);
  const outstanding = totalCharged - totalPaid;

  // @ts-expect-error autotable augments doc
  let ty = (doc.lastAutoTable?.finalY ?? 300) + 20;
  const right = pageW - M;
  const label = right - 150;
  const row = (l: string, v: string, bold = false, gold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 9);
    doc.setTextColor(gold ? GOLD : INK);
    doc.text(l, label, ty);
    doc.text(v, right, ty, { align: "right" });
    ty += bold ? 20 : 15;
  };
  row("Total charged", money(totalCharged));
  row("Total paid", money(totalPaid));
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(label, ty - 4, right, ty - 4);
  ty += 8;
  row("BALANCE DUE", money(outstanding), true, true);

  const footY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#e5e5e5");
  doc.setLineWidth(0.5);
  doc.line(M, footY - 14, pageW - M, footY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text("Please settle any outstanding balance at your earliest convenience.", M, footY);

  doc.save(`Statement_${s.customerName.replace(/[^\w-]/g, "_")}.pdf`);
}
