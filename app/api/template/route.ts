import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { EXPORT_COLUMNS } from "@/lib/products";

export const runtime = "nodejs";

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };

  // Example row to guide the user.
  ws.addRow({
    handle: "",
    title: "iPhone 15 Pro LCD Screen Replacement",
    brand: "MobileICU",
    model: "iPhone 15 Pro",
    type: "Screen",
    tags: "iPhone 15 Pro, iPhone Parts, LCD",
    sku: "IP15P-LCD",
    barcode: "",
    price: "39.99",
    compareAt: "",
    available: 25,
    status: "ACTIVE",
    image: "https://example.com/lcd.jpg",
    shopifyType: "iPhone Parts",
    vendor: "Mobile ICU",
    collections: "",
  });
  ws.getRow(2).font = { italic: true, color: { argb: "FF999999" } };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mobileicu-import-template.xlsx"`,
    },
  });
}
