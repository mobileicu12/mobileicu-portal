// Clean, professional A4 invoice PDF via jsPDF + autotable.
// Light layout — white background, no dark header band, subtle gold accents.
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import type { InvoiceDetail } from "./billing";

const INK = "#1a1a1a";      // primary text
const SOFT = "#6b655c";     // secondary text
const GOLD = "#a9791d";     // accent (print-legible on white)
const LINE = "#e2ddd3";     // hairlines / borders
const LIGHT = "#f5f3ee";    // table header / subtle fills
const GREEN = "#1a7f4b";
const RED = "#b3261e";

function sym(cur: string) {
  return cur === "GBP" ? "£" : cur === "USD" ? "$" : cur === "EUR" ? "€" : "";
}
function money(n: string | number, cur = "GBP") {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `${sym(cur)}${(isNaN(v) ? 0 : v).toFixed(2)}`;
}

export function invoiceFilename(inv: InvoiceDetail, biz: Business = BUSINESS): string {
  return `${biz.name.replace(/\s+/g, "_")}_${(inv.invoiceNo || inv.name).replace(/[^\w-]/g, "")}.pdf`;
}

// Backwards-compatible: build + immediately download.
export function generateInvoicePdf(inv: InvoiceDetail, biz: Business = BUSINESS) {
  buildInvoiceDoc(inv, biz).save(invoiceFilename(inv, biz));
}

