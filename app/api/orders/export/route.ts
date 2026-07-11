import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { listOrders } from "@/lib/orders";
import { SEGMENTS } from "@/lib/segments";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

const segLabel = (k: string | null) => SEGMENTS.find((s) => s.key === k)?.label ?? "—";
const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

export async function GET(req: Request) {
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const idsParam = new URL(req.url).searchParams.get("ids");
  const idSet = idsParam ? new Set(idsParam.split(",").map((x) => decodeURIComponent(x))) : null;
  try {
    let orders = await listOrders();
    if (idSet) orders = orders.filter((o) => idSet.has(o.id));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Orders");
    ws.columns = [
      { header: "Order", key: "name", width: 12 },
      { header: "Customer", key: "customer", width: 28 },
      { header: "Source", key: "source", width: 18 },
      { header: "Payment", key: "pay", width: 14 },
      { header: "Fulfilment", key: "ful", width: 16 },
      { header: "Items", key: "items", width: 8 },
      { header: "Date", key: "date", width: 14 },
      { header: "Total (£)", key: "total", width: 12 },
    ];
    orders.forEach((o) =>
      ws.addRow({
        name: o.name,
        customer: o.customer,
        source: segLabel(o.segment),
        pay: pretty(o.financialStatus),
        ful: pretty(o.fulfillmentStatus),
        items: o.itemCount,
        date: new Date(o.createdAt).toLocaleDateString("en-GB"),
        total: +o.total,
      }),
    );
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };
    ws.autoFilter = { from: "A1", to: { row: 1, column: 8 } };

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="mobileicu-orders${idSet ? "-selected" : ""}-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Export failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
