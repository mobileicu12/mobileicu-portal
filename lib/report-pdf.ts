// Multi-invoice business report + customer statement PDFs (jsPDF + autotable).
// Universal (no browser APIs) so these can render on the server for public links.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import { SEGMENTS } from "./segments";

const INK = "#1a1a1a";
const GOLD = "#a9791d";
const MUTED = "#6b655c";
const CREAM = "#fbfaf7";
const LINE = "#e2ddd3";
const LIGHT = "#f5f3ee";

export type ReportRow = {
  invoiceNo: string;
  name: string;
  customer: string;
  staff: string | null;
  segment: string | null;
  status: string; // COMPLETED = paid
  total: string;
  createdAt: string;
  payMethod?: string | null; // cash / card / bank transfer / …
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

  // Header (light) — monogram + name left, title right
  doc.setFillColor(GOLD);
  doc.circle(M + 14, 44, 14, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("MI", M + 14, 48.5, { align: "center" });
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(B.name, M + 38, 42);
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Sales report", M + 38, 56);
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SALES REPORT", W - M, 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(opts.rangeLabel, W - M, 58, { align: "right" });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 78, W - M, 78);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(M, 81, W - M, 81);

  const num = (s: string) => parseFloat(s) || 0;
  let total = 0, paid = 0, outstanding = 0;
  const byMethod: Record<string, number> = { cash: 0, card: 0, "bank transfer": 0, other: 0 };
  for (const r of rows) {
    const t = num(r.total);
    total += t;
    if (r.status === "COMPLETED") paid += t; else outstanding += t;
    const m = (r.payMethod || "other").toLowerCase();
    byMethod[m in byMethod ? m : "other"] += t;
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
  y += 60;

  // Payment-method split (cash vs card etc.)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(GOLD);
  doc.text("COLLECTED BY", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  doc.text(
    `Cash ${money(byMethod.cash)}    ·    Card ${money(byMethod.card)}    ·    Bank ${money(byMethod["bank transfer"])}    ·    Other ${money(byMethod.other)}`,
    M + 74, y,
  );
  y += 18;

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
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 8, lineColor: LINE, lineWidth: 0.6 },
    bodyStyles: { fontSize: 8.5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
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
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 8, lineColor: LINE, lineWidth: 0.6 },
    bodyStyles: { fontSize: 8.5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
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
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 8.5, lineColor: LINE, lineWidth: 0.6 },
    bodyStyles: { fontSize: 8.5, textColor: INK },
    alternateRowStyles: { fillColor: CREAM },
    columnStyles: { 6: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
    foot: [["", "", "", "", "", "TOTAL", money(total)]],
    footStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 9, halign: "right", lineColor: LINE, lineWidth: 0.6 },
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

// ---- Itemised single-customer day statement (items per bill + outstandings) ----
export type ItemisedBill = {
  invoiceNo: string; name: string; status: string; createdAt: string;
  total: string; amountPaid: number; balance: number;
  lines: { title: string; quantity: number; unitPrice: string; lineTotal: string }[];
};

export function buildCustomerDayItemisedDoc(
  customer: string,
  bills: ItemisedBill[],
  totals: { todayTotal: number; todayPaid: number; todayOutstanding: number; accountOutstanding: number },
  opts: { dateLabel: string; business?: Business },
): jsPDF {
  const B = opts.business || BUSINESS;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const gbp = (n: number) => `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
  const numv = (s: string) => parseFloat(s) || 0;

  // Header
  doc.setFillColor(GOLD); doc.circle(M + 14, 44, 14, "F");
  doc.setTextColor("#ffffff"); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("MI", M + 14, 48.5, { align: "center" });
  doc.setTextColor(INK); doc.setFontSize(18); doc.text(B.name, M + 38, 42);
  doc.setTextColor(GOLD); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("Daily statement", M + 38, 56);
  doc.setTextColor(INK); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("STATEMENT", W - M, 42, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(MUTED);
  doc.text(opts.dateLabel, W - M, 58, { align: "right" });
  doc.setDrawColor(GOLD); doc.setLineWidth(1.4); doc.line(M, 78, W - M, 78);
  doc.setDrawColor(LINE); doc.setLineWidth(0.6); doc.line(M, 81, W - M, 81);

  doc.setTextColor(GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("CUSTOMER", M, 104);
  doc.setTextColor(INK); doc.setFontSize(13); doc.text(customer || "Customer", M, 120);

  // Summary tiles (4)
  let y = 138;
  const tiles: [string, string, boolean][] = [
    ["Today's bills", gbp(totals.todayTotal), false],
    ["Paid today", gbp(totals.todayPaid), false],
    ["Today's outstanding", gbp(totals.todayOutstanding), totals.todayOutstanding > 0],
    ["Total outstanding", gbp(totals.accountOutstanding), totals.accountOutstanding > 0],
  ];
  const tileW = (W - M * 2 - 30) / 4;
  tiles.forEach(([label, val, red], i) => {
    const x = M + i * (tileW + 10);
    doc.setFillColor(CREAM); doc.setDrawColor(LINE); doc.roundedRect(x, y, tileW, 44, 6, 6, "FD");
    doc.setTextColor(MUTED); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + 8, y + 15);
    doc.setTextColor(red ? "#b3261e" : INK); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(val, x + 8, y + 33);
  });
  y += 62;

  // Each bill with its items
  for (const bill of bills) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(INK);
    const when = new Date(bill.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    doc.text(`${bill.invoiceNo}  ·  ${when}  ·  ${bill.status === "COMPLETED" ? "Paid" : "Unpaid"}`, M, y);
    autoTable(doc, {
      startY: y + 6,
      head: [["Item", "Qty", "Unit", "Amount"]],
      body: bill.lines.map((l) => [l.title, String(l.quantity), gbp(numv(l.unitPrice)), gbp(numv(l.lineTotal))]),
      theme: "grid",
      headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 8, lineColor: LINE, lineWidth: 0.6 },
      bodyStyles: { fontSize: 8.5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      columnStyles: { 1: { halign: "center", cellWidth: 40 }, 2: { halign: "right", cellWidth: 60 }, 3: { halign: "right", cellWidth: 66, fontStyle: "bold" } },
      margin: { left: M, right: M },
      foot: [["", "", "Bill total", gbp(numv(bill.total))]],
      footStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 8.5, halign: "right", lineColor: LINE, lineWidth: 0.6 },
    });
    // @ts-expect-error augmented
    y = (doc.lastAutoTable?.finalY ?? y) + 18;
    if (y > H - 90) { doc.addPage(); y = 60; }
  }

  const fy = H - 28;
  doc.setDrawColor(LINE); doc.setLineWidth(0.6); doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(MUTED);
  doc.text(`${B.name}${B.website ? `  ·  ${B.website}` : ""}`, M, fy);
  doc.text(`Statement · ${opts.dateLabel}`, W - M, fy, { align: "right" });

  return doc;
}

// ---- Single-customer day statement (used for the end-of-day per-customer ZIP) ----
export type CustomerDayRow = { invoiceNo: string; createdAt: string; status: string; total: string };

export function buildCustomerDayDoc(
  customer: string,
  rows: CustomerDayRow[],
  opts: { dateLabel: string; business?: Business; outstanding?: number },
): jsPDF {
  const B = opts.business || BUSINESS;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const money2 = (n: number) => `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
  const num = (s: string) => parseFloat(s) || 0;

  let total = 0, paid = 0, dueToday = 0;
  for (const r of rows) {
    const t = num(r.total);
    total += t;
    if (r.status === "COMPLETED") paid += t; else dueToday += t;
  }
  // Overall account outstanding if provided, else today's unpaid.
  const outstanding = opts.outstanding ?? dueToday;

  // Header (light)
  doc.setFillColor(GOLD);
  doc.circle(M + 14, 44, 14, "F");
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("MI", M + 14, 48.5, { align: "center" });
  doc.setTextColor(INK);
  doc.setFontSize(18);
  doc.text(B.name, M + 38, 42);
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Daily statement", M + 38, 56);
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("STATEMENT", W - M, 42, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(opts.dateLabel, W - M, 58, { align: "right" });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 78, W - M, 78);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(M, 81, W - M, 81);

  // Customer
  doc.setTextColor(GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CUSTOMER", M, 104);
  doc.setTextColor(INK);
  doc.setFontSize(13);
  doc.text(customer || "Customer", M, 120);

  // Summary tiles: today's bills, paid, outstanding
  const tiles: [string, string][] = [
    ["Today's bills", money2(total)],
    ["Paid today", money2(paid)],
    ["Outstanding", money2(outstanding)],
  ];
  let ty = 138;
  const tileW = (W - M * 2 - 20) / 3;
  tiles.forEach(([label, val], i) => {
    const x = M + i * (tileW + 10);
    doc.setFillColor(CREAM);
    doc.setDrawColor(LINE);
    doc.roundedRect(x, ty, tileW, 46, 6, 6, "FD");
    doc.setTextColor(MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.toUpperCase(), x + 10, ty + 16);
    doc.setTextColor(i === 2 && outstanding > 0 ? "#b3261e" : INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(val, x + 10, ty + 35);
  });
  ty += 66;

  // Bills table
  const sorted = [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  autoTable(doc, {
    startY: ty,
    head: [["Invoice", "Time", "Status", "Amount"]],
    body: sorted.map((r) => [
      r.invoiceNo,
      new Date(r.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      r.status === "COMPLETED" ? "Paid" : "Unpaid",
      money2(num(r.total)),
    ]),
    theme: "grid",
    headStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 9, lineColor: LINE, lineWidth: 0.6 },
    bodyStyles: { fontSize: 9, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
    columnStyles: { 3: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
    foot: [["", "", "Today total", money2(total)]],
    footStyles: { fillColor: LIGHT, textColor: INK, fontStyle: "bold", fontSize: 9, halign: "right", lineColor: LINE, lineWidth: 0.6 },
  });

  const fy = H - 28;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.6);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(`${B.name}${B.website ? `  ·  ${B.website}` : ""}`, M, fy);
  doc.text(`Statement · ${opts.dateLabel}`, W - M, fy, { align: "right" });

  return doc;
}
