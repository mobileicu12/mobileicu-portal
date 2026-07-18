"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { NAV, visibleNav, type Me, type NavItem } from "@/lib/nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// Apple-style "liquid glass" floating bottom navigation for phones/tablets.
export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {});
  }, []);

  // Close the "More" sheet whenever the route changes.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const items = visibleNav(NAV, me);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const rest = items.filter((i) => !primary.includes(i));

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    await signOut({ redirect: false }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const tab = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${
          active ? "bg-ink text-bg shadow-sm" : "text-muted"
        }`}
      >
        <NavIcon d={item.icon} className={`h-5 w-5 ${active ? "text-accent" : ""}`} />
        <span className="max-w-full truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Backdrop + "More" sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute inset-x-3 bottom-24 rounded-3xl border border-white/30 bg-white/80 p-3 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/85"
            onClick={(e) => e.stopPropagation()}
          >
            {me && (me.name || me.email) && (
              <div className="mb-2 flex items-center gap-2 px-2 py-1 text-xs text-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold uppercase text-ink">{(me.name || me.email || "?").slice(0, 2)}</span>
                <span className="min-w-0 truncate"><span className="block truncate font-medium text-ink">{me.name || me.email}</span>{me.role && <span className="block capitalize">{me.role}</span>}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {rest.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center text-xs font-medium transition ${active ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"}`}>
                    <NavIcon d={item.icon} className="h-5 w-5" />
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <button onClick={logout} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-2.5 text-sm font-medium text-muted">
              <NavIcon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="h-5 w-5" />
              Log out
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto mb-3 flex w-[94%] max-w-md items-stretch gap-1 rounded-[28px] border border-white/40 bg-white/70 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/70">
          {primary.map(tab)}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition ${moreOpen ? "bg-ink text-bg" : "text-muted"}`}
          >
            <NavIcon d="M4 6h16M4 12h16M4 18h16" className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
