"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProductRow, Location } from "@/lib/shopify";

const LOW_STOCK_DEFAULT = 5;

type FlatRow = {
  key: string;
  productTitle: string;
  image: string | null;
  variantTitle: string;
  sku: string;
  price: string;
  inventoryItemId: string | null;
  tracked: boolean;
  levels: { locationId: string; locationName: string; available: number }[];
  totalAvailable: number;
};

function flatten(rows: ProductRow[]): FlatRow[] {
  const out: FlatRow[] = [];
  for (const p of rows) {
    for (const v of p.variants) {
      out.push({
        key: v.variantId,
        productTitle: p.title,
        image: p.image,
        variantTitle: v.variantTitle === "Default Title" ? "" : v.variantTitle,
        sku: v.sku,
        price: v.price,
        inventoryItemId: v.inventoryItemId,
        tracked: v.tracked,
        levels: v.levels,
        totalAvailable: v.available,
      });
    }
  }
  return out;
}

export default function InventoryPage() {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [lowStock, setLowStock] = useState(LOW_STOCK_DEFAULT);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notConfigured, setNotConfigured] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (q: string, after: string | null, append: boolean) => {
      setLoading(true);
      setError("");
      try {
        const url = new URL("/api/inventory", window.location.origin);
        if (q) url.searchParams.set("query", q);
        if (after) url.searchParams.set("after", after);
        const res = await fetch(url.toString());
        if (res.status === 503) {
          setNotConfigured(true);
          setRows([]);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load.");
        setNotConfigured(false);
        const flat = flatten(data.rows as ProductRow[]);
        setRows((prev) => (append ? [...prev, ...flat] : flat));
        setCursor(data.endCursor);
        setHasNext(data.hasNextPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        const locs: Location[] = d.locations ?? [];
        setLocations(locs);
        if (locs[0]) setLocationId(locs[0].id);
      })
      .catch(() => {});
    load("", null, false);
  }, [load]);

  function onSearch(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value, null, false), 350);
  }

  const availableAt = useCallback(
    (row: FlatRow): number => {
      if (!locationId) return row.totalAvailable;
      const lvl = row.levels.find((l) => l.locationId === locationId);
      return lvl ? lvl.available : 0;
    },
    [locationId],
  );

  const stats = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const r of rows) {
      const a = availableAt(r);
      if (a <= 0) out++;
      else if (a <= lowStock) low++;
    }
    return { total: rows.length, low, out };
  }, [rows, lowStock, availableAt]);

  if (notConfigured) {
    return (
      <div className="px-8 py-7">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
          <h2 className="text-lg font-semibold text-neutral-900">Connect Shopify</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Add your <code>shpat_…</code> token to <code>.env.local</code> as{" "}
            <code>SHOPIFY_ADMIN_TOKEN</code>, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Inventory</h1>
          <p className="text-sm text-neutral-500">
            {stats.total} variants loaded ·{" "}
            <span className="text-amber-600">{stats.low} low</span> ·{" "}
            <span className="text-red-600">{stats.out} out of stock</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {locations.length > 1 && (
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Low ≤
            <input
              type="number"
              value={lowStock}
              min={0}
              onChange={(e) => setLowStock(Number(e.target.value))}
              className="w-16 rounded-lg border border-neutral-300 px-2 py-2 text-sm"
            />
          </label>
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search product or SKU…"
            className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <StockRow
                key={row.key}
                row={row}
                available={availableAt(row)}
                locationId={locationId}
                lowStock={lowStock}
                onSaved={(qty) => {
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key
                        ? {
                            ...r,
                            levels: r.levels.map((l) =>
                              l.locationId === locationId ? { ...l, available: qty } : l,
                            ),
                          }
                        : r,
                    ),
                  );
                }}
              />
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-center">
        {hasNext ? (
          <button
            onClick={() => load(query, cursor, true)}
            disabled={loading}
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (
          loading && <p className="text-sm text-neutral-400">Loading…</p>
        )}
      </div>
    </div>
  );
}

function StockRow({
  row,
  available,
  locationId,
  lowStock,
  onSaved,
}: {
  row: FlatRow;
  available: number;
  locationId: string;
  lowStock: number;
  onSaved: (qty: number) => void;
}) {
  const [value, setValue] = useState(String(available));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(String(available));
    setDirty(false);
  }, [available]);

  const status = available <= 0 ? "out" : available <= lowStock ? "low" : "in";

  async function save() {
    if (!row.inventoryItemId || !locationId) return;
    const qty = Math.max(0, Math.round(Number(value)));
    setSaving(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId: row.inventoryItemId, locationId, quantity: qty }),
      });
      if (res.ok) {
        onSaved(qty);
        setDirty(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="hover:bg-neutral-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.image}
              alt=""
              className="h-10 w-10 rounded-md border border-neutral-200 object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-md bg-neutral-100" />
          )}
          <div>
            <p className="font-medium text-neutral-900">{row.productTitle}</p>
            {row.variantTitle && <p className="text-xs text-neutral-500">{row.variantTitle}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-neutral-500">{row.sku || "—"}</td>
      <td className="px-4 py-3 text-neutral-700">£{row.price}</td>
      <td className="px-4 py-3">
        {!row.tracked ? (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
            Not tracked
          </span>
        ) : status === "out" ? (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
            Out of stock
          </span>
        ) : status === "low" ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Low
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            In stock
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <input
            type="number"
            value={value}
            disabled={!row.tracked || !row.inventoryItemId}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(true);
            }}
            className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-right text-sm disabled:bg-neutral-50 disabled:text-neutral-400"
          />
          {dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
            >
              {saving ? "…" : "Save"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
