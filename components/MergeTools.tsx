"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DuplicateGroup, MergeCandidate, MergeMember } from "@/lib/merge";

const gbp = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

const overlay = "fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4";
const panel = "w-full max-w-2xl rounded-2xl border border-line bg-surface shadow-2xl";
const badge = "rounded-full px-2 py-0.5 text-[11px] font-medium";

/* -------------------------------------------------------------------------- */
/* Merge modal                                                                */
/* -------------------------------------------------------------------------- */

export function MergeModal({
  open,
  productIds,
  onClose,
  onMerged,
}: {
  open: boolean;
  productIds: string[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [rows, setRows] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [survivorId, setSurvivorId] = useState("");
  const [detailsFromId, setDetailsFromId] = useState("");
  const [addStock, setAddStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || productIds.length === 0) return;
    let alive = true;
    setLoading(true);
    setError("");
    setAddStock(false);
    fetch(`/api/products/merge?ids=${encodeURIComponent(productIds.join(","))}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: MergeCandidate[] }) => {
        if (!alive) return;
        setRows(d.candidates ?? []);
      })
      .catch(() => alive && setError("Could not load these products."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, productIds]);

  useEffect(() => {
    if (rows.length === 0) return;
    const best = [...rows].sort((a, b) => b.stock - a.stock)[0];
    setSurvivorId((cur) => (rows.some((r) => r.id === cur) ? cur : best.id));
  }, [rows]);

  useEffect(() => {
    if (survivorId) setDetailsFromId(survivorId);
  }, [survivorId]);

  const { newestId, oldestId } = useMemo(() => {
    if (rows.length < 2) return { newestId: "", oldestId: "" };
    const sorted = [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return { oldestId: sorted[0].id, newestId: sorted[sorted.length - 1].id };
  }, [rows]);

  const survivor = rows.find((r) => r.id === survivorId);
  const losers = rows.filter((r) => r.id !== survivorId);
  const source = rows.find((r) => r.id === detailsFromId) ?? survivor;
  const lostStock = losers.reduce((s, r) => s + r.stock, 0);

  const merge = async () => {
    if (!survivor || losers.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorId,
          mergedIds: losers.map((r) => r.id),
          detailsFrom: detailsFromId,
          addStock,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Merge failed.");
      onMerged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className={overlay} onClick={onClose}>
      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line p-5">
          <h3 className="text-base font-semibold text-ink">Merge {rows.length || productIds.length} products</h3>
          <p className="mt-1 text-xs text-muted">
            Choose the product to keep. The others are deleted and folded in — their collections and
            tags move onto the one you keep, and past invoices are untouched.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading current figures…</p>
          ) : (
            <>
              <div className="space-y-2">
                {rows.map((p) => {
                  const keep = p.id === survivorId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSurvivorId(p.id)}
                      className={
                        "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors " +
                        (keep ? "border-accent bg-accent/10" : "border-line hover:bg-bg")
                      }
                    >
                      <span
                        className={
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                          (keep ? "border-accent" : "border-line")
                        }
                      >
                        {keep && <span className="h-2 w-2 rounded-full bg-accent" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">{p.title}</span>
                          {p.id === newestId && <span className={`${badge} bg-sky-100 text-sky-700`}>Newest</span>}
                          {p.id === oldestId && <span className={`${badge} bg-neutral-200 text-neutral-600`}>Oldest</span>}
                        </span>
                        <span className="block text-xs text-muted">
                          {p.sku || "no SKU"} · {gbp(p.price)} · {p.stock} in stock
                          {p.createdAt ? ` · added ${shortDate(p.createdAt)}` : ""}
                        </span>
                      </span>
                      {keep ? (
                        <span className={`${badge} bg-accent text-accentfg`}>Keep</span>
                      ) : (
                        <span className="shrink-0 text-xs text-muted">Remove</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {rows.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-sm">
                  <span className="text-muted">Use details (name, price, SKU…) from:</span>
                  <select
                    value={detailsFromId}
                    onChange={(e) => setDetailsFromId(e.target.value)}
                    className="h-8 rounded-lg border border-line bg-bg px-2 text-sm text-ink"
                  >
                    {rows.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id === survivorId ? "The kept product" : "Removed"}
                        {p.id === newestId ? " · newest" : p.id === oldestId ? " · oldest" : ""}
                        {` · ${gbp(p.price)}`}
                      </option>
                    ))}
                  </select>
                  {source && survivor && source.id !== survivor.id && (
                    <span className="text-xs text-amber-600">
                      Kept product’s details will be replaced with {source.title}’s
                      {source.price !== survivor.price ? ` (price → ${gbp(source.price)})` : ""}.
                    </span>
                  )}
                </div>
              )}

              {losers.length > 0 && lostStock > 0 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={addStock}
                    onChange={(e) => setAddStock(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  Add the removed products’ stock ({lostStock}) to the survivor
                  {survivor ? ` — new total ${survivor.stock + lostStock}` : ""}
                </label>
              )}
              {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <p className="mt-3 text-xs text-red-500">This cannot be undone.</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line p-4">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-60">
            Cancel
          </button>
          <button
            onClick={merge}
            disabled={busy || loading || !survivor || losers.length === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Merging…" : `Merge into “${survivor?.title ?? "…"}”`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Duplicates modal                                                           */
/* -------------------------------------------------------------------------- */

export function DuplicatesModal({
  open,
  onClose,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [nameClashes, setNameClashes] = useState<{ key: string; members: { id: string; title: string; sku: string; barcode: string }[] }[]>([]);
  const [scan, setScan] = useState<{ scanned: number; truncated: boolean }>({ scanned: 0, truncated: false });
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);
  const [strategy, setStrategy] = useState<"newest" | "oldest">("newest");
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/products/duplicates", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not scan for duplicates.");
      setGroups(d.groups ?? []);
      setNameClashes(d.nameClashes ?? []);
      setScan({ scanned: d.scanned ?? 0, truncated: !!d.truncated });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not scan for duplicates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const certain = groups.filter((g) => g.confidence === "certain");
  const mergeAll = async () => {
    if (
      !window.confirm(
        `Merge ${certain.length} confirmed group${certain.length === 1 ? "" : "s"}, keeping the ${strategy} of each and removing the rest? ` +
        `The kept product's details win. This cannot be undone.` +
        (groups.length > certain.length
          ? `\n\nThe ${groups.length - certain.length} name-only match${groups.length - certain.length === 1 ? "" : "es"} will be left for you to check by hand — nothing but the name says they are the same product.`
          : ""),
      )
    )
      return;
    setBatchBusy(true);
    setError("");
    try {
      const res = await fetch("/api/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Batch merge failed.");
      onMerged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch merge failed.");
    } finally {
      setBatchBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className={mergeIds ? "hidden" : overlay} onClick={onClose}>
        <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-line p-5">
            <h3 className="text-base font-semibold text-ink">Possible duplicates</h3>
            <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-5">
            {loading ? (
              <p className="py-6 text-center text-sm text-muted">Scanning your catalog…</p>
            ) : groups.length === 0 && nameClashes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No duplicates in {scan.scanned.toLocaleString()} products — nothing shares a barcode or SKU,
                and no two names match without something telling them apart.
              </p>
            ) : (
              <div className="space-y-3">
                {scan.truncated && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    Only the first {scan.scanned.toLocaleString()} products were scanned, so this list is incomplete.
                  </p>
                )}
                <p className="text-sm text-muted">
                  Scanned {scan.scanned.toLocaleString()} products.{" "}
                  {groups.length > 0
                    ? `${certain.length} group${certain.length === 1 ? "" : "s"} confirmed by barcode or SKU` +
                      (groups.length > certain.length ? `, ${groups.length - certain.length} matched on name alone.` : ".")
                    : "No duplicates."}
                </p>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
                  <span className="font-medium text-ink">Merge all — keep the</span>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value as "newest" | "oldest")}
                    className="h-8 rounded-lg border border-line bg-bg px-2 text-sm text-ink"
                  >
                    <option value="newest">newest (latest details)</option>
                    <option value="oldest">oldest</option>
                  </select>
                  <span className="text-muted">of each</span>
                  <button
                    onClick={mergeAll}
                    disabled={batchBusy}
                    className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accentfg disabled:opacity-50"
                  >
                    {batchBusy ? "Merging…" : `Merge ${certain.length} confirmed group${certain.length === 1 ? "" : "s"}`}
                  </button>
                </div>

                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

                {groups.map((g, i) => (
                  <GroupCard key={i} group={g} onMerge={() => setMergeIds(g.members.map((m) => m.id))} />
                ))}

                {/* Same name, but a barcode or SKU says they are different
                    products. Shown so they can be checked, deliberately NOT
                    counted as duplicates — merging these would delete real stock. */}
                {nameClashes.length > 0 && (
                  <div className="mt-5 rounded-xl border border-line bg-subtle p-3">
                    <p className="text-sm font-semibold text-ink">
                      {nameClashes.length} to look at — alike, but not duplicates
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      These share a name, but their barcodes or SKUs differ, so the portal treats them as
                      separate products. If any pair really is one product, fix the identifier and scan again.
                    </p>
                    <div className="mt-2 space-y-2">
                      {nameClashes.map((c, i) => (
                        <div key={i} className="rounded-lg border border-line bg-bg p-2 text-xs">
                          <p className="font-medium text-ink">{c.key}</p>
                          <ul className="mt-1 space-y-0.5 text-muted">
                            {c.members.map((m) => (
                              <li key={m.id}>
                                {m.title}
                                {m.sku ? ` · SKU ${m.sku}` : ""}
                                {m.barcode ? ` · barcode ${m.barcode}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-line p-4">
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink">
              Done
            </button>
          </div>
        </div>
      </div>

      <MergeModal
        open={mergeIds !== null}
        productIds={mergeIds ?? []}
        onClose={() => setMergeIds(null)}
        onMerged={() => {
          setMergeIds(null);
          onMerged();
          void load();
        }}
      />
    </>
  );
}

function GroupCard({ group, onMerge }: { group: DuplicateGroup; onMerge: () => void }) {
  const byAge = [...group.members]
    .filter((m) => m.createdAt)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const oldest = byAge[0]?.id;
  const newest = byAge[byAge.length - 1]?.id;
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`${badge} ${group.confidence === "certain" ? "bg-amber-100 text-amber-700" : "bg-neutral-200 text-neutral-600"}`}>
            {group.reason === "barcode" ? "Same barcode" : group.reason === "sku" ? "Same SKU" : "Same name only"}
          </span>
          <span className="text-xs text-muted">
            {group.reason === "title" ? group.key : group.key.toUpperCase()} · {group.members.length} products
            {group.confidence === "likely" && <span className="ml-1 text-amber-600">· check before merging</span>}
          </span>
        </div>
        <button onClick={onMerge} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accentfg">
          Merge these…
        </button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {group.members.map((m: MergeMember) => (
          <li key={m.id} className="flex items-center gap-2 py-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate text-ink">{m.title}</span>
              {byAge.length > 1 && m.id === newest && <span className={`${badge} bg-sky-100 text-sky-700`}>Newest</span>}
              {byAge.length > 1 && m.id === oldest && <span className={`${badge} bg-neutral-200 text-neutral-600`}>Oldest</span>}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {m.sku || "no SKU"} · {gbp(m.price)} · {m.stock} in stock
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
