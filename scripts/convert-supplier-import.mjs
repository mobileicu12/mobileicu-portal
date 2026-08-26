// Convert supplier / brand spreadsheets into the Mobile ICU import format.
// Rewrites each workbook to the canonical template columns (see EXPORT_COLUMNS
// in lib/products.ts) so it can be uploaded on the Import/Export page.
//
// Usage:
//   node scripts/convert-supplier-import.mjs <inputDir> [outputDir]
//   node scripts/convert-supplier-import.mjs ./incoming ./converted
//
// - Reads every .xlsx in <inputDir> (first worksheet).
// - Maps columns by header name (case-insensitive, tolerant of supplier
//   naming such as "In shop" -> Shop Price, "Compare at" -> Compare At Price).
// - Skips rows with no Title (the importer requires one).
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const inDir = process.argv[2];
const outDir = process.argv[3] || path.join(inDir ?? ".", "converted");
if (!inDir) {
  console.error("Usage: node scripts/convert-supplier-import.mjs <inputDir> [outputDir]");
  process.exit(1);
}

// Canonical Mobile ICU template columns, plus Description (importer maps it to
// descriptionHtml). Order mirrors the downloadable template.
const TARGET = [
  "Handle (leave blank for new)", "Title", "Brand", "Model", "Type", "Description",
  "Tags (comma separated)", "SKU", "Barcode", "Price", "Compare At Price",
  "Wholesale Price", "Shop Price", "eBay Price", "Amazon Price", "Stock",
  "Status (ACTIVE/DRAFT)", "Image URL", "Shopify Product Type", "Vendor",
  "Collections (read-only)",
];

// Match a source header to a target column using the same substring rules the
// import route (app/api/import/route.ts) applies.
function targetFor(headerRaw) {
  const h = String(headerRaw ?? "").toLowerCase().trim();
  if (!h) return null;
  if (h.includes("handle")) return "Handle (leave blank for new)";
  if (h.includes("title")) return "Title";
  if (h.includes("description")) return "Description";
  if (h.includes("brand")) return "Brand";
  if (h.includes("model")) return "Model";
  if (h.includes("shopify product type")) return "Shopify Product Type";
  if (h === "type" || (h.includes("type") && !h.includes("shopify"))) return "Type";
  if (h.includes("tag")) return "Tags (comma separated)";
  if (h.includes("sku")) return "SKU";
  if (h.includes("barcode")) return "Barcode";
  if (h.includes("compare")) return "Compare At Price";
  if (h.includes("wholesale")) return "Wholesale Price";
  if ((h.includes("shop") && h.includes("price")) || h === "in shop" || h === "shop") return "Shop Price";
  if (h.includes("ebay")) return "eBay Price";
  if (h.includes("amazon")) return "Amazon Price";
  if (h.includes("stock") || h.includes("quantity") || h.includes("available")) return "Stock";
  if (h.includes("status")) return "Status (ACTIVE/DRAFT)";
  if (h.includes("image")) return "Image URL";
  if (h.includes("vendor")) return "Vendor";
  if (h.includes("collection")) return "Collections (read-only)";
  return null;
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return v.text ?? v.hyperlink;
  }
  return v;
}

fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(inDir).filter((f) => f.toLowerCase().endsWith(".xlsx") && !f.startsWith("~$"));
if (files.length === 0) {
  console.error(`No .xlsx files found in ${inDir}`);
  process.exit(1);
}

let grandTotal = 0;
for (const file of files.sort()) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(inDir, file));
  const ws = wb.worksheets[0];

  // Build: target header -> source column index.
  const colFor = {};
  ws.getRow(1).eachCell((cell, col) => {
    const t = targetFor(cellText(cell));
    if (t && !(t in colFor)) colFor[t] = col;
  });

  const outWb = new ExcelJS.Workbook();
  const outWs = outWb.addWorksheet("Products");
  outWs.columns = TARGET.map((h) => ({ header: h, key: h, width: 18 }));
  outWs.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  outWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14110E" } };

  let n = 0, skipped = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const src = ws.getRow(r);
    const title = colFor.Title ? cellText(src.getCell(colFor.Title)) : null;
    if (title === null || String(title).trim() === "") { skipped++; continue; }
    const out = TARGET.map((h) => (colFor[h] ? cellText(src.getCell(colFor[h])) : null));
    outWs.addRow(out);
    n++;
  }

  await outWb.xlsx.writeFile(path.join(outDir, file));
  grandTotal += n;
  console.log(`${file.padEnd(40)} ${n} rows${skipped ? ` (${skipped} skipped, no title)` : ""}`);
}
console.log(`\nWrote ${files.length} file(s), ${grandTotal} product rows -> ${outDir}`);
