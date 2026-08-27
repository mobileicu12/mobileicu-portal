// Duplicate detection + product merge, on Shopify.
//
// A merge keeps one product (the survivor) and folds the others into it: the
// survivor takes the chosen record's details, gains the others' collections and
// tags, and the losers are deleted. Draft-order/invoice line items snapshot
// their own title/price, so deleting a merged-away product never rewrites a
// past bill — the same safety the DUDAO merge relied on.
import {
  upsertProduct,
  bulkDelete,
  bulkAddToCollection,
  type ImportRow,
} from "./products";
import { adminGraphQL, getLocations, ShopifyError } from "./shopify";
import { audit } from "./audit";

export type MergeMember = {
  id: string;
  handle: string;
  title: string;
  sku: string;
  barcode: string;
  stock: number;
  price: number;
  status: string;
  imageUrl: string | null;
  createdAt: string;
};

export type DuplicateGroup = {
  reason: "sku" | "title";
  key: string;
  members: MergeMember[];
};

const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function parseList(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) return arr.join(", ");
  } catch {
    /* not JSON */
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Scan for duplicates                                                        */
/* -------------------------------------------------------------------------- */

const SCAN_QUERY = `
  query Scan($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id handle title status createdAt totalInventory
        featuredImage { url }
        variants(first: 1) { edges { node { sku barcode price } } }
      } }
    }
  }
`;

type ScanNode = {
  id: string;
  handle: string;
  title: string;
  status: string;
  createdAt: string;
  totalInventory: number;
  featuredImage: { url: string } | null;
  variants: { edges: { node: { sku: string | null; barcode: string | null; price: string } }[] };
};

function scanToMember(n: ScanNode): MergeMember {
  const v = n.variants.edges[0]?.node;
  return {
    id: n.id,
    handle: n.handle,
    title: n.title,
    sku: v?.sku ?? "",
    barcode: v?.barcode ?? "",
    stock: n.totalInventory ?? 0,
    price: Number(v?.price ?? 0),
    status: n.status,
    imageUrl: n.featuredImage?.url ?? null,
    createdAt: n.createdAt,
  };
}

async function scanAll(): Promise<MergeMember[]> {
  const out: MergeMember[] = [];
  let after: string | null = null;
  for (let page = 0; page < 40; page++) {
    const data: {
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: ScanNode }[] };
    } = await adminGraphQL(SCAN_QUERY, { first: 100, after });
    for (const e of data.products.edges) out.push(scanToMember(e.node));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return out;
}

/** Groups of products that share a non-empty SKU or an identical name. */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  const all = await scanAll();
  const bySku = new Map<string, MergeMember[]>();
  const byTitle = new Map<string, MergeMember[]>();
  const push = (m: Map<string, MergeMember[]>, k: string, v: MergeMember) => {
    const a = m.get(k);
    if (a) a.push(v);
    else m.set(k, [v]);
  };
  for (const p of all) {
    const sku = p.sku.trim().toLowerCase();
    if (sku) push(bySku, sku, p);
    const t = normTitle(p.title);
    if (t) push(byTitle, t, p);
  }

  const sig = (list: MergeMember[]) => list.map((m) => m.id).sort().join(",");
  const seen = new Set<string>();
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of bySku) {
    if (list.length < 2) continue;
    seen.add(sig(list));
    groups.push({ reason: "sku", key, members: list });
  }
  for (const [key, list] of byTitle) {
    if (list.length < 2) continue;
    if (seen.has(sig(list))) continue;
    groups.push({ reason: "title", key, members: list });
  }
  groups.sort((a, b) =>
    a.reason === b.reason ? b.members.length - a.members.length : a.reason === "sku" ? -1 : 1,
  );
  return groups;
}

/* -------------------------------------------------------------------------- */
/* Full records (for the merge modal + resolution)                            */
/* -------------------------------------------------------------------------- */

export type MergeCandidate = MergeMember & {
  brand: string;
  model: string;
  type: string;
  shopifyType: string;
  vendor: string;
  tags: string;
  compareAt: string;
  wholesale: string;
  shopPrice: string;
  ebayPrice: string;
  amazonPrice: string;
  collectionIds: string[];
};

