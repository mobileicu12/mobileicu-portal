import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { importRows, type ImportRow } from "@/lib/products";
import { shopifyConfigured, ShopifyError } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 300;

function headerToKey(headerRaw: string): keyof ImportRow | "stock" | null {
  const h = headerRaw.toLowerCase().trim();
  if (h.includes("handle")) return "handle";
  if (h.includes("title")) return "title";
  if (h.includes("brand")) return "brand";
  if (h.includes("model")) return "model";
  if (h.includes("shopify product type")) return "shopifyType";
  if (h === "type" || (h.includes("type") && !h.includes("shopify"))) return "type";
  if (h.includes("tag")) return "tags";
  if (h.includes("sku")) return "sku";
  if (h.includes("barcode")) return "barcode";
  if (h.includes("compare")) return "compareAt";
  if (h.includes("price")) return "price";
  if (h.includes("stock") || h.includes("quantity") || h.includes("available")) return "stock";
  if (h.includes("status")) return "status";
  if (h.includes("image")) return "image";
  if (h.includes("vendor")) return "vendor";
  return null; // collections (read-only) and unknown columns ignored
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? (v as { hyperlink: string }).hyperlink);
  }
  return String(v);
}

export async function POST(req: Request) {
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    const buf = Buffer.from(await (file as File).arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: "Empty workbook." }, { status: 400 });

    // Map columns from the header row.
    const colMap: Record<number, keyof ImportRow | "stock"> = {};
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, col) => {
      const key = headerToKey(cellText(cell));
      if (key) colMap[col] = key;
    });

    const rows: ImportRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const obj: Record<string, string> = {};
      let hasData = false;
      for (const [colStr, key] of Object.entries(colMap)) {
        const text = cellText(row.getCell(Number(colStr))).trim();
        if (text) hasData = true;
        obj[key] = text;
      }
      if (hasData && obj.title) rows.push(obj as ImportRow);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found (each row needs a Title)." }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Please import 500 rows or fewer at a time." }, { status: 400 });
    }

    const results = await importRows(rows);
    const created = results.filter((r) => r.action.startsWith("created")).length;
    const updated = results.filter((r) => r.action.startsWith("updated")).length;
    const failed = results.filter((r) => !r.ok).length;
    return NextResponse.json({ total: results.length, created, updated, failed, results });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Import failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
