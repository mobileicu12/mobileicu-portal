"use client";

import { useMemo, useState } from "react";

// Shared paging for the portal's tables.
//
// Rendering a whole catalogue or a year of orders as one table is slow to paint
// and impossible to read. Filters and sorting still run across the FULL set —
// only the rows on screen are sliced — so a search never misses something just
// because it sits on another page.

export const PAGE_SIZES = [10, 20, 50, 100];

export type Paging<T> = {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  from: number;
  to: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
};

export function usePaging<T>(all: T[], initialSize = 20): Paging<T> {
  const [pageSize, setSize] = useState(initialSize);
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  // Clamped rather than stored: filtering down to fewer pages while sitting on
  // a high one would otherwise show an empty table.
  const safePage = Math.min(Math.max(1, page), pageCount);
  const rows = useMemo(
    () => all.slice((safePage - 1) * pageSize, safePage * pageSize),
    [all, safePage, pageSize],
  );

  return {
    rows,
    total: all.length,
    page: safePage,
    pageCount,
    pageSize,
    from: all.length === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, all.length),
    setPage,
    // Changing the page size keeps you near where you were rather than jumping
    // back to the top of the list.
    setPageSize: (n: number) => {
      const firstRow = (safePage - 1) * pageSize;
      setSize(n);
      setPage(Math.floor(firstRow / n) + 1);
    },
  };
}

export default function Pagination<T>({
  paging,
  noun = "rows",
  className = "",
}: {
  paging: Paging<T>;
  /** Plural noun for the count, e.g. "products", "orders". */
  noun?: string;
  className?: string;
}) {
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = paging;
  if (total === 0) return null;

  const btn =
    "rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs transition hover:border-neutral-900 disabled:opacity-40 disabled:hover:border-neutral-300 dark:border-neutral-700";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 py-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>
          Showing <strong className="text-neutral-700 dark:text-neutral-200">{from.toLocaleString()}–{to.toLocaleString()}</strong> of{" "}
          {total.toLocaleString()} {noun}
        </span>
        <label className="ml-2 flex items-center gap-1.5">
          <span>Per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className={btn}>« First</button>
          <button onClick={() => setPage(page - 1)} disabled={page === 1} className={btn}>‹ Prev</button>
          <span className="px-3 text-xs text-neutral-500">Page {page} of {pageCount}</span>
          <button onClick={() => setPage(page + 1)} disabled={page === pageCount} className={btn}>Next ›</button>
          <button onClick={() => setPage(pageCount)} disabled={page === pageCount} className={btn}>Last »</button>
        </div>
      )}
    </div>
  );
}
