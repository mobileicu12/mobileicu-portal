"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "./cart";

const PAGES = [
  { href: "/shop", label: "Home", exact: true },
  { href: "/shop/all", label: "Shop" },
  { href: "/shop/collections", label: "Collections" },
  { href: "/shop/about", label: "About" },
  { href: "/shop/contact", label: "Contact" },
];

export default function ShopHeader({ loginUrl }: { loginUrl: string }) {
  const { count, setOpen } = useCart();
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (p: { href: string; exact?: boolean }) => (p.exact ? pathname === p.href : pathname.startsWith(p.href) && p.href !== "/shop");

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
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition ${isActive(p) ? "text-amber-600" : "text-neutral-700 hover:text-amber-600"}`}>
              {p.label}
              {isActive(p) && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-amber-500" />}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Inline search (tablet/desktop) */}
          <form action="/shop/search" method="get" className="hidden md:block">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
              <input name="q" placeholder="Search parts, brands, models…" aria-label="Search" className="w-40 rounded-full border border-neutral-300 bg-neutral-50 py-1.5 pl-8 pr-3 text-sm outline-none transition-[width,box-shadow] duration-300 focus:w-60 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200 lg:w-48" />
            </div>
          </form>
          {/* Icon-only search (phones) */}
          <Link href="/shop/search" aria-label="Search" className="rounded-lg p-2 text-neutral-600 hover:text-amber-600 md:hidden">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
          </Link>
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
              <form action="/shop/search" method="get" className="relative mb-2" onSubmit={() => setMobile(false)}>
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
                <input name="q" placeholder="Search parts, brands, models…" aria-label="Search" className="w-full rounded-full border border-neutral-300 bg-neutral-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" />
              </form>
              {PAGES.map((p) => (
                <Link key={p.href} href={p.href} onClick={() => setMobile(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">{p.label}</Link>
              ))}
              <a href={loginUrl} className="block rounded-lg px-3 py-2 text-sm text-neutral-600">Trade login</a>
              <Link href="/shop/register" onClick={() => setMobile(false)} className="block rounded-lg px-3 py-2 text-sm font-medium text-amber-600">Register for wholesale</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