// Build the jsPDF document (for preview or download).
export function buildInvoiceDoc(inv: InvoiceDetail, biz: Business = BUSINESS): jsPDF {
  const B = biz;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const isVat = !inv.taxExempt;
  const cur = inv.currency || "GBP";
  const invNo = inv.invoiceNo || inv.name;
  const isPaid = inv.status === "COMPLETED" || (inv.balance <= 0.001 && inv.amountPaid > 0);

  // ============ HEADER (light) ============
  // Seller identity is shown on VAT invoices only. A non-VAT invoice is issued
  // WITHOUT our business name / address / VAT details.
  if (isVat) {
    // Gold monogram badge
    doc.setFillColor(GOLD);
    doc.circle(M + 15, 52, 15, "F");
    doc.setTextColor("#ffffff");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("MI", M + 15, 57, { align: "center" });

    // Business name + tagline
    doc.setTextColor(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(B.name, M + 40, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(GOLD);
    doc.text(B.tagline, M + 40, 64);
  }

  // Document title + meta (right)
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(isVat ? "VAT INVOICE" : "INVOICE", W - M, 52, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(GOLD);
  doc.text(invNo, W - M, 70, { align: "right" });
  doc.setTextColor(SOFT);
  doc.setFontSize(8.5);
  doc.text(`Issued ${new Date(inv.createdAt).toLocaleDateString("en-GB")}`, W - M, 84, { align: "right" });

  // Divider rule
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 100, W - M, 100);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(M, 103, W - M, 103);

  // ============ FROM / BILL TO ============
  const y = 132;
  // FROM (left) — VAT invoices only.
  let fromEnd = y;
  if (isVat) {
    doc.setTextColor(GOLD);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("FROM", M, y);
    doc.setTextColor(INK);
    doc.setFontSize(10.5);
    doc.text(B.name, M, y + 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    const from = [...B.addressLines];
    if (B.email) from.push(B.email);
    if (B.phone) from.push(B.phone);
    if (B.website) from.push(B.website);
    if (B.vatNumber) from.push(`VAT No: ${B.vatNumber}`);
    from.forEach((l, i) => doc.text(l, M, y + 29 + i * 12));
    fromEnd = y + 29 + from.length * 12;
  }

  // BILL TO (right card)
  const cardX = W / 2 + 12;
  const cardW = W - M - cardX;
  const toLines = [...inv.billingAddress];
  if (inv.customerEmail) toLines.push(inv.customerEmail);
  if (inv.customerPhone) toLines.push(inv.customerPhone);
  const cardH = 46 + toLines.length * 12;
  doc.setFillColor(LIGHT);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.8);
  doc.roundedRect(cardX, y - 16, cardW, cardH, 7, 7, "FD");
  const cx = cardX + 16;
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("BILL TO", cx, y);
  doc.setTextColor(INK);
  doc.setFontSize(10.5);
  doc.text(inv.customerName, cx, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SOFT);
  toLines.forEach((l, i) => doc.text(l, cx, y + 30 + i * 12));

  // ============ STATUS ROW ============
  const startY = Math.max(fromEnd, y - 16 + cardH) + 22;
  const pillLabel = isPaid ? "PAID" : "DUE";
  const pillColor = isPaid ? GREEN : GOLD;
  doc.setFillColor(pillColor);
  doc.roundedRect(M, startY - 11, 50, 17, 8.5, 8.5, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(pillLabel, M + 25, startY, { align: "center" });
  doc.setTextColor(SOFT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Invoice ${invNo}   ·   ${new Date(inv.createdAt).toLocaleDateString("en-GB")}${inv.name && inv.name !== invNo ? `   ·   Ref ${inv.name}` : ""}`,
    M + 62, startY,
  );

  // ============ ITEMS TABLE (light grid) ============
  autoTable(doc, {
    startY: startY + 16,
    head: [["#", "Description", "SKU", "Qty", "Unit Price", "Amount"]],
    body: inv.lines.map((l, i) => [
      String(i + 1),
      l.title,
      l.sku || "—",
      String(l.quantity),
      money(l.unitPrice, cur),
      money(l.lineTotal, cur),
    ]),
    theme: "grid",
    headStyles: { fillColor: LIGHT, textColor: INK, fontSize: 8.5, fontStyle: "bold", lineColor: LINE, lineWidth: 0.6, cellPadding: { top: 7, bottom: 7, left: 8, right: 8 } },
    bodyStyles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.5, cellPadding: { top: 7, bottom: 7, left: 8, right: 8 } },
    columnStyles: {
      0: { cellWidth: 24, halign: "center", textColor: SOFT },
      2: { cellWidth: 80, textColor: SOFT },
      3: { cellWidth: 34, halign: "center" },
      4: { cellWidth: 64, halign: "right" },
      5: { cellWidth: 70, halign: "right", fontStyle: "bold" },
    },
    margin: { left: M, right: M },
  });

  // ============ TOTALS ============
  // @ts-expect-error augmented at runtime
  const tableEndY: number = doc.lastAutoTable?.finalY ?? startY + 40;
  let ty = tableEndY + 22;
  const rightX = W - M;
  const labelX = rightX - 170;

  const line = (label: string, val: string, opts: { bold?: boolean; color?: string; size?: number } = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setFontSize(opts.size ?? 9.5);
    doc.setTextColor(opts.color ?? SOFT);
    doc.text(label, labelX, ty);
    doc.setTextColor(opts.bold ? (opts.color ?? INK) : INK);
    doc.text(val, rightX, ty, { align: "right" });
    ty += opts.size ? opts.size + 8 : 16;
  };

  line("Subtotal", money(inv.subtotal, cur));
  const disc = parseFloat(inv.discount) || 0;
  if (disc > 0) {
    const sub = parseFloat(inv.subtotal) || 0;
    const pct = sub > 0 ? Math.round((disc / sub) * 1000) / 10 : 0;
    line(pct > 0 ? `Discount (${pct}%)` : "Discount", `- ${money(disc, cur)}`);
  }
  line(isVat ? "VAT (20%)" : "VAT", isVat ? money(inv.tax, cur) : "No VAT");

  // Total — bold row framed by gold rules (no dark box)
  ty += 6;
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(labelX, ty - 13, rightX, ty - 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(INK);
  doc.text("TOTAL", labelX, ty + 3);
  doc.setTextColor(GOLD);
  doc.setFontSize(14);
  doc.text(money(inv.total, cur), rightX, ty + 3, { align: "right" });
  ty += 10;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(labelX, ty, rightX, ty);
  ty += 16;

  // Payments + balance
  if (inv.amountPaid > 0) {
    line("Paid", `- ${money(inv.amountPaid, cur)}`, { color: GREEN });
    line("Balance due", money(inv.balance, cur), { bold: true, color: inv.balance > 0.001 ? RED : GREEN, size: 11 });
  }

  // ============ PAID WATERMARK ============
  if (isPaid) {
    doc.saveGraphicsState();
    // @ts-expect-error setGState available at runtime
    doc.setGState(new doc.GState({ opacity: 0.10 }));
    doc.setTextColor(GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(64);
    doc.text("PAID", M + 130, tableEndY + 30, { angle: 16 });
    doc.restoreGraphicsState();
  }

  // ============ NOTES + PAYMENT DETAILS ============
  let ny = tableEndY + 24;
  const noteW = W - M * 2 - 200; // keep clear of the totals column
  if (inv.note) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(GOLD);
    doc.text("NOTES", M, ny);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SOFT);
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(inv.note, noteW);
    doc.text(noteLines, M, ny + 13);
    ny += 13 + noteLines.length * 11 + 8;
  }
  if (B.bank) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(GOLD);
    doc.text("PAYMENT DETAILS", M, ny);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SOFT);
    doc.setFontSize(9);
    const bankLines = doc.splitTextToSize(B.bank, noteW);
    doc.text(bankLines, M, ny + 13);
  }

  // ============ FOOTER ============
  const fy = H - 34;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.7);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(SOFT);
  // Non-VAT invoices carry no seller identity, so leave the footer-left blank.
  const footLeft = isVat ? [B.name, B.website, B.vatNumber ? `VAT ${B.vatNumber}` : ""].filter(Boolean).join("  ·  ") : "";
  if (footLeft) doc.text(footLeft, M, fy);
  doc.text("Thank you for your business.", W - M, fy, { align: "right" });

  return doc;
}
