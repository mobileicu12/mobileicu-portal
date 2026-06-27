"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("from") || "/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed.");
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-50 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-900 text-lg font-bold text-amber-400">
            MI
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">
            MOBILE ICU Portal
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Inventory control</p>
        </div>

        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mb-4 w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          placeholder="Enter portal password"
        />

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
