import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAnyPermission } from "@/lib/guard";
import { getCashUp, takingsFor, sheetTotals } from "@/lib/cashup";
import { BUSINESS } from "@/lib/business";
import { BRAND_SLUG } from "@/lib/brand";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 120;

const money = "£#,##0.00";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Excel workbook of a day's cash-up: the hand-entered sheet, the portal's own
// figures, and the difference between them on one comparison tab.
export async function GET(req: Request) {
  const denied = await requireAnyPermission(["billing"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const date = new URL(req.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Bad date." }, { status: 400 });

  try {
    const [sheet, system] = await Promise.all([getCashUp(date), takingsFor(date).catch(() => null)]);
    if (!sheet) return NextResponse.json({ error: "No cash-up saved for that day yet." }, { status: 404 });
    const t = sheetTotals(sheet);

    const wb = new ExcelJS.Workbook();
    wb.creator = BUSINESS.name;

    // --- Summary ---
    const s = wb.addWorksheet("Summary");
    s.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
    s.addRow([`${BUSINESS.name} — Daily cash-up`]).font = { bold: true, size: 14 };
    s.addRow([new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })]);
    s.addRow([`Closed by ${sheet.closedBy || "—"}`, sheet.closedAt ? new Date(sheet.closedAt).toLocaleString("en-GB") : ""]);
    s.addRow([]);

    s.addRow(["", "Cash", "Card", "Total"]).font = { bold: true };
    const r1 = s.addRow(["From wholesale customers", "", "", t.fromCustomers]);
    const r2 = s.addRow(["Counter / other sales", sheet.otherCash, sheet.otherCard, t.fromOther]);
    const r3 = s.addRow(["Total received (sheet)", t.byMethod.cash, t.byMethod.card, t.receivedTotal]);
    r3.font = { bold: true };
    for (const r of [r1, r2, r3]) for (let c = 2; c <= 4; c++) r.getCell(c).numFmt = money;
    s.addRow([]);

    const e1 = s.addRow(["Expenses (total)", "", "", t.expensesTotal]);
    const e2 = s.addRow(["…of which from the till (cash)", "", "", t.cashExpenses]);
    for (const r of [e1, e2]) r.getCell(4).numFmt = money;
    s.addRow([]);

    const expected = sheet.openingFloat + t.byMethod.cash - t.cashExpenses;
    for (const [label, val] of [
      ["Opening float", sheet.openingFloat],
      ["+ Cash taken today", t.byMethod.cash],
      ["− Cash expenses", -t.cashExpenses],
      ["Expected in drawer", expected],
      ["Actually counted", sheet.countedCash],
      ["Difference (over / short)", sheet.countedCash - expected],
    ] as [string, number][]) {
      const r = s.addRow([label, "", "", val]);
      r.getCell(4).numFmt = money;
      if (label.startsWith("Expected") || label.startsWith("Difference")) r.font = { bold: true };
    }
    s.addRow([]);
    s.addRow(["Card taken today", "", "", t.byMethod.card]).getCell(4).numFmt = money;
    s.addRow(["Card terminal total", "", "", sheet.countedCard]).getCell(4).numFmt = money;
    // What's physically in hand at close — the counted drawer (float included)
    // plus the day's card. Not the same as takings, which exclude the float.
    const inHand = s.addRow(["TOTAL IN HAND — cash + card", "", "", sheet.countedCash + t.byMethod.card]);
    inHand.font = { bold: true };
    inHand.getCell(4).numFmt = money;
    if (sheet.note) { s.addRow([]); s.addRow(["Note", sheet.note]); }

    // --- Customer payments ---
    const cs = wb.addWorksheet("Customer payments");
    cs.columns = [{ width: 38 }, { width: 16 }, { width: 16 }];
    cs.addRow(["Customer", "Method", "Amount"]).font = { bold: true };
    for (const l of sheet.customerLines) {
      cs.addRow([l.name, cap(l.method), l.amount]).getCell(3).numFmt = money;
    }
    cs.addRow(["TOTAL", "", t.fromCustomers]).font = { bold: true };
    cs.lastRow!.getCell(3).numFmt = money;

    // --- Expenses ---
    const xs = wb.addWorksheet("Expenses");
    xs.columns = [{ width: 38 }, { width: 16 }, { width: 16 }];
    xs.addRow(["Description", "Paid by", "Amount"]).font = { bold: true };
    for (const l of sheet.expenseLines) {
      xs.addRow([l.name, cap(l.method), l.amount]).getCell(3).numFmt = money;
    }
    xs.addRow(["TOTAL", "", t.expensesTotal]).font = { bold: true };
    xs.lastRow!.getCell(3).numFmt = money;

    // --- Sheet vs portal ---
    const vs = wb.addWorksheet("Sheet vs portal");
    vs.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
    vs.addRow(["", "Sheet (typed)", "Portal (system)", "Difference"]).font = { bold: true };
    if (system) {
      for (const [label, a, b] of [
        ["Cash", t.byMethod.cash, system.receivedByMethod.cash],
        ["Card", t.byMethod.card, system.receivedByMethod.card],
        ["Bank transfer", t.byMethod["bank transfer"], system.receivedByMethod["bank transfer"]],
        ["Total received", t.receivedTotal, system.receivedTotal],
        ["From customers", t.fromCustomers, system.fromAccounts],
        ["Counter / other", t.fromOther, system.fromCounter],
        ["Expenses", t.expensesTotal, system.expensesTotal],
      ] as [string, number, number][]) {
        const r = vs.addRow([label, a, b, a - b]);
        for (let c = 2; c <= 4; c++) r.getCell(c).numFmt = money;
        if (Math.abs(a - b) >= 0.01) r.getCell(4).font = { bold: true, color: { argb: "FFB3261E" } };
      }
      vs.addRow([]);
      vs.addRow(["Portal — who paid what"]).font = { bold: true };
      vs.addRow(["Customer", "Method", "Amount"]).font = { bold: true };
      for (const l of system.accountLines) {
        vs.addRow([l.name, cap(l.method), l.amount]).getCell(3).numFmt = money;
      }
    } else {
      vs.addRow(["Portal figures unavailable for this day."]);
    }

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${BRAND_SLUG}-cashup-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Couldn't build the export.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
