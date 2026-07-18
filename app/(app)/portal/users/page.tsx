"use client";

import { useEffect, useMemo, useState } from "react";
import { PERMISSIONS, ALL_PERMS, DEFAULT_MEMBER_PERMS, type PermKey } from "@/lib/permissions";

type User = {
  email: string;
  name: string;
  phone: string;
  role: "owner" | "member";
  addedAt: string;
  hasPassword: boolean;
  permissions: PermKey[];
};
type StaffSales = { staff: string; count: number; total: number; paid: number; open: number };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [sales, setSales] = useState<StaffSales[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setUsers(d.users ?? []);
        setCanManage(!!d.canManage);
        setMe(d.me ?? null);
        if (d.canManage) fetch("/api/reports/team").then((r) => r.json()).then((s) => setSales(s.byStaff ?? [])).catch(() => {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function api(method: string, body: unknown) {
    setError(""); setFlash("");
    const res = await fetch("/api/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");
    setUsers(d.users);
    return d;
  }

  async function remove(em: string) {
    if (!confirm(`Remove ${em}'s access completely?`)) return;
    try { await api("DELETE", { email: em }); setFlash(`${em} removed.`); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="px-8 py-7 pb-16">
      <div className="sticky top-0 z-20 -mx-8 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-8 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Team &amp; access</h1>
          <p className="text-sm text-neutral-500">Sign in with Google or an owner-issued ID + password. {me && <>You&apos;re <strong>{me}</strong>.</>}</p>
        </div>
        {canManage && (
          <button onClick={() => { setShowAdd((s) => !s); setEditing(null); }} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">
            {showAdd ? "Close" : "+ Add teammate"}
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {flash && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{flash}</p>}

      {!canManage && <ChangeMyPassword onDone={() => setFlash("Password updated.")} onError={setError} />}

      {canManage && showAdd && (
        <AddTeammate
          onDone={(d, msg) => { setUsers(d.users); setShowAdd(false); setFlash(msg); }}
          onError={setError}
        />
      )}

      {canManage && (
        <div className="mt-5 space-y-3">
          {users.map((u) => (
            <div key={u.email} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {u.name || u.email.split("@")[0]}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${u.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{u.role}</span>
                    {u.role !== "owner" && (
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${u.hasPassword ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"}`}>
                        {u.hasPassword ? "ID + password" : "Google only"}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                </div>
                {u.role !== "owner" && (
                  <div className="flex items-center gap-3 text-sm">
                    <button onClick={() => setEditing(editing === u.email ? null : u.email)} className="font-medium text-neutral-700 hover:text-amber-600 dark:text-neutral-300">{editing === u.email ? "Close" : "Manage"}</button>
                    <button onClick={() => remove(u.email)} className="text-red-500 hover:underline">Remove</button>
                  </div>
                )}
              </div>

              {u.role === "owner" ? (
                <p className="mt-2 text-xs text-neutral-400">Full access to everything.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {u.permissions.length === ALL_PERMS.length ? (
                    <span className="text-xs text-neutral-400">Full access</span>
                  ) : u.permissions.length === 0 ? (
                    <span className="text-xs text-red-400">No access — can sign in but see nothing</span>
                  ) : (
                    PERMISSIONS.filter((p) => u.permissions.includes(p.key)).map((p) => (
                      <span key={p.key} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{p.label}</span>
                    ))
                  )}
                </div>
              )}

              {editing === u.email && (
                <ManageTeammate
                  user={u}
                  onSaved={(d, msg) => { setUsers(d.users); setEditing(null); setFlash(msg); }}
                  onError={setError}
                />
              )}
            </div>
          ))}
          {users.length === 0 && !loading && <p className="rounded-2xl border border-neutral-200 bg-white px-4 py-8 text-center text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">No teammates yet.</p>}
        </div>
      )}

      {!canManage && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
              <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {users.map((u) => (
                <tr key={u.email}>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{u.email}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.role === "owner" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{u.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-neutral-400">Only the owner can add teammates or change access.</p>
        </div>
      )}

      {canManage && sales && (
        <div className="mt-8 max-w-2xl">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Sales by teammate</h2>
          <p className="mt-1 text-sm text-neutral-500">Every bill records who created it.</p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950">
                <tr><th className="px-4 py-3">Teammate</th><th className="px-4 py-3 text-right">Bills</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {sales.map((s) => (
                  <tr key={s.staff}>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{s.staff === "unattributed" ? <span className="text-neutral-400">Unattributed</span> : s.staff}</td>
                    <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-300">{s.count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">£{s.paid.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">£{s.open.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-neutral-900 dark:text-neutral-100">£{s.total.toFixed(2)}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-neutral-400">No sales recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-neutral-400">Only bills created after signing in (Google or ID) are attributed. Master-password bills show “Unattributed”.</p>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

function PermPicker({ value, onChange }: { value: PermKey[]; onChange: (v: PermKey[]) => void }) {
  function toggle(k: PermKey) { onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]); }
  return (
    <div>
      <div className="mb-2 flex gap-2 text-xs">
        <button type="button" onClick={() => onChange([...ALL_PERMS])} className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-600 hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-300">Select all</button>
        <button type="button" onClick={() => onChange([])} className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-600 hover:border-neutral-900 dark:border-neutral-700 dark:text-neutral-300">Clear</button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {PERMISSIONS.map((p) => (
          <label key={p.key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 ${value.includes(p.key) ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10" : "border-neutral-200 dark:border-neutral-700"}`}>
            <input type="checkbox" checked={value.includes(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-4 w-4 accent-amber-500" />
            <span>
              <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">{p.label}</span>
              <span className="block text-xs text-neutral-400">{p.desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AddTeammate({ onDone, onError }: { onDone: (d: { users: User[] }, msg: string) => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<PermKey[]>([...DEFAULT_MEMBER_PERMS]);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!email.trim()) { onError("Email required."); return; }
    setBusy(true); onError("");
    try {
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, phone, password: password || undefined, permissions: perms }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onDone(d, `${email} added${password ? " with a password" : ""}.`);
    } catch (e) { onError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Add teammate</h2>
      <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name<input className={`mt-1 ${inputCls}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raj" /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Email (their login ID)<input type="email" className={`mt-1 ${inputCls}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="raj@mobileicu.co.uk" /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Phone<input className={`mt-1 ${inputCls}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7911 123456" /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Password (optional — for ID login; blank = Google-only)<input type="text" className={`mt-1 ${inputCls}`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" /></label>
      </div>
      <p className="mt-4 text-sm font-medium text-neutral-700 dark:text-neutral-300">Feature access</p>
      <div className="mt-2 max-w-2xl"><PermPicker value={perms} onChange={setPerms} /></div>
      <button onClick={save} disabled={busy} className="mt-4 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{busy ? "Saving…" : "Add teammate"}</button>
    </div>
  );
}

function ManageTeammate({ user, onSaved, onError }: { user: User; onSaved: (d: { users: User[] }, msg: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(user.name);
  const [emailVal, setEmailVal] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [perms, setPerms] = useState<PermKey[]>(user.permissions);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify([...perms].sort()) !== JSON.stringify([...user.permissions].sort()) || name !== user.name || phone !== user.phone || emailVal.trim().toLowerCase() !== user.email,
    [perms, name, phone, emailVal, user],
  );

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true); onError("");
    try {
      const res = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, ...body }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onSaved(d, msg);
    } catch (e) { onError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Name<input className={`mt-1 ${inputCls}`} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Login email<input type="email" className={`mt-1 ${inputCls}`} value={emailVal} onChange={(e) => setEmailVal(e.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 sm:col-span-2">Phone<input className={`mt-1 ${inputCls}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7911 123456" /></label>
      </div>
      <div className="max-w-2xl"><PermPicker value={perms} onChange={setPerms} /></div>
      <button disabled={busy || !dirty} onClick={() => patch({ newEmail: emailVal, name, phone, permissions: perms }, "Teammate updated.")} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">Save details &amp; access</button>

      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Set / reset password<input type="text" className={`mt-1 ${inputCls} w-56`} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="new password" /></label>
        <button disabled={busy || password.length < 6} onClick={() => { patch({ password }, "Password set."); setPassword(""); }} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-50">Set password</button>
        {user.hasPassword && <button disabled={busy} onClick={() => patch({ password: null }, "Password login removed.")} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600 hover:border-red-400 hover:text-red-500 dark:border-neutral-700 dark:text-neutral-300">Remove password</button>}
      </div>
    </div>
  );
}

function ChangeMyPassword({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function save() {
    if (newPw.length < 6) { onError("New password must be at least 6 characters."); return; }
    setBusy(true); onError("");
    try {
      const res = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setOk(true); setOldPw(""); setNewPw(""); onDone();
    } catch (e) { onError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 max-w-md rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Change my password</h2>
      <p className="mt-1 text-xs text-neutral-400">Only applies if you sign in with an ID + password (not Google).</p>
      {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password updated.</p>}
      <div className="mt-3 space-y-3">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Current password<input type="password" className={`mt-1 ${inputCls}`} value={oldPw} onChange={(e) => setOldPw(e.target.value)} /></label>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">New password<input type="password" className={`mt-1 ${inputCls}`} value={newPw} onChange={(e) => setNewPw(e.target.value)} /></label>
        <button onClick={save} disabled={busy} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">{busy ? "Saving…" : "Update password"}</button>
      </div>
    </div>
  );
}
