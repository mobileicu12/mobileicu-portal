"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-level error boundary for the whole portal.
//
// Every screen reads fields off an API response, and a response missing one —
// a partial deploy, a proxy error page, an endpoint that answered with an error
// shape — throws inside render. Without a boundary React unmounts the tree and
// the page goes white: no message, no way back, nothing to tell the shop what
// happened. This catches it and leaves something usable on screen instead.
//
// It is not a substitute for the pages reading their data defensively; it is
// the floor under them.
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept in the console so a screenshot of the tab still carries the cause.
    console.error("Portal page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-8 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-7 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-3xl">⚠️</p>
        <h1 className="mt-3 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          This page couldn&apos;t be shown
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Something it needed came back wrong. Nothing has been changed or lost — the rest of the
          portal is still working.
        </p>

        <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-left font-mono text-xs break-words text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {error.message || "Unknown error"}
          {error.digest && <span className="block text-neutral-400">ref {error.digest}</span>}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900"
          >
            Try again
          </button>
          <Link
            href="/portal"
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-200"
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-4 text-xs text-neutral-400">
          If it keeps happening, send this message to whoever looks after the portal.
        </p>
      </div>
    </div>
  );
}
