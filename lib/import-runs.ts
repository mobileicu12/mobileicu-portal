// Import history, and the ability to put an import back.
//
// A spreadsheet import can rewrite hundreds of products in one click. Until now
// it left no trace at all: no record of who ran it, what it touched, or what the
// products looked like beforehand — so a bad file meant re-keying the catalogue
// by hand. Every run is now recorded with a snapshot of each product it changed,
// which is what makes undo possible.
//
// Storage: shop metafields.
//   portal.import_runs             — the index, summaries only, newest first
//   portal.import_run_<id>_<from>  — the rows written by ONE chunk, with their
//                                    before-snapshots
//
// One metafield per chunk, not one per run. A big sheet is applied in many
// requests, and the first version read the run's whole row list back, appended
// to it and wrote it out again on every chunk. Three ways that lost data:
// the blob grew until it tripped the size ceiling and the snapshots were
// dropped; a failed write was swallowed and that chunk's rows vanished; and if
// the index write failed, the NEXT chunk saw no prior run and overwrote the
// detail with only its own rows. A 906-row import that stopped at 440 was left
// recording 200, so undo deleted 200 and left 240 products orphaned.
//
// Chunk keys are derived from the row offset, so a retried chunk overwrites its
// own key and nothing else, and no chunk ever reads or rewrites another's.
import { adminGraphQL, getLocations, ShopifyError } from "./shopify";
import { restoreProduct, deleteProduct, type ProductSnapshot, type UpsertResult } from "./products";
import { currentActor } from "./audit";
import type { ImportRun, ImportRunRow, ImportRunSummary, ImportUndo } from "./import-types";

export type { ImportRun, ImportRunRow, ImportRunSummary, ImportUndo } from "./import-types";

const NS = "portal";
const INDEX_KEY = "import_runs";
/** Runs kept in the index. Older ones drop off; their detail is left behind
 *  harmlessly rather than chasing metafield deletes on every import. */
const MAX_RUNS = 40;
/** A single chunk's ceiling. At the 40 rows the screen sends this is nowhere
 *  near it; the check is here so an oversized chunk fails loudly and asks for
 *  smaller ones, rather than silently losing the snapshots undo depends on. */
const MAX_CHUNK_BYTES = 900_000;

/** A stored row keeps the snapshot; the client-facing type doesn't. */
type StoredRow = ImportRunRow & { before?: ProductSnapshot | null };
type StoredRun = Omit<ImportRun, "rows"> & { rows: StoredRow[] };

async function shopGid(): Promise<string> {
  const d = await adminGraphQL<{ shop: { id: string } }>(`query { shop { id } }`);
  return d.shop.id;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const d = await adminGraphQL<{ shop: { metafield: { value: string } | null } }>(
    `query($ns: String!, $key: String!) { shop { metafield(namespace: $ns, key: $key) { value } } }`,
    { ns: NS, key },
  );
  if (!d.shop.metafield?.value) return fallback;
  try {
    return JSON.parse(d.shop.metafield.value) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const ownerId = await shopGid();
  const res = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: [{ ownerId, namespace: NS, key, type: "json", value: JSON.stringify(value) }] },
  );
  if (res.metafieldsSet.userErrors.length) {
    throw new ShopifyError(res.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  }
}

const chunkKey = (id: string, from: number) => `import_run_${id}_${from}`;

/** Drop the before-snapshot. Snapshots are for undo, not for the screen. */
const stripSnapshot = (r: StoredRow): ImportRunRow => ({
  title: r.title,
  handle: r.handle,
  productId: r.productId,
  action: r.action,
  ok: r.ok,
  error: r.error,
  undoable: r.undoable,
});

export async function listRuns(): Promise<ImportRunSummary[]> {
  return readJson<ImportRunSummary[]>(INDEX_KEY, []);
}

export async function getRun(id: string): Promise<StoredRun | null> {
  const summary = (await listRuns()).find((r) => r.id === id);
  if (!summary) return null;
  // Chunks are read in the order they were written, so rows stay in sheet order.
  const rows: StoredRow[] = [];
  for (const from of [...(summary.chunks ?? [])].sort((a, b) => a - b)) {
    rows.push(...(await readJson<StoredRow[]>(chunkKey(id, from), [])));
  }
  return { ...summary, rows };
}

/** The run without its snapshots — what the history screen gets. */
export async function getRunForDisplay(id: string): Promise<ImportRun | null> {
  const run = await getRun(id);
  if (!run) return null;
  return { ...run, rows: run.rows.map(stripSnapshot) };
}

async function putSummary(summary: ImportRunSummary): Promise<void> {
  const list = await listRuns();
  const next = [summary, ...list.filter((r) => r.id !== summary.id)].slice(0, MAX_RUNS);
  await writeJson(INDEX_KEY, next);
}

/** Build stored rows (with undoable flags) from a chunk's results. */
function toStoredRows(results: UpsertResult[]): StoredRow[] {
  return results.map((r) => {
    const created = r.ok && r.action.startsWith("created");
    const updated = r.ok && r.action.startsWith("updated");
    return {
      title: r.title,
      handle: r.handle,
      productId: r.productId,
      action: r.action,
      ok: r.ok,
      error: r.error,
      undoable: Boolean(r.productId) && (created || (updated && Boolean(r.before))),
      before: r.before ?? null,
    };
  });
}

