// Client-side branded A4 invoice PDF via jsPDF + autotable.
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import type { InvoiceDetail } from "./billing";

const INK = "#1a1a1a";
const GOLD = "#c8952f";
const MUTED = "#6b6b6b";

function money(n: string | number, currency = "GBP") {
  const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `${sym}${(isNaN(v) ? 0 : v).toFixed(2)}`;
}

export function generateInvoicePdf(inv: InvoiceDetail, biz: Business = BUSINESS) {
  const BUSINESS = biz;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40; // margin
  const isVat = !inv.taxExempt;
  const cur = inv.currency;

  // ---- Header band ----
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

  // Invoice label (right)
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(isVat ? "VAT INVOICE" : "INVOICE", pageW - M, 46, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(GOLD);
  doc.text(inv.invoiceNo || inv.name, pageW - M, 64, { align: "right" });

  // ---- Business + meta row ----
  let y = 118;
  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  const bizBlock = [...BUSINESS.addressLines];
  if (BUSINESS.email) bizBlock.push(BUSINESS.email);
  if (BUSINESS.phone) bizBlock.push(BUSINESS.phone);
  if (BUSINESS.website) bizBlock.push(BUSINESS.website);
  if (isVat && BUSINESS.vatNumber) bizBlock.push(`VAT No: ${BUSINESS.vatNumber}`);
  bizBlock.forEach((line, i) => doc.text(line, M, y + i * 13));

  // Meta (right)
  const metaX = pageW - M;
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.text("Date:", metaX - 120, y);
  doc.setFont("helvetica", "normal");
  doc.text(new Date(inv.createdAt).toLocaleDateString("en-GB"), metaX, y, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text("Status:", metaX - 120, y + 14);
  doc.setFont("helvetica", "normal");
  doc.text(inv.status === "COMPLETED" ? "PAID" : "DUE", metaX, y + 14, { align: "right" });

  // ---- Bill To ----
  y = Math.max(y + bizBlock.length * 13, y + 42) + 14;
  doc.setDrawColor("#e5e5e5");
  doc.line(M, y, pageW - M, y);
  y += 20;
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("BILL TO", M, y);
  y += 15;
  doc.setTextColor(INK);
  doc.setFontSize(11);
  doc.text(inv.customerName, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const toBlock = [...inv.billingAddress];
  if (inv.customerEmail) toBlock.push(inv.customerEmail);
  if (inv.customerPhone) toBlock.push(inv.customerPhone);
  toBlock.forEach((line, i) => doc.text(line, M, y + 14 + i * 12));
  const billBottom = y + 14 + toBlock.length * 12;

  // ---- Line items table ----
  autoTable(doc, {
    startY: billBottom + 16,
    head: [["#", "Description", "SKU", "Qty", "Unit", "Total"]],
    body: inv.lines.map((l, i) => [
      String(i + 1),
      l.title,
      l.sku || "—",
      String(l.quantity),
      money(l.unitPrice, cur),
      money(l.lineTotal, cur),
    ]),
    theme: "grid",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 9, halign: "left" },
    bodyStyles: { fontSize: 9, textColor: INK },
    alternateRowStyles: { fillColor: "#faf7f0" },
    columnStyles: {
      0: { cellWidth: 26, halign: "center" },
      2: { cellWidth: 80 },
      3: { cellWidth: 36, halign: "center" },
      4: { cellWidth: 60, halign: "right" },
      5: { cellWidth: 66, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // ---- Totals ----
  // @ts-expect-error autotable augments doc at runtime
  let ty = (doc.lastAutoTable?.finalY ?? billBottom + 16) + 18;
  const tRight = pageW - M;
  const tLabel = tRight - 150;
  const row = (label: string, val: string, bold = false, gold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.setTextColor(gold ? GOLD : INK);
    doc.text(label, tLabel, ty);
    doc.text(val, tRight, ty, { align: "right" });
    ty += bold ? 18 : 15;
  };
  row("Subtotal", money(inv.subtotal, cur));
  if (parseFloat(inv.discount) > 0) row("Discount", `- ${money(inv.discount, cur)}`);
  row(isVat ? "VAT (20%)" : "VAT", isVat ? money(inv.tax, cur) : "No VAT");
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(tLabel, ty - 4, tRight, ty - 4);
  ty += 8;
  row("TOTAL", money(inv.total, cur), true, true);

  // ---- Notes + footer ----
  if (inv.note) {
    ty += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text("Notes", M, ty);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED);
    const noteLines = doc.splitTextToSize(inv.note, pageW - M * 2 - 160);
    doc.text(noteLines, M, ty + 13);
  }

  const footY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#e5e5e5");
  doc.setLineWidth(0.5);
  doc.line(M, footY - 14, pageW - M, footY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  const footLeft = BUSINESS.bank || "Thank you for your business.";
  doc.text(footLeft, M, footY);
  doc.text(`${BUSINESS.name} · ${BUSINESS.website}`, pageW - M, footY, { align: "right" });

  doc.save(`${BUSINESS.name.replace(/\s+/g, "_")}_${(inv.invoiceNo || inv.name).replace(/[^\w-]/g, "")}.pdf`);
}
