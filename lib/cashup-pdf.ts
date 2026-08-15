// Daily cash-up report PDF — the closing sheet, with the system's figures beside
// the hand-entered ones so the two can be compared at a glance.
//
// Universal (no browser APIs) so it renders server-side for sending as well as
// in the browser for a download.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";
import { sheetTotals, type CashUp, type DayTakings } from "./cashup-types";

const INK = "#1a1a1a";
const GOLD = "#a9791d";
const MUTED = "#6b655c";
const LINE = "#e2ddd3";
const LIGHT = "#f5f3ee";
const CREAM = "#fbfaf7";
const GREEN = "#1a7f4b";
const RED = "#b3261e";

const money = (n: number) => `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function cashUpFilename(date: string, biz: Business = BUSINESS): string {
  return `${biz.name.replace(/\s+/g, "_")}_CashUp_${date}.pdf`;
}

export function buildCashUpDoc(
  date: string,
  sheet: CashUp,
  system: DayTakings | null,
  biz: Business = BUSINESS,
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const t = sheetTotals(sheet);
  const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  // ---- Header ----
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(biz.name, M, 44);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("DAILY CASH-UP", W - M, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(dayLabel, W - M, 60, { align: "right" });
  if (sheet.closedBy) doc.text(`Closed by ${sheet.closedBy}`, M, 60);

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 72, W - M, 72);

  // ---- Wholesale customer payments ----
  let y = 96;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text("Wholesale customers paid", M, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Customer", "Method", "Amount"]],
    body: sheet.customerLines.length
      ? sheet.customerLines.map((l) => [l.name || "—", cap(l.method), money(l.amount)])
      : [["No customer payments recorded", "", money(0)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: LIGHT, textColor: MUTED, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    foot: [["Total from customers", "", money(t.fromCustomers)]],
    footStyles: { fillColor: CREAM, textColor: INK, fontStyle: "bold", halign: "right" },
    margin: { left: M, right: M },
  });
  // @ts-expect-error — autotable augments the doc at runtime
  y = (doc.lastAutoTable?.finalY ?? y) + 22;

  // ---- Other collections + method split ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Other collected & method split", M, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["", "Cash", "Card", "Total"]],
    body: [
      ["Counter / other sales", money(sheet.otherCash), money(sheet.otherCard), money(t.fromOther)],
      ["All takings today", money(t.byMethod.cash), money(t.byMethod.card), money(t.receivedTotal)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: LIGHT, textColor: MUTED, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    margin: { left: M, right: M },
  });
  // @ts-expect-error — augmented
  y = (doc.lastAutoTable?.finalY ?? y) + 22;

  // ---- Expenses ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Expenses", M, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Description", "Paid by", "Amount"]],
    body: sheet.expenseLines.length
      ? sheet.expenseLines.map((l) => [l.name || "—", cap(l.method), money(l.amount)])
      : [["No expenses recorded", "", money(0)]],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: LIGHT, textColor: MUTED, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    foot: [[`Total out (£${t.cashExpenses.toFixed(2)} from the till)`, "", money(t.expensesTotal)]],
    footStyles: { fillColor: CREAM, textColor: INK, fontStyle: "bold", halign: "right" },
    margin: { left: M, right: M },
  });
  // @ts-expect-error — augmented
  y = (doc.lastAutoTable?.finalY ?? y) + 22;

  // ---- Sheet vs system ----
  if (system) {
    const rows: string[][] = [
      ["Cash", money(t.byMethod.cash), money(system.receivedByMethod.cash), money(t.byMethod.cash - system.receivedByMethod.cash)],
      ["Card", money(t.byMethod.card), money(system.receivedByMethod.card), money(t.byMethod.card - system.receivedByMethod.card)],
      ["Total received", money(t.receivedTotal), money(system.receivedTotal), money(t.receivedTotal - system.receivedTotal)],
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.text("Counted sheet vs portal", M, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["", "Sheet", "Portal", "Difference"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: LINE, lineWidth: 0.4, textColor: INK },
      headStyles: { fillColor: LIGHT, textColor: MUTED, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
      margin: { left: M, right: M },
    });
    // @ts-expect-error — augmented
    y = (doc.lastAutoTable?.finalY ?? y) + 22;
  }

  // ---- What's left ----
  const expectedCash = sheet.openingFloat + t.byMethod.cash - t.cashExpenses;
  const variance = sheet.countedCash - expectedCash;
  const ok = Math.abs(variance) < 0.01;

  // What's actually in hand at the end of the day: the counted drawer plus the
  // day's card takings. The sheet is signed off on that number, so it belongs
  // in the box rather than as a footnote under it.
  const totalInHand = sheet.countedCash + t.byMethod.card;

  if (y > H - 250) { doc.addPage(); y = 60; }

  doc.setFillColor(LIGHT);
  doc.setDrawColor(LINE);
  doc.roundedRect(M, y, W - M * 2, 182, 6, 6, "FD");
  let ry = y + 22;
  const label = M + 16;
  const right = W - M - 16;
  const line = (l: string, v: string, bold = false, tone?: string) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 9.5);
    doc.setTextColor(tone ?? (bold ? INK : MUTED));
    doc.text(l, label, ry);
    doc.text(v, right, ry, { align: "right" });
    ry += bold ? 20 : 15;
  };
  line("Opening float", money(sheet.openingFloat));
  line("+ Cash taken today", money(t.byMethod.cash));
  line("− Cash expenses", money(t.cashExpenses));
  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.8);
  doc.line(label, ry - 4, right, ry - 4);
  ry += 6;
  line("Expected in drawer", money(expectedCash), true);
  line("Actually counted", money(sheet.countedCash), true);
  line(
    ok ? "BALANCES" : variance > 0 ? "OVER BY" : "SHORT BY",
    ok ? "✓" : money(Math.abs(variance)),
    true,
    ok ? GREEN : RED,
  );

  doc.setDrawColor(GOLD);
  doc.setLineWidth(0.8);
  doc.line(label, ry - 4, right, ry - 4);
  ry += 6;
  line(
    sheet.countedCard > 0 ? `Card taken today (terminal ${money(sheet.countedCard)})` : "Card taken today",
    money(t.byMethod.card),
  );
  line("TOTAL IN HAND — cash + card", money(totalInHand), true, GOLD);

  y += 198;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  if (sheet.note) {
    doc.text(`Note: ${sheet.note}`.slice(0, 140), M, y);
  }

  // ---- Footer ----
  const fy = H - 28;
  doc.setDrawColor("#e7e3db");
  doc.setLineWidth(0.5);
  doc.line(M, fy - 12, W - M, fy - 12);
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(`${biz.name}${biz.website ? `  ·  ${biz.website}` : ""}`, M, fy);
  doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, W - M, fy, { align: "right" });

  return doc;
}
