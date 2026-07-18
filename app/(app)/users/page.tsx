"use client";

import { useEffect, useState } from "react";

type User = { email: string; role: "owner" | "member"; addedAt: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); setUsers(d.users ?? []); setCanManage(!!d.canManage); setMe(d.me ?? null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function add() {
    if (!email.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setUsers(d.users); setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  async function remove(em: string) {
    if (!confirm(`Remove ${em}'s access?`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setUsers(d.users);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="px-8 py-7">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Team &amp; access</h1>
      <p className="mt-1 text-sm text-neutral-500">People who can sign in to this portal with Google. {me && <>You&apos;re signed in as <strong>{me}</strong>.</>}</p>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {canManage ? (
        <div className="mt-5 flex max-w-xl flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@gmail.com" type="email" className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
          <button onClick={add} disabled={busy || !email.trim()} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">Grant access</button>
        </div>
      ) : (
        <p className="mt-5 rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Only the owner can add or remove teammates. Sign in with Google as the owner to manage the team.</p>
      )}

      <div className="mt-5 max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
            <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th>{canManage && <th className="px-4 py-3"></th>}</tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {users.map((u) => (
              <tr key={u.email}>
                <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{u.role}</span>
                </td>
                {canManage && <td className="px-4 py-3 text-right">{u.role !== "owner" && <button onClick={() => remove(u.email)} disabled={busy} className="text-xs text-red-500 hover:underline">remove</button>}</td>}
              </tr>
            ))}
            {users.length === 0 && !loading && <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-400">No users.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
