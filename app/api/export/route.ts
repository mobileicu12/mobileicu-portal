import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAllProductsForExport, EXPORT_COLUMNS } from "@/lib/products";
import { requirePermission } from "@/lib/guard";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  try {
    const till = new URL(req.url).searchParams.get("scope") === "till";
    const rows = await getAllProductsForExport(till ? "tag:'channel:till'" : undefined);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Products");
    ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    for (const r of rows) ws.addRow(r);
    ws.autoFilter = { from: "A1", to: { row: 1, column: EXPORT_COLUMNS.length } };

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mobileicu-${till ? "till" : "catalog"}-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
