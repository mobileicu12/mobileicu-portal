// Client-side multi-invoice business report PDF (selected invoices or a date range).
"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import { SEGMENTS } from "./segments";

const INK = "#14110e";
const GOLD = "#c8952f";
const MUTED = "#6b655c";
const CREAM = "#faf7f0";

export type ReportRow = {
  invoiceNo: string;
  name: string;
  customer: string;
  staff: string | null;
  segment: string | null;
  status: string; // COMPLETED = paid
  total: string;
  createdAt: string;
};

function money(n: number) {
  return `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
}

export function buildInvoicesReportDoc(rows: ReportRow[], opts: { rangeLabel: string; business?: Business }): jsPDF {
  const B = opts.business || BUSINESS;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // Header band
  doc.setFillColor(INK);
  doc.rect(0, 0, W, 92, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(B.name, M, 44);
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Sales report", M, 62);
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("REPORT", W - M, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GOLD);
  doc.text(opts.rangeLabel, W - M, 62, { align: "right" });

  const num = (s: string) => parseFloat(s) || 0;
  let total = 0, paid = 0, outstanding = 0;
  for (const r of rows) {
    const t = num(r.total);
    total += t;
    if (r.status === "COMPLETED") paid += t; else outstanding += t;
  }

  // Summary tiles
  let y = 120;
  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, M, y);
  y += 18;
  const tiles: [string, string][] = [
    ["Invoices", String(rows.length)],
    ["Total sales", money(total)],
    ["Paid", money(paid)],
    ["Outstanding", money(outstanding)],
  ];
  const tileW = (W - M * 2 - 24) / 4;
  tiles.forEach(([label, val], i) => {
    const x = M + i * (tileW + 8);
    doc.setFillColor(CREAM);
    doc.roundedRect(x, y, tileW, 46, 6, 6, "F");
    doc.setTextColor(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, y + 16);
    doc.setTextColor(INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(val, x + 10, y + 35);
  });
  y += 66;

  // Per-teammate + per-source breakdowns (side by side)
  const byStaff = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const k = r.staff ? r.staff.split("@")[0] : "Unattributed";
    const s = byStaff.get(k) || { count: 0, total: 0 };
    s.count++; s.total += num(r.total);
    byStaff.set(k, s);
  }
  const bySeg = SEGMENTS.map((s) => {
    const list = rows.filter((r) => r.segment === s.key);
    return [s.label, String(list.length), money(list.reduce((a, r) => a + num(r.total), 0))];
  }).filter((r) => r[1] !== "0");

  autoTable(doc, {
    startY: y,
    head: [["Teammate", "Bills", "Sales"]],
    body: [...byStaff.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.count), money(v.total)]),
    theme: "grid",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 8 },
    bodyStyles: { fontSize: 8.5, textColor: INK },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: M, right: W / 2 + 6 },
    tableWidth: W / 2 - M - 6,
  });
  // @ts-expect-error augmented
  const staffEndY: number = doc.lastAutoTable?.finalY ?? y;

  autoTable(doc, {
    startY: y,
    head: [["Source", "Bills", "Sales"]],
    body: bySeg.length ? bySeg : [["—", "0", money(0)]],
    theme: "grid",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 8 },
    bodyStyles: { fontSize: 8.5, textColor: INK },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: W / 2 + 6, right: M },
    tableWidth: W / 2 - M - 6,
  });
  // @ts-expect-error augmented
  const segEndY: number = doc.lastAutoTable?.finalY ?? y;

  // Invoices table
  const sorted = [...rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  autoTable(doc, {
    startY: Math.max(staffEndY, segEndY) + 18,
    head: [["Invoice #", "Customer", "Teammate", "Source", "Status", "Date", "Total"]],
    body: sorted.map((r) => {
      const seg = SEGMENTS.find((s) => s.key === r.segment);
      return [
        r.invoiceNo || r.name,
        r.customer,
        r.staff ? r.staff.split("@")[0] : "—",
        seg?.label ?? "—",
        r.status === "COMPLETED" ? "PAID" : "DRAFT",
        new Date(r.createdAt).toLocaleDateString("en-GB"),
        money(num(r.total)),
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: INK },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles: { 6: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
    foot: [["", "", "", "", "", "TOTAL", money(total)]],
    footStyles: { fillColor: "#ffffff", textColor: INK, fontStyle: "bold", fontSize: 9, halign: "right" },
  });

  // Footer
  const fy = H - 28;
  doc.setDrawColor("#e7e3db");
  doc.setLineWidth(0.6);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(`${B.name}${B.website ? `  ·  ${B.website}` : ""}`, M, fy);
  doc.text(`Page report · ${opts.rangeLabel}`, W - M, fy, { align: "right" });

  return doc;
}
