// Premium, professional A4 invoice PDF via jsPDF + autotable.
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import type { InvoiceDetail } from "./billing";

const INK = "#14110e";
const INK_SOFT = "#6b655c";
const GOLD = "#c8952f";
const LINE = "#e7e3db";
const CREAM = "#faf7f0";
const GREEN = "#1a7f4b";

function sym(cur: string) {
  return cur === "GBP" ? "£" : cur === "USD" ? "$" : cur === "EUR" ? "€" : "";
}
function money(n: string | number, cur = "GBP") {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `${sym(cur)}${(isNaN(v) ? 0 : v).toFixed(2)}`;
}

export function generateInvoicePdf(inv: InvoiceDetail, biz: Business = BUSINESS) {
  const B = biz;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const isVat = !inv.taxExempt;
  const cur = inv.currency || "GBP";
  const invNo = inv.invoiceNo || inv.name;
  const isPaid = inv.status === "COMPLETED" || (inv.balance <= 0.001 && inv.amountPaid > 0);

  // ============ HEADER BAND ============
  doc.setFillColor(INK);
  doc.rect(0, 0, W, 116, "F");

  // Monogram badge
  doc.setFillColor(GOLD);
  doc.circle(M + 16, 50, 18, "F");
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("MI", M + 16, 55, { align: "center" });

  // Business name + tagline
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(B.name, M + 44, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GOLD);
  doc.text(B.tagline, M + 44, 62);

  // Invoice label + number (right)
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(isVat ? "VAT INVOICE" : "INVOICE", W - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(GOLD);
  doc.text(invNo, W - M, 66, { align: "right" });
  doc.setTextColor("#cfc9bf");
  doc.setFontSize(8.5);
  doc.text(`Issued ${new Date(inv.createdAt).toLocaleDateString("en-GB")}`, W - M, 82, { align: "right" });

  // ============ FROM / BILL TO ============
  let y = 150;
  // FROM (left)
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("FROM", M, y);
  doc.setTextColor(INK);
  doc.setFontSize(11);
  doc.text(B.name, M, y + 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  const from = [...B.addressLines];
  if (B.email) from.push(B.email);
  if (B.phone) from.push(B.phone);
  if (B.website) from.push(B.website);
  if (isVat && B.vatNumber) from.push(`VAT No: ${B.vatNumber}`);
  from.forEach((l, i) => doc.text(l, M, y + 29 + i * 12));

  // BILL TO (right card)
  const cardX = W / 2 + 10;
  const cardW = W - M - cardX;
  const toLines = [...inv.billingAddress];
  if (inv.customerEmail) toLines.push(inv.customerEmail);
  if (inv.customerPhone) toLines.push(inv.customerPhone);
  const cardH = 44 + toLines.length * 12;
  doc.setFillColor(CREAM);
  doc.setDrawColor(LINE);
  doc.roundedRect(cardX, y - 14, cardW, cardH, 8, 8, "FD");
  const cx = cardX + 16;
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("BILL TO", cx, y + 2);
  doc.setTextColor(INK);
  doc.setFontSize(11);
  doc.text(inv.customerName, cx, y + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(INK_SOFT);
  toLines.forEach((l, i) => doc.text(l, cx, y + 31 + i * 12));

  // ============ STATUS PILL ============
  const pillLabel = isPaid ? "PAID" : "DUE";
  const pillColor = isPaid ? GREEN : GOLD;
  const startY = Math.max(y + 29 + from.length * 12, y - 14 + cardH) + 24;
  doc.setFillColor(pillColor);
  doc.roundedRect(M, startY - 11, 52, 17, 8.5, 8.5, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(pillLabel, M + 26, startY, { align: "center" });
  doc.setTextColor(INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Invoice ${invNo}  ·  ${new Date(inv.createdAt).toLocaleDateString("en-GB")}${inv.name && inv.name !== invNo ? `  ·  Ref ${inv.name}` : ""}`, M + 64, startY);

  // ============ ITEMS TABLE ============
  autoTable(doc, {
    startY: startY + 14,
    head: [["#", "Description", "SKU", "Qty", "Unit", "Amount"]],
    body: inv.lines.map((l, i) => [
      String(i + 1),
      l.title,
      l.sku || "—",
      String(l.quantity),
      money(l.unitPrice, cur),
      money(l.lineTotal, cur),
    ]),
    theme: "plain",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 8.5, fontStyle: "bold", cellPadding: { top: 8, bottom: 8, left: 8, right: 8 } },
    bodyStyles: { fontSize: 9, textColor: INK, cellPadding: { top: 8, bottom: 8, left: 8, right: 8 } },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles: {
      0: { cellWidth: 24, halign: "center", textColor: INK_SOFT },
      2: { cellWidth: 78, textColor: INK_SOFT },
      3: { cellWidth: 34, halign: "center" },
      4: { cellWidth: 62, halign: "right" },
      5: { cellWidth: 68, halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
    didDrawPage: () => {
      // gold rule under header row
    },
  });

  // ============ TOTALS ============
  // @ts-expect-error augmented at runtime
  let ty = (doc.lastAutoTable?.finalY ?? startY + 40) + 20;
  const rightX = W - M;
  const labelX = rightX - 165;

  const line = (label: string, val: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 9.5);
    doc.setTextColor(opts.color ?? INK_SOFT);
    doc.text(label, labelX, ty);
    doc.setTextColor(opts.bold ? (opts.color ?? INK) : INK);
    doc.text(val, rightX, ty, { align: "right" });
    ty += opts.size ? opts.size + 8 : 16;
  };

  line("Subtotal", money(inv.subtotal, cur));
  if (parseFloat(inv.discount) > 0) line("Discount", `- ${money(inv.discount, cur)}`);
  line(isVat ? "VAT (20%)" : "VAT", isVat ? money(inv.tax, cur) : "No VAT");

  // Total box
  ty += 4;
  doc.setFillColor(INK);
  doc.roundedRect(labelX - 12, ty - 13, rightX - labelX + 12, 26, 6, 6, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL", labelX, ty + 3);
  doc.setTextColor(GOLD);
  doc.setFontSize(13);
  doc.text(money(inv.total, cur), rightX - 8, ty + 4, { align: "right" });
  ty += 30;

  // Payments + balance
  if (inv.amountPaid > 0) {
    line("Paid", `- ${money(inv.amountPaid, cur)}`, { color: GREEN });
    line("Balance due", money(inv.balance, cur), { bold: true, color: inv.balance > 0.001 ? "#b3261e" : GREEN, size: 11 });
  }

  // ============ PAID STAMP ============
  if (isPaid) {
    doc.saveGraphicsState();
    // @ts-expect-error setGState available at runtime
    doc.setGState(new doc.GState({ opacity: 0.16 }));
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(60);
    doc.text("PAID", M + 120, ty - 40, { angle: 16 });
    doc.restoreGraphicsState();
  }

  // ============ NOTES + BANK ============
  let ny = (typeof (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY === "number"
    ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    : startY + 40) + 24;
  if (inv.note) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(GOLD);
    doc.text("NOTES", M, ny);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(inv.note, W - M * 2 - 190);
    doc.text(noteLines, M, ny + 13);
    ny += 13 + noteLines.length * 11;
  }
  if (B.bank) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(GOLD);
    doc.text("PAYMENT DETAILS", M, ny + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK_SOFT);
    doc.setFontSize(9);
    const bankLines = doc.splitTextToSize(B.bank, W - M * 2 - 190);
    doc.text(bankLines, M, ny + 19);
  }

  // ============ FOOTER ============
  const fy = H - 34;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.7);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(INK_SOFT);
  doc.text(B.name + (B.website ? `  ·  ${B.website}` : ""), M, fy);
  doc.text("Thank you for your business.", W - M, fy, { align: "right" });

  doc.save(`${B.name.replace(/\s+/g, "_")}_${invNo.replace(/[^\w-]/g, "")}.pdf`);
}
