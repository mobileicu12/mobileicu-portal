"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ShopCollectionCard } from "@/lib/storefront";

type Node = ShopCollectionCard & { children: Node[] };

function buildTree(cols: ShopCollectionCard[]): Node[] {
  const ids = new Set(cols.map((c) => c.id));
  const byParent = new Map<string, Node[]>();
  const nodes = new Map<string, Node>();
  cols.forEach((c) => nodes.set(c.id, { ...c, children: [] }));
  const roots: Node[] = [];
  for (const c of cols) {
    const node = nodes.get(c.id)!;
    const parent = c.parent && ids.has(c.parent) ? c.parent : null;
    if (parent) { if (!byParent.has(parent)) byParent.set(parent, []); byParent.get(parent)!.push(node); }
    else roots.push(node);
  }
  const attach = (n: Node) => { n.children = (byParent.get(n.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)); n.children.forEach(attach); };
  roots.forEach(attach);
  return roots.sort((a, b) => a.title.localeCompare(b.title));
}
function hasActive(node: Node, active: string): boolean {
  return node.handle === active || node.children.some((c) => hasActive(c, active));
}

function Branch({ node, active, depth }: { node: Node; active: string; depth: number }) {
  const [open, setOpen] = useState(hasActive(node, active));
  const isActive = node.handle === active;
  const hasKids = node.children.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
        {hasKids ? (
          <button onClick={() => setOpen((v) => !v)} aria-label="Toggle" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="text-[10px]">▶</motion.span>
          </button>
        ) : <span className="inline-block h-6 w-6 shrink-0" />}
        <Link
          href={`/shop/c/${node.handle}`}
          className={`relative flex flex-1 items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ${
            isActive ? "bg-amber-50 font-semibold text-amber-700" : "text-neutral-700 hover:bg-neutral-50 hover:text-amber-600"
          }`}
        >
          {isActive && <motion.span layoutId="cat-active" className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-amber-500" />}
          <span className="truncate">{node.title}</span>
          {node.count > 0 && <span className="ml-2 shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 group-hover:bg-white">{node.count}</span>}
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {open && hasKids && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 space-y-0.5 border-l border-neutral-100" style={{ marginLeft: depth * 12 + 12 }}>
              {node.children.map((c) => <Branch key={c.id} node={{ ...c }} active={active} depth={0} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Embeddable category tree (no wrapper) — used inside the unified filter rail.
export function CategoryNav({ collections, active }: { collections: ShopCollectionCard[]; active: string }) {
  const tree = buildTree(collections.filter((c) => c.count > 0 || collections.some((x) => x.parent === c.id)));
  return (
    <nav className="space-y-0.5">
      <Link href="/shop/collections" className={`block rounded-lg px-2.5 py-1.5 text-sm font-medium ${active === "" ? "text-amber-700" : "text-neutral-700 hover:bg-neutral-50 hover:text-amber-600"}`}>All categories</Link>
      {tree.map((n) => <Branch key={n.id} node={n} active={active} depth={0} />)}
    </nav>
  );
}

export default function CategorySidebar({ collections, active }: { collections: ShopCollectionCard[]; active: string }) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3">
        <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-neutral-400">Categories</p>
        <CategoryNav collections={collections} active={active} />
      </div>
    </aside>
  );
}
