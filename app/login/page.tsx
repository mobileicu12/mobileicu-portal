"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/portal";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [masterMode, setMasterMode] = useState(false);
  const [master, setMaster] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Teammate ID + password (or Google) via NextAuth.
  async function submitId(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
    setLoading(false);
    if (res?.ok && !res.error) {
      router.push(from);
      router.refresh();
    } else {
      setError("Wrong email or password, or you don't have access.");
    }
  }

  // Legacy master password → cookie session.
  async function submitMaster(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: master }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(from);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
    }
  }

  const input =
    "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200";

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-lg font-bold text-amber-400">
            MI
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">MOBILE ICU Portal</h1>
          <p className="mt-1 text-sm text-neutral-500">Inventory &amp; sales control</p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {!masterMode ? (
          <>
            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl: from })}
              className="mb-5 flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Sign in with Google
            </button>

            <div className="mb-4 flex items-center gap-3 text-xs text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" /> or team ID <span className="h-px flex-1 bg-neutral-200" />
            </div>

            <form onSubmit={submitId} className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1 ${input}`} placeholder="you@mobileicu.co.uk" autoComplete="username" />
              </label>
              <label className="block text-sm font-medium text-neutral-700">
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`mt-1 ${input}`} placeholder="Your password" autoComplete="current-password" />
              </label>
              <button type="submit" disabled={loading} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <button type="button" onClick={() => { setMasterMode(true); setError(""); }} className="mt-4 block w-full text-center text-xs text-neutral-400 hover:text-neutral-600">
              Use admin master password
            </button>
          </>
        ) : (
          <form onSubmit={submitMaster} className="space-y-3">
            <label className="block text-sm font-medium text-neutral-700">
              Master password
              <input type="password" value={master} onChange={(e) => setMaster(e.target.value)} className={`mt-1 ${input}`} placeholder="Portal master password" autoFocus />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60">
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" onClick={() => { setMasterMode(false); setError(""); }} className="block w-full text-center text-xs text-neutral-400 hover:text-neutral-600">
              ← Back to Google / team ID
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