const NODES_QUERY = `
  query Nodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id handle title status createdAt totalInventory productType tags vendor
        featuredImage { url }
        brand: metafield(namespace: "custom", key: "brand") { value }
        ptype: metafield(namespace: "custom", key: "product_type") { value }
        model: metafield(namespace: "custom", key: "product_model") { value }
        wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
        priceShop: metafield(namespace: "custom", key: "price_shop") { value }
        priceEbay: metafield(namespace: "custom", key: "price_ebay") { value }
        priceAmazon: metafield(namespace: "custom", key: "price_amazon") { value }
        collections(first: 30) { edges { node { id } } }
        variants(first: 1) { edges { node { sku barcode price compareAtPrice } } }
      }
    }
  }
`;

type NodeProduct = {
  id: string;
  handle: string;
  title: string;
  status: string;
  createdAt: string;
  totalInventory: number;
  productType: string;
  tags: string[];
  vendor: string;
  featuredImage: { url: string } | null;
  brand: { value: string } | null;
  ptype: { value: string } | null;
  model: { value: string } | null;
  wholesale: { value: string } | null;
  priceShop: { value: string } | null;
  priceEbay: { value: string } | null;
  priceAmazon: { value: string } | null;
  collections: { edges: { node: { id: string } }[] };
  variants: { edges: { node: { sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null } }[] };
};

function nodeToCandidate(n: NodeProduct): MergeCandidate {
  const v = n.variants.edges[0]?.node;
  return {
    id: n.id,
    handle: n.handle,
    title: n.title,
    sku: v?.sku ?? "",
    barcode: v?.barcode ?? "",
    stock: n.totalInventory ?? 0,
    price: Number(v?.price ?? 0),
    status: n.status,
    imageUrl: n.featuredImage?.url ?? null,
    createdAt: n.createdAt,
    brand: n.brand?.value ?? "",
    model: parseList(n.model?.value),
    type: n.ptype?.value ?? "",
    shopifyType: n.productType ?? "",
    vendor: n.vendor ?? "",
    tags: (n.tags ?? []).join(", "),
    compareAt: v?.compareAtPrice ?? "",
    wholesale: n.wholesale?.value ?? "",
    shopPrice: n.priceShop?.value ?? "",
    ebayPrice: n.priceEbay?.value ?? "",
    amazonPrice: n.priceAmazon?.value ?? "",
    collectionIds: n.collections.edges.map((e) => e.node.id),
  };
}

async function fetchCandidates(ids: string[]): Promise<MergeCandidate[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const data = await adminGraphQL<{ nodes: (NodeProduct | null)[] }>(NODES_QUERY, { ids: unique });
  return data.nodes.filter((n): n is NodeProduct => n != null && "handle" in n).map(nodeToCandidate);
}

/** Authoritative merge info for the modal (stock, status, price, age). */
export async function getMergeCandidates(ids: string[]): Promise<MergeCandidate[]> {
  return fetchCandidates(ids);
}

/* -------------------------------------------------------------------------- */
/* Merge                                                                      */
/* -------------------------------------------------------------------------- */

export type MergeResult = {
  survivorId: string;
  mergedCount: number;
  detailsFrom: string;
  updatedFields: string[];
  collectionsAdded: number;
  deleted: number;
  stockAfter: number;
};

/**
 * Merge `mergedIds` into `survivorId`. `detailsFrom` (defaults to the survivor)
 * decides whose name/price/SKU win; resolution is priority-ordered so nothing a
 * record left blank blanks the survivor. Stock stays the survivor's unless
 * `addStock` rolls the others' in.
 */
