"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "./cart";

type NavCol = { handle: string; title: string; children: { handle: string; title: string }[] };

export default function ShopHeader({ nav, loginUrl }: { nav: NavCol[]; loginUrl: string }) {
  const { count, setOpen } = useCart();
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur transition-shadow duration-300 ${scrolled ? "border-neutral-200 shadow-[0_6px_20px_-12px_rgba(0,0,0,0.25)]" : "border-transparent"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <button onClick={() => setMobile((v) => !v)} className="lg:hidden" aria-label="Menu">
          <span className="block h-0.5 w-6 bg-neutral-900" />
          <span className="mt-1.5 block h-0.5 w-6 bg-neutral-900" />
          <span className="mt-1.5 block h-0.5 w-6 bg-neutral-900" />
        </button>

        <Link href="/shop" className="text-lg font-extrabold tracking-tight text-neutral-900">
          MOBILE<span className="text-amber-500"> ICU</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {nav.slice(0, 7).map((c) => (
            <div key={c.handle} className="group relative">
              <Link href={`/shop/c/${c.handle}`} className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:text-amber-600">
                {c.title}
              </Link>
              {c.children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 min-w-52 rounded-xl border border-neutral-200 bg-white p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
                  {c.children.map((s) => (
                    <Link key={s.handle} href={`/shop/c/${s.handle}`} className="block rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-amber-600">
                      {s.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/shop/search" className="hidden rounded-lg px-3 py-2 text-sm text-neutral-600 hover:text-amber-600 sm:block">Search</Link>
          <a href={loginUrl} className="hidden rounded-full border border-neutral-300 px-3.5 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-900 sm:block">Trade login</a>
          <button onClick={() => setOpen(true)} className="relative rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 hover:text-neutral-900">
            Cart
            {count > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-neutral-900">{count}</span>}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {mobile && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-neutral-200 lg:hidden">
            <div className="mx-auto max-w-7xl px-4 py-2">
              {nav.map((c) => (
                <Link key={c.handle} href={`/shop/c/${c.handle}`} onClick={() => setMobile(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  {c.title}
                </Link>
              ))}
              <Link href="/shop/search" onClick={() => setMobile(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-600">Search</Link>
              <a href={loginUrl} className="block rounded-lg px-3 py-2 text-sm text-neutral-600">Trade login</a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
