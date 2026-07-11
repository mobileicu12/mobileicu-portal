// Client-side customer statement PDF via jsPDF + autotable.
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS } from "./business";

const INK = "#1a1a1a";
const GOLD = "#c8952f";
const MUTED = "#6b6b6b";

function money(n: number) {
  return `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
}

export type StatementInvoice = {
  name: string;
  createdAt: string;
  status: string;
  total: string;
  amountPaid: number;
  balance: number;
};

export type StatementInput = {
  customerName: string;
  company?: string;
  email?: string;
  phone?: string;
  invoices: StatementInvoice[];
};

export function generateStatementPdf(s: StatementInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  // Header band
  doc.setFillColor(INK);
  doc.rect(0, 0, pageW, 92, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(BUSINESS.name, M, 46);
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(BUSINESS.tagline, M, 64);
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("STATEMENT", pageW - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(GOLD);
  doc.text(new Date().toLocaleDateString("en-GB"), pageW - M, 64, { align: "right" });

  // Business (left) + Statement-to (right)
  let y = 118;
  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  const biz = [...BUSINESS.addressLines];
  if (BUSINESS.email) biz.push(BUSINESS.email);
  if (BUSINESS.website) biz.push(BUSINESS.website);
  biz.forEach((line, i) => doc.text(line, M, y + i * 13));

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

  // Table with running balance
  const sorted = [...s.invoices].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  let running = 0;
  const body = sorted.map((inv) => {
    const charge = parseFloat(inv.total) || 0;
    running += charge - inv.amountPaid;
    return [
      new Date(inv.createdAt).toLocaleDateString("en-GB"),
      inv.name,
      inv.status === "COMPLETED" ? "Paid" : "Draft",
      money(charge),
      money(inv.amountPaid),
      money(running),
    ];
  });

  autoTable(doc, {
    startY: Math.max(y + biz.length * 13, y + 60) + 10,
    head: [["Date", "Invoice", "Status", "Charge", "Paid", "Balance"]],
    body,
    theme: "grid",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: INK },
    alternateRowStyles: { fillColor: "#faf7f0" },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  const totalCharged = sorted.reduce((s2, i) => s2 + (parseFloat(i.total) || 0), 0);
  const totalPaid = sorted.reduce((s2, i) => s2 + i.amountPaid, 0);
  const outstanding = Math.max(0, totalCharged - totalPaid);

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
  doc.text(BUSINESS.bank || "Please settle any outstanding balance at your earliest convenience.", M, footY);
  doc.text(`${BUSINESS.name} · ${BUSINESS.website}`, pageW - M, footY, { align: "right" });

  doc.save(`${BUSINESS.name.replace(/\s+/g, "_")}_Statement_${s.customerName.replace(/[^\w-]/g, "_")}.pdf`);
}
