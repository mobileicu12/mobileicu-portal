"use client";

import Link from "next/link";
import { useState } from "react";
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
    if (parent) {
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(node);
    } else roots.push(node);
  }
  const attach = (n: Node) => { n.children = (byParent.get(n.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)); n.children.forEach(attach); };
  roots.forEach(attach);
  return roots.sort((a, b) => a.title.localeCompare(b.title));
}

function hasActive(node: Node, active: string): boolean {
  if (node.handle === active) return true;
  return node.children.some((c) => hasActive(c, active));
}

function Branch({ node, active, depth }: { node: Node; active: string; depth: number }) {
  const activeInside = hasActive(node, active);
  const [open, setOpen] = useState(activeInside);
  const isActive = node.handle === active;
  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
        {node.children.length > 0 ? (
          <button onClick={() => setOpen((v) => !v)} className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-900">{open ? "−" : "+"}</button>
        ) : <span className="mr-1 inline-block h-5 w-5" />}
        <Link href={`/shop/c/${node.handle}`} className={`flex flex-1 items-center justify-between rounded-md px-2 py-1.5 text-sm ${isActive ? "bg-amber-50 font-semibold text-amber-700" : "text-neutral-700 hover:bg-neutral-50 hover:text-amber-600"}`}>
          <span className="truncate">{node.title}</span>
          {node.count > 0 && <span className="ml-2 shrink-0 text-xs text-neutral-400">{node.count}</span>}
        </Link>
      </div>
      {open && node.children.map((c) => <Branch key={c.id} node={c} active={active} depth={depth + 1} />)}
    </div>
  );
}

export default function CategorySidebar({ collections, active }: { collections: ShopCollectionCard[]; active: string }) {
  const tree = buildTree(collections.filter((c) => c.count > 0 || collections.some((x) => x.parent === c.id)));
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Categories</p>
      <nav className="space-y-0.5">
        <Link href="/shop/collections" className="block rounded-md px-2 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-amber-600">All categories</Link>
        {tree.map((n) => <Branch key={n.id} node={n} active={active} depth={0} />)}
      </nav>
    </aside>
  );
}
