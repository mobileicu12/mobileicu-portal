import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listInvoices, getInvoiceDetail } from "@/lib/billing";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/billing/export           -> all invoices summary xlsx
// GET /api/billing/export?id=<gid>  -> single invoice with line items xlsx
export async function GET(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  const idsParam = sp.get("ids");
  const idSet = idsParam ? new Set(idsParam.split(",").map((x) => decodeURIComponent(x))) : null;
  try {
    const wb = new ExcelJS.Workbook();
    const stamp = new Date().toISOString().slice(0, 10);
    let filename = `mobileicu-invoices-${stamp}.xlsx`;

    const headerStyle = (ws: ExcelJS.Worksheet, count: number) => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
      ws.autoFilter = { from: "A1", to: { row: 1, column: count } };
    };

    if (id) {
      const inv = await getInvoiceDetail(decodeURIComponent(id));
      filename = `${inv.name.replace(/[^\w-]/g, "")}.xlsx`;
      const ws = wb.addWorksheet("Invoice");
      ws.columns = [
        { header: "#", key: "n", width: 6 },
        { header: "Description", key: "title", width: 44 },
        { header: "SKU", key: "sku", width: 18 },
        { header: "Qty", key: "qty", width: 8 },
        { header: "Unit (£)", key: "unit", width: 12 },
        { header: "Total (£)", key: "total", width: 12 },
      ];
      inv.lines.forEach((l, i) =>
        ws.addRow({ n: i + 1, title: l.title, sku: l.sku, qty: l.quantity, unit: +l.unitPrice, total: +l.lineTotal }),
      );
      headerStyle(ws, 6);
      ws.addRow({});
      ws.addRow({ unit: "Subtotal", total: +inv.subtotal });
      if (+inv.discount > 0) ws.addRow({ unit: "Discount", total: -+inv.discount });
      ws.addRow({ unit: inv.taxExempt ? "VAT" : "VAT (20%)", total: inv.taxExempt ? 0 : +inv.tax });
      const totalRow = ws.addRow({ unit: "TOTAL", total: +inv.total });
      totalRow.font = { bold: true };

      const meta = wb.addWorksheet("Details");
      meta.columns = [
        { header: "Field", key: "f", width: 20 },
        { header: "Value", key: "v", width: 44 },
      ];
      meta.addRows([
        { f: "Invoice", v: inv.name },
        { f: "Status", v: inv.status },
        { f: "Date", v: new Date(inv.createdAt).toLocaleDateString("en-GB") },
        { f: "Customer", v: inv.customerName },
        { f: "Email", v: inv.customerEmail },
        { f: "Phone", v: inv.customerPhone },
        { f: "VAT applied", v: inv.taxExempt ? "No" : "Yes" },
        { f: "Total", v: `£${inv.total}` },
        { f: "Notes", v: inv.note },
      ]);
      headerStyle(meta, 2);
    } else {
      let invoices = await listInvoices();
      if (idSet) { invoices = invoices.filter((inv) => idSet.has(inv.id)); filename = `mobileicu-invoices-selected-${stamp}.xlsx`; }
      const ws = wb.addWorksheet("Invoices");
      ws.columns = [
        { header: "Invoice", key: "name", width: 14 },
        { header: "Customer", key: "customer", width: 30 },
        { header: "Status", key: "status", width: 14 },
        { header: "Date", key: "date", width: 14 },
        { header: "Total (£)", key: "total", width: 12 },
      ];
      invoices.forEach((inv) =>
        ws.addRow({
          name: inv.name,
          customer: inv.customer,
          status: inv.status,
          date: new Date(inv.createdAt).toLocaleDateString("en-GB"),
          total: +inv.total,
        }),
      );
      headerStyle(ws, 5);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
