// Dry-run preview + a couple of import helpers layered on top of the importer.
//
// The preview reads the catalog and works out what each row of a sheet WOULD do
// (create / update / skip / fail) and, for an update, which fields change — all
// without writing anything. Apply is the writing path (see the API route).
import {
  getAllProductsForExport,
  getManualCollections,
  type ImportRow,
  type ProductRecord,
} from "./products";
import { createCollection } from "./collections";

export type ParsedImportRow = { row: number; data: ImportRow };

export type PreviewRow = {
  row: number;
  title: string;
  ok: boolean;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
  changes?: string[];
  collections?: string[];
  duplicateOf?: string;
};

export type PreviewSummary = {
  dryRun: true;
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  results: PreviewRow[];
};

const norm = (s: string | undefined) => (s ?? "").trim();
const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const sameTags = (a: string, b: string) => {
  const set = (t: string) => t.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|").toLowerCase();
  return set(a) === set(b);
};
const sameNum = (a: string, b: string) => {
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? x === y : norm(a) === norm(b);
};

const DIFF: { label: string; of: (d: ImportRow) => string | undefined; cur: (r: ProductRecord) => string; cmp?: (a: string, b: string) => boolean }[] = [
  { label: "title", of: (d) => d.title, cur: (r) => r.title },
  { label: "price", of: (d) => d.price, cur: (r) => r.price, cmp: sameNum },
  { label: "compare-at", of: (d) => d.compareAt, cur: (r) => r.compareAt, cmp: sameNum },
  { label: "wholesale", of: (d) => d.wholesale, cur: (r) => r.wholesale, cmp: sameNum },
  { label: "shop", of: (d) => d.shopPrice, cur: (r) => r.shopPrice, cmp: sameNum },
  { label: "eBay", of: (d) => d.ebayPrice, cur: (r) => r.ebayPrice, cmp: sameNum },
  { label: "amazon", of: (d) => d.amazonPrice, cur: (r) => r.amazonPrice, cmp: sameNum },
  { label: "stock", of: (d) => (d.stock === undefined ? undefined : String(d.stock)), cur: (r) => String(r.available), cmp: sameNum },
  { label: "SKU", of: (d) => d.sku, cur: (r) => r.sku },
  { label: "barcode", of: (d) => d.barcode, cur: (r) => r.barcode },
  { label: "brand", of: (d) => d.brand, cur: (r) => r.brand },
  { label: "model", of: (d) => d.model, cur: (r) => r.model },
  { label: "type", of: (d) => d.type, cur: (r) => r.type },
  { label: "vendor", of: (d) => d.vendor, cur: (r) => r.vendor },
  { label: "status", of: (d) => d.status, cur: (r) => r.status, cmp: (a, b) => a.toUpperCase() === b.toUpperCase() },
  { label: "tags", of: (d) => d.tags, cur: (r) => r.tags, cmp: sameTags },
];

export async function previewImport(rows: ParsedImportRow[], assignCollection: string): Promise<PreviewSummary> {
  const all = await getAllProductsForExport();
  const byHandle = new Map<string, ProductRecord>();
  const bySku = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const r of all) {
    if (r.handle) byHandle.set(r.handle, r);
    if (r.sku.trim()) bySku.set(r.sku.trim().toLowerCase(), r.title);
    byTitle.set(normTitle(r.title), r.title);
  }

  const cols = assignCollection.trim() ? [assignCollection.trim()] : undefined;
  const results: PreviewRow[] = rows.map((p) => {
    const d = p.data;
    const handle = norm(d.handle);
    const cur = handle ? byHandle.get(handle) : undefined;

    if (cur) {
      const changes: string[] = [];
      for (const f of DIFF) {
        const next = f.of(d);
        if (next === undefined || next === "") continue; // blank cell = no change
        const same = (f.cmp ?? ((a, b) => norm(a) === norm(b)))(next, f.cur(cur));
        if (!same) changes.push(`${f.label} ${f.cur(cur) || "—"}→${next}`);
      }
      return {
        row: p.row,
        title: d.title,
        ok: true,
        action: changes.length ? "updated" : "skipped",
        changes: changes.length ? changes : undefined,
        collections: cols,
      };
    }

    // A create (a handle that matches nothing creates, as the importer does).
    const sku = norm(d.sku).toLowerCase();
    const dupOf = (sku && bySku.get(sku)) || byTitle.get(normTitle(d.title)) || undefined;
    return { row: p.row, title: d.title, ok: true, action: "created", collections: cols, duplicateOf: dupOf };
  });

  return {
    dryRun: true,
    total: results.length,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    failed: results.filter((r) => r.action === "failed").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    results,
  };
}

/** Find a manual collection by title (case-insensitive), creating it if needed. */
export async function resolveCollectionId(title: string): Promise<string | null> {
  const t = title.trim();
  if (!t) return null;
  const existing = await getManualCollections();
  const hit = existing.find((c) => c.title.trim().toLowerCase() === t.toLowerCase());
  if (hit) return hit.id;
  const made = await createCollection({ title: t });
  return made.id;
}
