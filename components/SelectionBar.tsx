"use client";

import { useEffect, useRef } from "react";

// Row selection, said out loud.
//
// Every table used to do this with one bare tick box in the header row, and it
// meant different things on different screens: on some it selected the rows you
// could see, on others it silently selected all 1,200 matching rows across every
// page. Both are reasonable — but you could not tell which you had just done,
// and the next click was "Delete".
//
// So the choice is now written down. The tick box takes the page you are looking
// at; taking everything that matches the current filters is a separate button
// that names the number first.

export type SelectionBarProps = {
  /** Keys of the rows currently on screen (this page). */
  pageKeys: string[];
  /** Keys of every row matching the current search and filters, all pages. */
  allKeys: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Plural noun for the counts, e.g. "products". */
  noun?: string;
  /** Extra controls — the page's bulk action buttons — shown once something is selected. */
  children?: React.ReactNode;
  className?: string;
};

export default function SelectionBar({
  pageKeys,
  allKeys,
  selected,
  onChange,
  noun = "rows",
  children,
  className = "",
}: SelectionBarProps) {
  const box = useRef<HTMLInputElement>(null);

  const pageSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const someOnPage = pageKeys.some((k) => selected.has(k));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  // "Some of this page" is a real third state and the tick box should show it —
  // there is no attribute for it, so it has to be set on the element.
  useEffect(() => {
    if (box.current) box.current.indeterminate = someOnPage && !pageSelected;
  }, [someOnPage, pageSelected]);

  function togglePage() {
    const next = new Set(selected);
    if (pageSelected) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    onChange(next);
  }

  const beyondPage = allKeys.length > pageKeys.length;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
        <input
          ref={box}
          type="checkbox"
          checked={pageSelected}
          onChange={togglePage}
          className="h-4 w-4 accent-amber-500"
          aria-label={`Select the ${pageKeys.length} ${noun} on this page`}
        />
        <span className="font-medium">
          {selected.size ? `${selected.size.toLocaleString()} selected` : `Select this page (${pageKeys.length})`}
        </span>
      </label>

      {/* Only offered when there IS something past this page — otherwise the tick
          box already did it and a second button just muddies the choice. */}
      {beyondPage && !allSelected && (
        <button
          type="button"
          onClick={() => onChange(new Set(allKeys))}
          className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200"
        >
          Select all {allKeys.length.toLocaleString()} {noun}
        </button>
      )}

      {selected.size > 0 && (
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 underline-offset-2 transition hover:underline"
        >
          Clear
        </button>
      )}

      {allSelected && beyondPage && (
        <span className="text-xs text-neutral-500">All {noun} matching the current filters are selected.</span>
      )}

      {selected.size > 0 && children}
    </div>
  );
}
