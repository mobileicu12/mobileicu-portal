// Client-safe import-run types. No server imports.
//
// Split from lib/import-runs.ts because that one reaches Shopify and the audit
// log (which pulls in `auth()` and `cookies()`), neither of which can be
// bundled into the Import/Export screen.

/** What happened to one spreadsheet row. */
export type ImportRunRow = {
  title: string;
  handle?: string;
  productId?: string;
  /** "created" | "updated" | "failed", plus any qualifier the writer added. */
  action: string;
  ok: boolean;
  error?: string;
  /** False when this row can't be reversed — see ImportRun.undoNote. */
  undoable: boolean;
};

export type ImportUndo = {
  at: string;
  by: string;
  /** Products put back to their previous state. */
  restored: number;
  /** Products the import created, now deleted. */
  deleted: number;
  failed: number;
  errors: string[];
};

export type ImportRun = {
  id: string;
  at: string;
  by: string;
  filename: string;
  /** "catalog" or "till" — which importer was used. */
  scope: string;
  total: number;
  created: number;
  updated: number;
  failed: number;
  /** False when nothing in the run can be reversed. */
  undoable: boolean;
  /** Why the run is wholly or partly un-undoable, when it is. */
  undoNote?: string;
  undone?: ImportUndo;
  rows: ImportRunRow[];
};

/** The index entry — everything but the rows, so the list stays small. */
export type ImportRunSummary = Omit<ImportRun, "rows">;

export const undoneCount = (r: Pick<ImportRun, "rows">) => r.rows.filter((x) => x.undoable).length;

export function runLabel(r: Pick<ImportRunSummary, "created" | "updated" | "failed">): string {
  const bits: string[] = [];
  if (r.created) bits.push(`${r.created} created`);
  if (r.updated) bits.push(`${r.updated} updated`);
  if (r.failed) bits.push(`${r.failed} failed`);
  return bits.join(" · ") || "nothing changed";
}
