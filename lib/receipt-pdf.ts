// Payment receipt PDF — "we received this much from you, here's what it paid
// off, here's what's still owed".
//
// Universal (no browser APIs) so it renders on the server for share links as
// well as in the browser for a direct download.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BUSINESS, type Business } from "./business";

const INK = "#1a1a1a";
const GOLD = "#a9791d";
const MUTED = "#6b655c";
const LINE = "#e2ddd3";
const LIGHT = "#f5f3ee";
const GREEN = "#1a7f4b";
const RED = "#b3261e";

const money = (n: number) => `£${(isNaN(n) ? 0 : n).toFixed(2)}`;
const d = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

export type ReceiptApplied = { name: string; amount: number; kind: "settled" | "part" };

export type ReceiptInput = {
  customerName: string;
  company?: string;
  email?: string;
  phone?: string;
  amount: number;
  method: string;
  date: string;
  note?: string;
  applied: ReceiptApplied[];   // bills this payment cleared or part-paid
  creditedToAccount: number;   // surplus left sitting on the account
  balanceBefore: number;
  balanceAfter: number;
};

export function receiptFilename(r: ReceiptInput): string {
  return `Receipt_${r.customerName.replace(/[^\w-]/g, "_")}_${r.date.slice(0, 10)}.pdf`;
}

export function buildReceiptDoc(r: ReceiptInput, business: Business = BUSINESS): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 40;

  // ---- Header ----
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("PAYMENT RECEIPT", M, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(MUTED);
  doc.text(d(r.date), pageW - M, 50, { align: "right" });

  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.4);
  doc.line(M, 66, pageW - M, 66);

  // ---- Who it's from / to ----
  let y = 88;
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("Received from", M, y);
  doc.text("Paid to", pageW / 2, y);
  y += 14;
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.setFont("helvetica", "bold");
  doc.text(r.customerName, M, y);
  doc.text(business.name, pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  let ly = y + 13;
  for (const line of [r.company, r.email, r.phone].filter(Boolean) as string[]) {
    doc.text(line, M, ly);
    ly += 12;
  }
  let ry = y + 13;
  for (const line of [...business.addressLines, business.phone].filter(Boolean)) {
    doc.text(line, pageW / 2, ry);
    ry += 12;
  }

  // ---- The amount, made unmissable ----
  y = Math.max(ly, ry) + 14;
  doc.setFillColor(LIGHT);
  doc.setDrawColor(LINE);
  doc.roundedRect(M, y, pageW - M * 2, 54, 4, 4, "FD");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("Amount received", M + 14, y + 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(GREEN);
  doc.text(money(r.amount), M + 14, y + 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`Method: ${r.method}`, pageW - M - 14, y + 20, { align: "right" });
  if (r.note) doc.text(r.note.slice(0, 60), pageW - M - 14, y + 36, { align: "right" });
  y += 74;

  // ---- What the money was put against ----
  const rows: string[][] = r.applied.map((a) => [
    a.name,
    a.kind === "settled" ? "Paid in full" : "Part payment",
    money(a.amount),
  ]);
  if (r.creditedToAccount > 0.001) {
    rows.push(["Credit on account", "Held for future bills", money(r.creditedToAccount)]);
  }
  if (!rows.length) rows.push(["—", "Held on account", money(r.amount)]);

  autoTable(doc, {
    startY: y,
    head: [["Applied to", "", "Amount"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6, lineColor: LINE, lineWidth: 0.4, textColor: INK },
    headStyles: { fillColor: LIGHT, textColor: MUTED, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: M, right: M },
  });

  // ---- Where the account stands now ----
  // @ts-expect-error — autotable augments the doc at runtime
  y = (doc.lastAutoTable?.finalY ?? y) + 24;
  const label = pageW - M - 190;
  const right = pageW - M;
  const row = (l: string, v: string, bold = false, tone?: string) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 9.5);
    doc.setTextColor(tone ?? (bold ? INK : MUTED));
    doc.text(l, label, y);
    doc.text(v, right, y, { align: "right" });
    y += bold ? 20 : 15;
  };
  row("Balance before payment", money(r.balanceBefore));
  row("This payment", `− ${money(r.amount)}`);
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(label, y - 4, right, y - 4);
  y += 8;
  row(
    r.balanceAfter > 0.001 ? "STILL OUTSTANDING" : "ACCOUNT SETTLED",
    money(r.balanceAfter),
    true,
    r.balanceAfter > 0.001 ? RED : GREEN,
  );

  // ---- Footer ----
  const footY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor("#e5e5e5");
  doc.setLineWidth(0.5);
  doc.line(M, footY - 14, pageW - M, footY - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    r.balanceAfter > 0.001
      ? "Thank you. The balance above remains outstanding on your account."
      : "Thank you — your account is fully settled.",
    M,
    footY,
  );

  return doc;
}

// Build + immediately download (browser only).
export function generateReceiptPdf(r: ReceiptInput, business: Business = BUSINESS): void {
  buildReceiptDoc(r, business).save(receiptFilename(r));
}