export async function mergeProducts(
  survivorId: string,
  mergedIds: string[],
  opts: { detailsFrom?: string; addStock?: boolean; who?: string } = {},
): Promise<MergeResult> {
  const losers = [...new Set(mergedIds)].filter((id) => id !== survivorId);
  if (losers.length === 0) throw new ShopifyError("Pick at least one other product to merge in.");

  const all = await fetchCandidates([survivorId, ...losers]);
  const survivor = all.find((c) => c.id === survivorId);
  const others = losers.map((id) => all.find((c) => c.id === id)).filter((c): c is MergeCandidate => !!c);
  if (!survivor) throw new ShopifyError("The product to keep could not be loaded.");
  if (others.length === 0) throw new ShopifyError("The products to merge could not be loaded.");

  const detailsFrom =
    opts.detailsFrom && (opts.detailsFrom === survivorId || losers.includes(opts.detailsFrom))
      ? opts.detailsFrom
      : survivorId;
  const source = all.find((c) => c.id === detailsFrom) ?? survivor;

  // Priority: details source, then survivor, then the other losers.
  const priority = [source, survivor, ...others.filter((o) => o.id !== detailsFrom)];

  const pick = (of: (c: MergeCandidate) => string): string => {
    for (const c of priority) {
      const v = (of(c) ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const tags = [
    ...new Set(
      [survivor, ...others]
        .flatMap((c) => c.tags.split(",").map((t) => t.trim()).filter(Boolean)),
    ),
  ].join(", ");

  const stockAfter = opts.addStock
    ? survivor.stock + others.reduce((s, o) => s + o.stock, 0)
    : survivor.stock;

  const row: ImportRow = {
    handle: survivor.handle,
    title: pick((c) => c.title),
    brand: pick((c) => c.brand),
    model: pick((c) => c.model),
    type: pick((c) => c.type),
    shopifyType: pick((c) => c.shopifyType),
    vendor: pick((c) => c.vendor),
    tags,
    sku: pick((c) => c.sku),
    barcode: pick((c) => c.barcode),
    price: String(source.price || survivor.price || 0),
    compareAt: pick((c) => c.compareAt),
    wholesale: pick((c) => c.wholesale),
    shopPrice: pick((c) => c.shopPrice),
    ebayPrice: pick((c) => c.ebayPrice),
    amazonPrice: pick((c) => c.amazonPrice),
    status: (pick((c) => c.status) || survivor.status).toUpperCase(),
    stock: String(stockAfter),
    image: survivor.imageUrl || others.find((o) => o.imageUrl)?.imageUrl || undefined,
  };

  // Which fields actually changed on the survivor (for the audit line).
  const changed: string[] = [];
  const cmp: [string, string, string][] = [
    ["title", row.title ?? "", survivor.title],
    ["price", row.price ?? "", String(survivor.price)],
    ["sku", row.sku ?? "", survivor.sku],
    ["barcode", row.barcode ?? "", survivor.barcode],
  ];
  for (const [name, next, cur] of cmp) if (next && next !== cur) changed.push(name);

  const locations = await getLocations();
  const primary = locations[0]?.id ?? "";

  // Master's upsertProduct identifies the product to update by its handle, so
  // the row (built with the survivor's handle) targets the survivor.
  const res = await upsertProduct(row, primary, []);
  if (!res.ok) throw new ShopifyError(res.error || "Could not update the surviving product.");

  // Union collections onto the survivor.
  const survivorCols = new Set(survivor.collectionIds);
  const addCols = [...new Set(others.flatMap((o) => o.collectionIds))].filter((c) => !survivorCols.has(c));
  let collectionsAdded = 0;
  for (const colId of addCols) {
    const r = await bulkAddToCollection([survivorId], colId);
    collectionsAdded += r.ok;
  }

  const del = await bulkDelete(losers);

  await audit("product.merge", {
    ref: survivorId,
    name: survivor.title,
    detail:
      `Merged ${others.length} product${others.length === 1 ? "" : "s"} in` +
      (detailsFrom !== survivorId ? "; kept the other record's details" : "") +
      (changed.length ? `; updated ${changed.join(", ")}` : ""),
    who: opts.who,
  }).catch(() => {});

  return {
    survivorId,
    mergedCount: others.length,
    detailsFrom,
    updatedFields: changed,
    collectionsAdded,
    deleted: del.ok,
    stockAfter,
  };
}

export type BatchMergeResult = { groupsMerged: number; productsRemoved: number };

/** Resolve every duplicate group at once, keeping the newest or oldest of each. */
export async function mergeDuplicatesAuto(
  strategy: "newest" | "oldest",
  opts: { addStock?: boolean; who?: string } = {},
): Promise<BatchMergeResult> {
  const groups = await findDuplicateGroups();
  const gone = new Set<string>();
  let groupsMerged = 0;
  let productsRemoved = 0;

  for (const g of groups) {
    const live = g.members.filter((m) => !gone.has(m.id));
    if (live.length < 2) continue;
    const sorted = [...live].sort((a, b) =>
      strategy === "newest"
        ? +new Date(b.createdAt) - +new Date(a.createdAt)
        : +new Date(a.createdAt) - +new Date(b.createdAt),
    );
    const survivor = sorted[0];
    const mergedIds = sorted.slice(1).map((m) => m.id);
    await mergeProducts(survivor.id, mergedIds, {
      detailsFrom: survivor.id,
      addStock: opts.addStock,
      who: opts.who,
    });
    groupsMerged++;
    productsRemoved += mergedIds.length;
    for (const id of mergedIds) gone.add(id);
  }
  return { groupsMerged, productsRemoved };
}
