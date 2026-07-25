// Client-side barcode label printing. Renders Code128 labels (barcode + name +
// price + SKU) and opens a print window sized for A4 label sheets or a thermal roll.
"use client";

import JsBarcode from "jsbarcode";

export type LabelItem = { code: string; title: string; price?: string; sku?: string };

export type LabelPresetKey = "sheet-65" | "sheet-24" | "thermal-50x25" | "thermal-57x32";

export const LABEL_PRESETS: { key: LabelPresetKey; label: string }[] = [
  { key: "sheet-65", label: "A4 sheet · 38×21mm (65/page)" },
  { key: "sheet-24", label: "A4 sheet · 63×34mm (24/page)" },
  { key: "thermal-50x25", label: "Thermal roll · 50×25mm" },
  { key: "thermal-57x32", label: "Thermal roll · 57×32mm" },
];

type Geom = { w: number; h: number; thermal: boolean; barH: number };
const GEOM: Record<LabelPresetKey, Geom> = {
  "sheet-65": { w: 38.1, h: 21.2, thermal: false, barH: 24 },
  "sheet-24": { w: 63.5, h: 33.9, thermal: false, barH: 34 },
  "thermal-50x25": { w: 50, h: 25, thermal: true, barH: 28 },
  "thermal-57x32": { w: 57, h: 32, thermal: true, barH: 36 },
};

export type LabelOptions = {
  preset: LabelPresetKey;
  copies?: number; // copies per item
  showName?: boolean;
  showPrice?: boolean;
  showSku?: boolean;
  currency?: string;
};

function barcodeSvg(code: string, barHeightPx: number): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      width: 1.4,
      height: barHeightPx,
      displayValue: true,
      fontSize: 11,
      margin: 0,
      textMargin: 1,
    });
  } catch {
    return `<div style="font:10px monospace">${code}</div>`;
  }
  return svg.outerHTML;
}

const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export function printBarcodeLabels(items: LabelItem[], opts: LabelOptions): void {
  const g = GEOM[opts.preset];
  const copies = Math.max(1, opts.copies ?? 1);
  const cur = opts.currency === "USD" ? "$" : opts.currency === "EUR" ? "€" : "£";

  const labels: string[] = [];
  for (const it of items) {
    if (!it.code) continue;
    const bc = barcodeSvg(it.code, g.barH);
    const name = opts.showName !== false ? `<div class="ln">${esc(it.title)}</div>` : "";
    const price = opts.showPrice !== false && it.price ? `<div class="lp">${cur}${esc(it.price)}</div>` : "";
    const sku = opts.showSku && it.sku ? `<div class="ls">${esc(it.sku)}</div>` : "";
    const inner = `<div class="label"><div class="lhead">${name}${price}</div><div class="lbc">${bc}</div>${sku}</div>`;
    for (let i = 0; i < copies; i++) labels.push(inner);
  }

  if (!labels.length) { alert("No items with a code to print."); return; }

  const pageCss = g.thermal
    ? `@page { size: ${g.w}mm ${g.h}mm; margin: 0 }
       body { margin: 0 }
       .sheet { }
       .label { width: ${g.w}mm; height: ${g.h}mm; page-break-after: always; }`
    : `@page { size: A4; margin: 8mm 5mm }
       .sheet { display: flex; flex-wrap: wrap; align-content: flex-start; }
       .label { width: ${g.w}mm; height: ${g.h}mm; }`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Barcode labels</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color:#000; }
      ${pageCss}
      .label { display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; padding:1mm 1.5mm; text-align:center; }
      .lhead { display:flex; align-items:baseline; justify-content:center; gap:2mm; width:100%; }
      .ln { font-size:8pt; font-weight:600; line-height:1.05; max-height:2.4em; overflow:hidden; }
      .lp { font-size:10pt; font-weight:800; white-space:nowrap; }
      .lbc { width:100%; }
      .lbc svg { width:100%; height:auto; max-height:${g.barH + 14}px; }
      .ls { font-size:7pt; color:#333; }
    </style></head>
    <body><div class="sheet">${labels.join("")}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
    </body></html>`;

  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) { alert("Please allow pop-ups to print labels."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
