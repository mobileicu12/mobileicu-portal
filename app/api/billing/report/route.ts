import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listInvoices, summarizeByStaff, type InvoiceRow } from "@/lib/billing";
import { SEGMENTS } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

function dayBounds(from?: string | null, to?: string | null) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const f = new Date(`${from || today}T00:00:00`);
  const t = new Date(`${to || from || today}T23:59:59.999`);
  return { start: f, end: t };
}

// GET /api/billing/report?from=YYYY-MM-DD&to=YYYY-MM-DD  (defaults to today)
// A whole-day (or range) business report: totals, per-staff, per-source, and every invoice.
export async function GET(req: Request) {
  const denied = await requirePermission("invoices");
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });

  const sp = new URL(req.url).searchParams;
  const { start, end } = dayBounds(sp.get("from"), sp.get("to"));
  const fromStr = start.toLocaleDateString("en-GB");
  const toStr = end.toLocaleDateString("en-GB");
  const rangeLabel = fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`;

  try {
    const settings = await getSettings().catch(() => null);
    const bizName = settings?.bizName || "MOBILE ICU";

    const all = await listInvoices();
    const rows: InvoiceRow[] = all.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= start && d <= end;
    });

    const num = (s: string) => parseFloat(s) || 0;
    let total = 0, paid = 0, outstanding = 0;
    for (const r of rows) {
      const t = num(r.total);
      total += t;
      if (r.status === "COMPLETED") paid += t; else outstanding += t;
    }
    const byStaff = summarizeByStaff(rows);
    const bySeg = SEGMENTS.map((s) => {
      const list = rows.filter((r) => r.segment === s.key);
      return { label: s.label, count: list.length, total: list.reduce((a, r) => a + num(r.total), 0) };
    }).filter((s) => s.count > 0);

    const wb = new ExcelJS.Workbook();
    const money = '"£"#,##0.00';
    const headerFill = (ws: ExcelJS.Worksheet, count: number) => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
      ws.autoFilter = { from: "A1", to: { row: 1, column: count } };
    };

    // --- Summary sheet ---
    const sum = wb.addWorksheet("Summary");
    sum.columns = [{ width: 26 }, { width: 20 }, { width: 14 }];
    sum.addRow([`${bizName} — Business report`]);
    sum.getRow(1).font = { bold: true, size: 14 };
    sum.addRow([`Period: ${rangeLabel}`]);
    sum.addRow([`Generated: ${new Date().toLocaleString("en-GB")}`]);
    sum.addRow([]);
    sum.addRow(["Total sales", total]).getCell(2).numFmt = money;
    sum.addRow(["Paid (completed)", paid]).getCell(2).numFmt = money;
    sum.addRow(["Outstanding (draft)", outstanding]).getCell(2).numFmt = money;
    sum.addRow(["Invoices / bills", rows.length]);
    sum.getRow(5).font = { bold: true };

    sum.addRow([]);
    const staffHead = sum.addRow(["By teammate", "Sales", "Bills"]);
    staffHead.font = { bold: true };
    for (const s of byStaff) {
      const r = sum.addRow([s.staff === "unattributed" ? "Unattributed" : s.staff, s.total, s.count]);
      r.getCell(2).numFmt = money;
    }
    sum.addRow([]);
    const segHead = sum.addRow(["By source", "Sales", "Bills"]);
    segHead.font = { bold: true };
    for (const s of bySeg) {
      const r = sum.addRow([s.label, s.total, s.count]);
      r.getCell(2).numFmt = money;
    }

    // --- Invoices sheet ---
    const ws = wb.addWorksheet("Invoices");
    ws.columns = [
      { header: "Invoice #", key: "no", width: 18 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Teammate", key: "staff", width: 20 },
      { header: "Source", key: "source", width: 14 },
      { header: "Status", key: "status", width: 12 },
      { header: "Date & time", key: "date", width: 20 },
      { header: "Total (£)", key: "total", width: 14 },
    ];
    for (const r of rows) {
      const seg = SEGMENTS.find((s) => s.key === r.segment);
      const row = ws.addRow({
        no: r.invoiceNo || r.name,
        customer: r.customer,
        staff: r.staff ? r.staff.split("@")[0] : "—",
        source: seg?.label ?? "—",
        status: r.status === "COMPLETED" ? "PAID" : "DRAFT",
        date: new Date(r.createdAt).toLocaleString("en-GB"),
        total: num(r.total),
      });
      row.getCell("total").numFmt = money;
    }
    headerFill(ws, 7);
    const totalRow = ws.addRow({ status: "TOTAL", total });
    totalRow.font = { bold: true };
    totalRow.getCell("total").numFmt = money;

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = fromStr === toStr ? start.toISOString().slice(0, 10) : `${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mobileicu-report-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Report failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
