"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { NAV, visibleNav, type Me } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);

  // Owner / master-password → everything. Members → only granted features.
  const items = visibleNav(NAV, me);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    await signOut({ redirect: false }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
        <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-accentfg shadow-sm">
          MI
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-ink">MOBILE ICU</p>
          <p className="text-xs leading-tight text-muted">Control Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-ink text-bg shadow-sm"
                  : "text-muted hover:bg-subtle hover:text-ink"
              }`}
            >
              <svg className={`h-5 w-5 ${active ? "text-accent" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {me && (me.name || me.email) && (
          <div className="mb-1 flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold uppercase text-ink">
              {(me.name || me.email || "?").slice(0, 2)}
            </span>
            <span className="min-w-0 truncate">
              <span className="block truncate font-medium text-ink">{me.name || me.email}</span>
              {me.role && <span className="block truncate capitalize">{me.role}</span>}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </aside>
  );
}
