"use client";

import { useRef, useState } from "react";

type ImportResult = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  results: { title: string; ok: boolean; action: string; error?: string }[];
};

export default function ImportExportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

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
      downloadBlob(blob, `mobileicu-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function downloadTemplate() {
    window.location.href = "/api/template";
  }

  async function runImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-neutral-900">Import / Export</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Bulk-manage products with Excel. Export your catalog, edit, and re-import — or add new
        products with the template.
      </p>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

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
            Upload a filled-in Excel file. Rows with a <strong>Handle</strong> update existing
            products; rows without create new ones. Up to 500 rows at a time.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="mt-4 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
          />
          <button
            onClick={runImport}
            disabled={importing}
            className="mt-4 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
          >
            {importing ? "Importing…" : "Upload & import"}
          </button>
        </section>
      </div>

      {result && (
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">Import results</h2>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className="rounded-full bg-neutral-100 px-3 py-1">Total: {result.total}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Created: {result.created}</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Updated: {result.updated}</span>
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">Failed: {result.failed}</span>
          </div>
          {result.failed > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {result.results
                    .filter((r) => !r.ok)
                    .map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-neutral-700">{r.title}</td>
                        <td className="px-3 py-2 text-red-600">{r.error}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
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
