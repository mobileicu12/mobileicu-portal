// Import history, and the ability to put an import back.
//
// A spreadsheet import can rewrite hundreds of products in one click. Until now
// it left no trace at all: no record of who ran it, what it touched, or what the
// products looked like beforehand — so a bad file meant re-keying the catalogue
// by hand. Every run is now recorded with a snapshot of each product it changed,
// which is what makes undo possible.
//
// Storage: shop metafields.
//   portal.import_runs        — the index, summaries only, newest first
//   portal.import_run_<id>    — one run's rows, including the before-snapshots
//
// Kept apart on purpose. The snapshots are the bulky part; putting them in the
// index would mean the history list couldn't be read without dragging every
// snapshot along, and would push a single metafield towards its size ceiling.
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
/** A run's detail is refused past this, and the run is marked un-undoable
 *  rather than half-written. Comfortably inside the metafield ceiling. */
const MAX_DETAIL_BYTES = 900_000;

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

const detailKey = (id: string) => `import_run_${id}`;

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
  const rows = await readJson<StoredRow[]>(detailKey(id), []);
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

/**
 * Record a finished import.
 *
 * Never throws: an import that succeeded must not be reported as failed because
 * the history write didn't land. A run that couldn't be stored simply can't be
 * undone, and says so.
 */
export async function recordRun(opts: {
  filename: string;
  scope: string;
  results: UpsertResult[];
}): Promise<ImportRunSummary | null> {
  try {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const by = await currentActor().catch(() => "unknown");

    const rows: StoredRow[] = opts.results.map((r) => {
      const created = r.ok && r.action.startsWith("created");
      const updated = r.ok && r.action.startsWith("updated");
      return {
        title: r.title,
        handle: r.handle,
        productId: r.productId,
        action: r.action,
        ok: r.ok,
        error: r.error,
        // A create is undone by deleting; an update needs its snapshot back.
        undoable: Boolean(r.productId) && (created || (updated && Boolean(r.before))),
        before: r.before ?? null,
      };
    });

    const created = rows.filter((r) => r.ok && r.action.startsWith("created")).length;
    const updated = rows.filter((r) => r.ok && r.action.startsWith("updated")).length;
    const failed = rows.filter((r) => !r.ok).length;
    const undoableRows = rows.filter((r) => r.undoable).length;

    let undoable = undoableRows > 0;
    let undoNote: string | undefined;
    if (!undoable) undoNote = "Nothing in this run can be reversed automatically.";
    else if (undoableRows < created + updated) {
      undoNote = `${created + updated - undoableRows} of ${created + updated} changed products can't be reversed — the portal couldn't read them before the import.`;
    }

    let stored = rows;
    if (JSON.stringify(rows).length > MAX_DETAIL_BYTES) {
      // Too big to keep the snapshots. Keep the record of what happened —
      // that's still worth having — but be honest that undo is off.
      stored = rows.map((r) => ({ ...stripSnapshot(r), undoable: false }));
      undoable = false;
      undoNote = "This run was too large to store the before-state, so it can't be undone. Import in smaller batches to keep undo available.";
    }

    const summary: ImportRunSummary = {
      id, at: new Date().toISOString(), by,
      filename: opts.filename, scope: opts.scope,
      total: rows.length, created, updated, failed,
      undoable, undoNote,
    };

    await writeJson(detailKey(id), stored);
    await putSummary(summary);
    return summary;
  } catch {
    return null;
  }
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
