"use client";

import { useRouter } from "next/navigation";

export default function Topbar() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-sm font-bold text-amber-400">
          MI
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-neutral-900">
            MOBILE ICU Portal
          </p>
          <p className="text-xs leading-tight text-neutral-500">Inventory control</p>
        </div>
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
      >
        Log out
      </button>
    </header>
  );
}
