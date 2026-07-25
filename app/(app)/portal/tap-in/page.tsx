"use client";

import { useState } from "react";

export default function TapInPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function tapIn() {
    if (!password) { setError("Enter your password to tap in."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "in", password }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't tap in.");
      const from = new URLSearchParams(window.location.search).get("from") || "/portal";
      window.location.href = from.startsWith("/portal") ? from : "/portal";
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't tap in."); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold brand-mark text-accentfg shadow-sm">MI</div>
        <h1 className="mt-4 text-xl font-semibold text-ink">Tap in to start your shift</h1>
        <p className="mt-1 text-sm text-muted">Re-enter your password to clock in. You&apos;ll be clocked out automatically at 9:30&nbsp;pm.</p>

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") tapIn(); }}
          placeholder="Your password"
          autoFocus
          className="mt-5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
        />
        <button onClick={tapIn} disabled={busy} className="mt-3 w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-bg transition hover:bg-accent hover:text-accentfg disabled:opacity-60">
          {busy ? "Tapping in…" : "🟢 Tap in"}
        </button>
      </div>
    </div>
  );
}
