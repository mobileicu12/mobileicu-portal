import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { importRows, bulkAddToCollection, type ImportRow } from "@/lib/products";
import { previewImport, resolveCollectionId, type ParsedImportRow } from "@/lib/import-preview";
import { appendRun } from "@/lib/import-runs";
import { stageRows, readStageSlice, clearStage } from "@/lib/import-stage";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
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
  if (h.includes("wholesale")) return "wholesale";
  if (h.includes("shop") && h.includes("price")) return "shopPrice";
  if (h.includes("ebay")) return "ebayPrice";
  if (h.includes("amazon")) return "amazonPrice";
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


type ApplyInput = {
  slice: ParsedImportRow[];
  total: number;
  from: number;
  filename: string;
  /** Cleared once the last slice lands. */
  stageId?: string;
};

/** Apply one slice of a sheet and record it against the run. */
async function applyRows(req: Request, form: FormData, input: ApplyInput) {
  const { slice, total, from, filename } = input;
  const till = new URL(req.url).searchParams.get("scope") === "till";
  const extraTags = till ? ["channel:till"] : [];
  const assignCollection = ((form.get("assignCollection") as string | null) ?? "").trim();
  const runId = ((form.get("runId") as string | null) ?? "").trim()
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const results = await importRows(slice.map((s) => s.data), extraTags);

  // Add the products that went in to the chosen collection.
  if (assignCollection) {
    try {
      const collectionId = await resolveCollectionId(assignCollection);
      const ids = results.map((r) => r.productId).filter((v): v is string => Boolean(v));
      if (collectionId && ids.length) await bulkAddToCollection(ids, collectionId);
    } catch {
      /* collection assignment is best-effort; the import itself succeeded */
    }
  }

  // The products are already written by this point, so a failure to record
  // them is reported alongside the result rather than thrown. Throwing would
  // return an error for a slice that succeeded, and the caller would have no
  // way of knowing those products exist — the orphans this is meant to stop.
  let run: Awaited<ReturnType<typeof appendRun>> | null = null;
  let recordError = "";
  try {
    run = await appendRun(runId, { filename, scope: till ? "till" : "catalog", results, from });
  } catch (e) {
    recordError = e instanceof Error ? e.message : "Could not record this part of the import.";
  }

  const created = results.filter((r) => r.ok && r.action.startsWith("created")).length;
  const updated = results.filter((r) => r.ok && r.action.startsWith("updated")).length;
  const failed = results.filter((r) => !r.ok).length;

  // Audit the import once — on the first slice.
  if (from === 0) {
    await audit("import.run", {
      ref: runId,
      name: filename,
      detail: `${created} created, ${updated} updated (import started)`,
    }).catch(() => {});
  }

  // Last slice in: the staged copy of the sheet has done its job.
  if (input.stageId && from + slice.length >= total) {
    void clearStage(input.stageId).catch(() => {});
  }

  return NextResponse.json({
    dryRun: false,
    total,
    created,
    updated,
    failed,
    skipped: 0,
    runId,
    run,
    recordError: recordError || undefined,
    results: results.map((r, i) => ({
      row: slice[i]?.row ?? 0,
      title: r.title,
      ok: r.ok,
      action: r.ok && r.action.startsWith("created") ? "created" : r.ok && r.action.startsWith("updated") ? "updated" : "failed",
      error: r.error,
      collections: assignCollection ? [assignCollection] : undefined,
    })),
  });
}

/** Apply a slice of a sheet that was uploaded and parsed earlier. */
async function applySlice(req: Request, form: FormData, stageId: string) {
  const from = Math.max(0, Number(form.get("from") ?? 0) || 0);
  const toRaw = Number(form.get("to"));
  const { rows, total } = await readStageSlice(
    stageId,
    from,
    Number.isFinite(toRaw) && toRaw > 0 ? toRaw : Number.MAX_SAFE_INTEGER,
  );
  return await applyRows(req, form, {
    slice: rows,
    total,
    from,
    filename: ((form.get("filename") as string | null) ?? "import.xlsx").trim() || "import.xlsx",
    stageId,
  });
}

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  if (!shopifyConfigured()) {
    return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  }
  try {
    const form = await req.formData();
    const stageId = ((form.get("stageId") as string | null) ?? "").trim();

    // Applying a slice of an already-uploaded sheet. The file was parsed once
    // when it was staged, so these requests carry a few kilobytes rather than
    // the whole workbook — which is what makes a 3,000-row sheet practical.
    if (stageId) {
      return await applySlice(req, form, stageId);
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    const dryRun = form.get("dryRun") === "1";
    const assignCollection = ((form.get("assignCollection") as string | null) ?? "").trim();

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

    const rows: ParsedImportRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const obj: Record<string, string> = {};
      let hasData = false;
      for (const [colStr, key] of Object.entries(colMap)) {
        const text = cellText(row.getCell(Number(colStr))).trim();
        if (text) hasData = true;
        obj[key] = text;
      }
      if (hasData && obj.title) rows.push({ row: r, data: obj as ImportRow });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found (each row needs a Title)." }, { status: 400 });
    }
    // A safety ceiling on one workbook (memory), not a per-request limit — big
    // sheets are applied in chunks (from/to below).
    if (rows.length > 20000) {
      return NextResponse.json({ error: "That sheet has over 20,000 rows — split it into separate files." }, { status: 400 });
    }

    // Preview: work out what the whole sheet would do, write nothing — and
    // park the parsed rows so applying them needs no further upload.
    if (dryRun) {
      const [preview, staged] = await Promise.all([
        previewImport(rows, assignCollection),
        stageRows(rows),
      ]);
      return NextResponse.json({ ...preview, stageId: staged.stageId });
    }

    // A file posted without dryRun applies straight away — Till items still
    // imports that way, and a small sheet has no need of staging.
    const from0 = Math.max(0, Number(form.get("from") ?? 0) || 0);
    const toRaw0 = Number(form.get("to"));
    const to0 = Number.isFinite(toRaw0) && toRaw0 > 0 ? toRaw0 : rows.length;
    return await applyRows(req, form, {
      slice: rows.slice(from0, to0),
      total: rows.length,
      from: from0,
      filename: (file as File).name || "import.xlsx",
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : e instanceof Error ? e.message : "Import failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
