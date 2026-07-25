"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { NAV, visibleNav, groupedNav, type Me } from "@/lib/nav";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
    try { setCollapsed(localStorage.getItem("sidebar:collapsed") === "1"); } catch { /* ignore */ }
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const n = !v;
      try { localStorage.setItem("sidebar:collapsed", n ? "1" : "0"); } catch { /* ignore */ }
      return n;
    });
  }

  const groups = groupedNav(visibleNav(NAV, me));

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    await signOut({ redirect: false }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className={`relative hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out md:flex ${collapsed ? "w-16" : "w-60"}`}>
      {/* Collapse toggle */}
      <button
        onClick={toggle}
        title={collapsed ? "Expand" : "Collapse"}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition hover:text-ink"
      >
        <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" /></svg>
      </button>

      <div className={`flex shrink-0 items-center gap-3 border-b border-line py-4 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <div className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-accentfg shadow-sm">MI</div>
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold leading-tight text-ink">MOBILE ICU</p>
            <p className="text-xs leading-tight text-muted">Control Portal</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.key} className="mb-3 last:mb-0">
            {!collapsed && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted/60">{g.label}</p>}
            {collapsed && <div className="mx-2 mb-1 border-t border-line/70" />}
            <div className="space-y-1">
              {g.items.map((item) => {
                const active = item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition ${collapsed ? "justify-center px-0" : "px-3"} ${
                      active ? "bg-ink text-bg shadow-sm" : "text-muted hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <svg className={`h-5 w-5 shrink-0 ${active ? "text-accent" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        {!collapsed && me && (me.name || me.email) && (
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
          title={collapsed ? "Log out" : undefined}
          className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-muted transition hover:bg-subtle hover:text-ink ${collapsed ? "justify-center px-0" : "px-3"}`}
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && "Log out"}
        </button>
      </div>
    </aside>
  );
}
