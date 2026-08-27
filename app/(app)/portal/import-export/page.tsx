"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND_SLUG } from "@/lib/brand";
import { downloadFile } from "@/lib/download";
import { runLabel, type ImportRunSummary } from "@/lib/import-types";

type ResultRow = {
  row: number;
  title: string;
  ok: boolean;
  action: string;
  error?: string;
  changes?: string[];
  collections?: string[];
  duplicateOf?: string;
};
type Summary = {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  results: ResultRow[];
  runId?: string;
  run?: ImportRunSummary | null;
};

type Progress = {
  done: number;
  total: number;
  /** The slice currently being written, 1-based and inclusive. */
  from: number;
  to: number;
  startedAt: number;
  /** Counted as chunks land. Kept here rather than read off the summary, which
   *  still holds the preview's figures until the first chunk comes back — it
   *  would otherwise open by claiming every row was already created. */
  created: number;
  updated: number;
  failed: number;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function ImportExportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<ImportRunSummary[]>([]);
  const [undoing, setUndoing] = useState("");
  const [flash, setFlash] = useState("");

  const [collectionChoice, setCollectionChoice] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [collectionNames, setCollectionNames] = useState<string[]>([]);
  const assignCollection = collectionChoice === "__new__" ? newCollection.trim() : collectionChoice;

  const loadRuns = useCallback(() => {
    return fetch("/api/import/runs")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setRuns(d.runs ?? []); })
      .catch(() => { /* history is a nicety; never block the page on it */ });
  }, []);
  useEffect(() => { void loadRuns(); }, [loadRuns]);

  // A clock, ticking once a second while an import runs, so elapsed time and
  // the estimate keep moving between chunks — without it the panel sits still
  // for the length of a chunk and reads as frozen all over again. Held in state
  // rather than read during render, which would be an impure render.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!progress) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [progress]);

  useEffect(() => {
    fetch("/api/collections", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { collections?: { title: string; smart?: boolean }[] } | null) => {
        if (d?.collections) setCollectionNames(d.collections.filter((c) => !c.smart).map((c) => c.title).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  async function undoRun(run: ImportRunSummary) {
    const typed = window.prompt(
      `Undo the import of "${run.filename}"?\n\n` +
      `This deletes the ${run.created} product(s) it created and puts the ${run.updated} it changed back to how they were on ${when(run.at)}. ` +
      `Anything edited since then will be lost.\n\n` +
      `Type UNDO to confirm.`,
    );
    if (typed?.trim().toUpperCase() !== "UNDO") return;
    setUndoing(run.id); setError(""); setFlash("");
    try {
      const res = await fetch(`/api/import/runs/${run.id}/undo`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Undo failed");
      const u = d.undone as { restored: number; deleted: number; failed: number; errors: string[] };
      setFlash(`Undone: ${u.restored} restored, ${u.deleted} deleted${u.failed ? `, ${u.failed} failed` : ""}.`);
      if (u.errors?.length) setError(u.errors.join(" · "));
      await loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setUndoing("");
    }
  }

  async function exportCatalog() {
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Export failed");
      }
      const blob = await res.blob();
      downloadBlob(blob, `${BRAND_SLUG}-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function downloadTemplate() {
    setError("");
    try {
      await downloadFile("/api/template", `${BRAND_SLUG}-import-template.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  // Choosing a file previews it first (dryRun) — nothing is written until Apply.
  async function preview(file: File) {
    setUploading(true);
    setError("");
    setFlash("");
    setSummary(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", "1");
      if (assignCollection) fd.append("assignCollection", assignCollection);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Import failed");
      setSummary(d as Summary);
      setPendingFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Apply the sheet in chunks that share one runId, so any size stays under the
  // timeout and the whole import is recorded as a single undoable run.
  //
  // Chunk size is a visibility decision as much as a safety one. Each row costs
  // several Shopify round trips, so a 200-row chunk can run for minutes with
  // nothing to show for it — which is exactly what made a 900-row sheet look
  // frozen. Smaller chunks report back often enough to prove it's still moving.
  async function applyChunked(file: File) {
    const CHUNK = 40;
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const startedAt = Date.now();
    setNow(startedAt);
    setUploading(true);
    setError("");
    const knownTotal = summary?.total ?? 0;
    const agg: Summary = { dryRun: false, total: knownTotal, created: 0, updated: 0, failed: 0, skipped: 0, results: [], runId };
    // Show the bar before the first request, not after the first chunk lands.
    setProgress({ done: 0, total: knownTotal, from: 1, to: Math.min(CHUNK, knownTotal || CHUNK), startedAt, created: 0, updated: 0, failed: 0 });
    let done = 0;
    try {
      let from = 0;
      let total = summary?.total ?? Number.MAX_SAFE_INTEGER;
      while (from < total) {
        setProgress({ done, total: agg.total, from: from + 1, to: Math.min(from + CHUNK, agg.total || from + CHUNK), startedAt, created: agg.created, updated: agg.updated, failed: agg.failed });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("from", String(from));
        fd.append("to", String(from + CHUNK));
        fd.append("runId", runId);
        if (assignCollection) fd.append("assignCollection", assignCollection);
        const res = await fetch("/api/import", { method: "POST", body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Import failed");
        total = typeof d.total === "number" ? d.total : total;
        agg.total = total;
        agg.created += d.created ?? 0;
        agg.updated += d.updated ?? 0;
        agg.failed += d.failed ?? 0;
        agg.results.push(...(d.results ?? []));
        agg.run = d.run ?? agg.run;
        setSummary({ ...agg });
        from += CHUNK;
        done = Math.min(from, total);
        setProgress({ done, total, from: done, to: done, startedAt, created: agg.created, updated: agg.updated, failed: agg.failed });
      }
      setPendingFile(null);
      setFlash(`Imported: ${agg.created} created, ${agg.updated} updated${agg.failed ? `, ${agg.failed} failed` : ""}.`);
      await loadRuns();
    } catch (e) {
      const why = e instanceof Error ? e.message : "Import failed";
      // Say how far it got. Earlier chunks are already written, and the run is
      // in the history — leaving that unsaid invites a second full import.
      setError(done > 0
        ? `${why}. Stopped after ${done} of ${agg.total} rows — those are already imported and the run is in the history below, so undo it rather than re-importing the whole sheet.`
        : why);
      await loadRuns();
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  function cancelPreview() {
    setPendingFile(null);
    setSummary(null);
    setFileName("");
  }

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Import / Export</h1>
        <p className="text-sm text-neutral-500">
          Bulk-manage products with Excel. Preview before it writes, add products straight into a
          collection, and undo a whole import from the history below.
        </p>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{flash}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Export */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Export</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Download your whole catalog as Excel — every product with brand, model, type, tags,
            price, SKU, stock and image.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={exportCatalog}
              disabled={exporting}
              className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
            >
              {exporting ? "Preparing…" : "Download full catalog"}
            </button>
            <button
              onClick={downloadTemplate}
              className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900"
            >
              Download blank template
            </button>
          </div>
        </section>

        {/* Import */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Import</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Upload a filled-in Excel file. You&apos;ll see a preview of exactly what would change
            first — nothing is written until you press Apply. Any size; big sheets apply in batches.
          </p>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-neutral-700">
              Add all these products to a collection <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <select
              value={collectionChoice}
              onChange={(e) => setCollectionChoice(e.target.value)}
              className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm text-neutral-800"
            >
              <option value="">— Don&apos;t add to a collection —</option>
              {collectionNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="__new__">➕ Create a new collection…</option>
            </select>
            {collectionChoice === "__new__" && (
              <input
                value={newCollection}
                onChange={(e) => setNewCollection(e.target.value)}
                placeholder="New collection name"
                autoFocus
                className="mt-2 h-9 w-full rounded-lg border border-neutral-300 px-3 text-sm"
              />
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void preview(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
          >
            {uploading && !summary ? "Reading…" : "Choose a file"}
          </button>
        </section>
      </div>

      {summary && (
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900">
              {summary.dryRun ? "Preview" : "Import result"}
              {fileName && <span className="text-neutral-400"> — {fileName}</span>}
            </h2>
            {summary.dryRun && (
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelPreview}
                  disabled={uploading}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={() => pendingFile && applyChunked(pendingFile)}
                  disabled={uploading || !pendingFile || summary.created + summary.updated === 0}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50"
                >
                  {uploading ? (progress ? `Applying ${progress.done}/${progress.total}…` : "Applying…") : "Apply import"}
                </button>
              </div>
            )}
          </div>

          {/* While it runs, this is the only thing that proves it's still
              working. Each row is several Shopify calls, so a big sheet takes
              minutes — without the bar the screen just looks hung. */}
          {progress && (
            <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                  Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows
                </p>
                <p className="text-sm font-semibold tabular-nums text-neutral-900">
                  {progress.total ? Math.floor((progress.done / progress.total) * 100) : 0}%
                </p>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                <span>{progress.created} created · {progress.updated} updated{progress.failed ? ` · ${progress.failed} failed` : ""}</span>
                <span>{duration(Math.max(now, progress.startedAt) - progress.startedAt)} elapsed</span>
                {progress.done > 0 && progress.done < progress.total && (
                  <span>
                    about {duration(((Math.max(now, progress.startedAt) - progress.startedAt) / progress.done) * (progress.total - progress.done))} left
                  </span>
                )}
                {progress.to > progress.done && (
                  <span>writing rows {progress.from.toLocaleString()}–{progress.to.toLocaleString()}</span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-neutral-400">
                Leave this tab open — the import runs from here. Rows already written stay written, and the whole run can be undone from the history below.
              </p>
            </div>
          )}

          {summary.dryRun && !progress && (
            <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Nothing has been written yet. Check the rows below, then press <strong>Apply import</strong>.
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">{summary.dryRun ? "Will create" : "Created"}: {summary.created}</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">{summary.dryRun ? "Will change" : "Updated"}: {summary.updated}</span>
            {summary.skipped > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">No change: {summary.skipped}</span>}
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{summary.dryRun ? "Will fail" : "Failed"}: {summary.failed}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">Rows: {summary.total}</span>
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {summary.results.map((r, i) => (
                  <tr key={`${r.row}-${i}`} className={!r.ok ? "bg-red-50/50" : undefined}>
                    <td className="px-3 py-2 text-neutral-400">{r.row}</td>
                    <td className="px-3 py-2 text-neutral-800"><span className="block max-w-xs truncate">{r.title}</span></td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (r.action === "created" ? "bg-emerald-100 text-emerald-700"
                            : r.action === "updated" ? "bg-sky-100 text-sky-700"
                            : r.action === "failed" ? "bg-red-100 text-red-700"
                            : "bg-neutral-100 text-neutral-600")
                        }
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {r.changes && r.changes.length ? (
                        <span className="flex flex-wrap gap-1">
                          {r.changes.map((ch, j) => (
                            <span key={j} className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">{ch}</span>
                          ))}
                        </span>
                      ) : (
                        r.error ?? (r.collections?.length ? "" : "—")
                      )}
                      {r.collections && r.collections.length > 0 && (
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="text-[11px] text-neutral-400">→</span>
                          {r.collections.map((c, j) => (
                            <span key={j} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">{c}</span>
                          ))}
                        </span>
                      )}
                      {r.duplicateOf && (
                        <span className="mt-1 block">
                          <span
                            className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800"
                            title="A product with this SKU or name already exists. This row still creates a new product — merge them afterwards from Inventory if it's the same item."
                          >
                            ⚠ Possible duplicate of “{r.duplicateOf}”
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* History. An import can rewrite hundreds of products in one click, so
          the record of who ran what — and the way back — lives on this page. */}
      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Import history</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Every import, with what it changed. Undo puts the products back as they were just before that import ran.
            </p>
          </div>
          <button onClick={() => void loadRuns()} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900">
            Refresh
          </button>
        </div>

        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">No imports recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">By</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">Undo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-3 text-neutral-500">{when(r.at)}</td>
                    <td className="px-3 py-3">
                      <span className="font-medium text-neutral-900">{r.filename}</span>
                      {r.scope === "till" && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">till</span>}
                    </td>
                    <td className="px-3 py-3 text-neutral-500">{r.by.split("@")[0]}</td>
                    <td className="px-3 py-3 text-neutral-600">
                      {runLabel(r)}
                      {r.undoNote && <span className="mt-0.5 block text-[11px] text-amber-600">{r.undoNote}</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.undone ? (
                        <span className="text-xs text-neutral-500">
                          Undone {when(r.undone.at)}
                          <span className="block text-[11px] text-neutral-400">
                            {r.undone.restored} restored · {r.undone.deleted} deleted
                            {r.undone.failed ? ` · ${r.undone.failed} failed` : ""}
                          </span>
                        </span>
                      ) : r.undoable ? (
                        <button
                          onClick={() => undoRun(r)}
                          disabled={undoing === r.id}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {undoing === r.id ? "Undoing…" : "Undo"}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