/**
 * Record one chunk of an import.
 *
 * Throws if the chunk can't be stored. It used to swallow the error and return
 * null, so an import that wrote 440 products could quietly end up with 200 on
 * record — and undo would then delete 200 and leave the rest orphaned. A run
 * that can't be recorded has to be loud, because the alternative is products
 * nobody can account for.
 */
export async function appendRun(
  id: string,
  opts: { filename: string; scope: string; results: UpsertResult[]; from: number },
): Promise<ImportRunSummary> {
  const rows = toStoredRows(opts.results);

  const size = JSON.stringify(rows).length;
  if (size > MAX_CHUNK_BYTES) {
    throw new ShopifyError(
      `This batch is too large to record (${Math.round(size / 1000)}KB). Import in smaller batches so the run stays undoable.`,
    );
  }

  // This chunk's rows, under a key derived from its offset. Retrying a chunk
  // rewrites its own key; no other chunk is read or touched.
  await writeJson(chunkKey(id, opts.from), rows);

  const prior = (await listRuns()).find((r) => r.id === id);
  const chunks = [...new Set([...(prior?.chunks ?? []), opts.from])].sort((a, b) => a - b);

  const add = (n: number | undefined, m: number) => (n ?? 0) + m;
  // Counts accumulate from the previous summary rather than being recomputed
  // from every row, so recording a chunk never depends on reading the others.
  const replacing = prior?.chunks?.includes(opts.from) ?? false;
  const base = replacing
    ? { created: 0, updated: 0, failed: 0, total: 0, undoableRows: 0 }
    : {
        created: prior?.created ?? 0,
        updated: prior?.updated ?? 0,
        failed: prior?.failed ?? 0,
        total: prior?.total ?? 0,
        undoableRows: prior?.undoableRows ?? 0,
      };
  // A retried chunk means the totals have to be rebuilt from the stored chunks,
  // otherwise its rows would be counted twice.
  let created = base.created, updated = base.updated, failed = base.failed;
  let total = base.total, undoableRows = base.undoableRows;
  if (replacing) {
    for (const from of chunks) {
      const stored = from === opts.from ? rows : await readJson<StoredRow[]>(chunkKey(id, from), []);
      created += stored.filter((r) => r.ok && r.action.startsWith("created")).length;
      updated += stored.filter((r) => r.ok && r.action.startsWith("updated")).length;
      failed += stored.filter((r) => !r.ok).length;
      undoableRows += stored.filter((r) => r.undoable).length;
      total += stored.length;
    }
  } else {
    created = add(created, rows.filter((r) => r.ok && r.action.startsWith("created")).length);
    updated = add(updated, rows.filter((r) => r.ok && r.action.startsWith("updated")).length);
    failed = add(failed, rows.filter((r) => !r.ok).length);
    undoableRows = add(undoableRows, rows.filter((r) => r.undoable).length);
    total = add(total, rows.length);
  }

  const changed = created + updated;
  const summary: ImportRunSummary = {
    id,
    at: prior?.at ?? new Date().toISOString(),
    by: prior?.by ?? (await currentActor().catch(() => "unknown")),
    filename: opts.filename,
    scope: opts.scope,
    chunks,
    total,
    created,
    updated,
    failed,
    undoableRows,
    undoable: undoableRows > 0,
    undoNote:
      undoableRows === 0
        ? "Nothing in this run can be reversed automatically."
        : undoableRows < changed
          ? `${changed - undoableRows} of ${changed} changed products can't be reversed — the portal couldn't read them before the import.`
          : undefined,
  };

  await putSummary(summary);
  return summary;
}

/**
 * Put an import back.
 *
 * Products the run created are deleted; products it updated are restored from
 * their snapshot. Anything changed since the import is overwritten — the
 * snapshot is from import time, not from now — which is why the screen makes
 * the caller confirm before this runs.
 */
export async function undoRun(id: string): Promise<ImportUndo> {
  const run = await getRun(id);
  if (!run) throw new ShopifyError("That import run no longer exists.");
  if (run.undone) throw new ShopifyError("That import has already been undone.");
  if (!run.undoable) throw new ShopifyError(run.undoNote || "That import can't be undone.");

  const primary = (await getLocations())[0]?.id ?? "";
  let restored = 0, deleted = 0, failed = 0;
  const errors: string[] = [];

  for (const row of run.rows) {
    if (!row.undoable || !row.productId) continue;
    try {
      if (row.before) {
        await restoreProduct(row.before, primary);
        restored++;
      } else {
        // No prior state means the import created it.
        await deleteProduct(row.productId);
        deleted++;
      }
    } catch (e) {
      failed++;
      if (errors.length < 20) errors.push(`${row.title}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  const undone: ImportUndo = {
    at: new Date().toISOString(),
    by: await currentActor().catch(() => "unknown"),
    restored, deleted, failed, errors,
  };

  // Mark it undone even if some rows failed — a second full pass would try to
  // delete products that are already gone. The failures are listed instead.
  const summary = (await listRuns()).find((r) => r.id === id);
  if (summary) await putSummary({ ...summary, undone });
  return undone;
}
