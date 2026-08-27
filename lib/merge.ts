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
  /** What tied them together. Barcode is the strongest, name the weakest. */
  reason: "barcode" | "sku" | "title";
  key: string;
  members: MergeMember[];
  /** How much the match is worth trusting. Only "certain" is safe to merge
   *  without looking; "likely" means the name matched and nothing contradicted
   *  it, which is a prompt to check rather than an instruction to merge. */
  confidence: "certain" | "likely";
};

/**
 * Products sharing a name whose SKUs or barcodes say they are NOT the same
 * thing. Reported separately so they can be eyeballed without inflating the
 * duplicate count — "iPhone 13 Screen" from two suppliers is two products.
 */
export type NameClash = {
  key: string;
  members: MergeMember[];
};

export type DuplicateScan = {
  groups: DuplicateGroup[];
  nameClashes: NameClash[];
  /** Products examined, and whether the scan hit its ceiling before the end.
   *  A truncated scan can only ever under-report, so it has to be visible. */
  scanned: number;
  truncated: boolean;
};

// Names are compared with punctuation and spacing flattened, so "iPhone 13 Pro
// (OEM)" and "iPhone 13 Pro - OEM" land in the same bucket. Unicode dashes are
// folded first: a copy-pasted en-dash otherwise reads as a different product.
const normTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ident = (s: string) => s.trim().toLowerCase();

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

// Hard stop, not a working limit: 500 pages is 50,000 products. The old ceiling
// of 40 pages quietly stopped at 4,000, and a duplicate scan that stops early
// reports "no duplicates" for everything past the cut — the one failure mode a
// duplicate finder must never have silently.
const MAX_SCAN_PAGES = 500;

async function scanAll(): Promise<{ members: MergeMember[]; truncated: boolean }> {
  const out: MergeMember[] = [];
  let after: string | null = null;
  let truncated = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_SCAN_PAGES) { truncated = true; break; }
    const data: {
      products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: ScanNode }[] };
    } = await adminGraphQL(SCAN_QUERY, { first: 100, after });
    for (const e of data.products.edges) out.push(scanToMember(e.node));
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return { members: out, truncated };
}

/**
 * Find products that are the same thing entered more than once.
 *
 * The rule that matters is that identifiers cut BOTH ways. A shared barcode or
 * SKU proves two records are the same product; a *differing* one proves they
 * are not, however alike they otherwise look. The previous version only used
 * identifiers as positive evidence and grouped on name alone, so two suppliers'
 * "iPhone 13 Screen" — different SKUs, different barcodes — were reported as
 * duplicates, and merging them would have destroyed a real product.
 *
 * Three passes, strongest evidence first, each product landing in one group:
 *
 *   1. barcode — a GTIN identifies a product globally. Certain.
 *   2. SKU     — the shop's own identifier. Certain, but a group is split
 *                where barcodes inside it disagree; a reused SKU on two
 *                different parts is a data-entry slip, not a duplicate.
 *   3. name    — only when nothing contradicts it. Same name with different
 *                identifiers is reported as a name clash instead.
 */
export async function findDuplicates(): Promise<DuplicateScan> {
  const { members: all, truncated } = await scanAll();

  const groups: DuplicateGroup[] = [];
  const nameClashes: NameClash[] = [];
  // A product belongs to at most one group, claimed by the strongest match.
  const claimed = new Set<string>();

  const bucket = (list: MergeMember[], key: (m: MergeMember) => string) => {
    const m = new Map<string, MergeMember[]>();
    for (const item of list) {
      const k = key(item);
      if (!k) continue;
      const arr = m.get(k);
      if (arr) arr.push(item);
      else m.set(k, [item]);
    }
    return m;
  };

  // ---- 1. Same barcode -> certainly the same product.
  for (const [key, list] of bucket(all, (m) => ident(m.barcode))) {
    if (list.length < 2) continue;
    groups.push({ reason: "barcode", key, members: list, confidence: "certain" });
    for (const m of list) claimed.add(m.id);
  }

  // ---- 2. Same SKU -> the same product, unless barcodes disagree.
  for (const [key, list] of bucket(all.filter((m) => !claimed.has(m.id)), (m) => ident(m.sku))) {
    if (list.length < 2) continue;
    const barcodes = new Set(list.map((m) => ident(m.barcode)).filter(Boolean));
    if (barcodes.size > 1) {
      // One SKU on two different barcodes: these are different parts sharing a
      // code. Flagging them for a look is right; calling them duplicates isn't.
      nameClashes.push({ key: `SKU ${key}`, members: list });
      continue;
    }
    groups.push({ reason: "sku", key, members: list, confidence: "certain" });
    for (const m of list) claimed.add(m.id);
  }

  // ---- 3. Same name, and nothing says otherwise.
  for (const [key, list] of bucket(all.filter((m) => !claimed.has(m.id)), (m) => normTitle(m.title))) {
    if (list.length < 2) continue;
    // Distinct non-empty identifiers within one name = distinct products.
    const ids = new Set(
      list.map((m) => ident(m.barcode) || ident(m.sku)).filter(Boolean),
    );
    if (ids.size > 1) {
      nameClashes.push({ key, members: list });
      continue;
    }
    groups.push({ reason: "title", key, members: list, confidence: "likely" });
    for (const m of list) claimed.add(m.id);
  }

  const rank = { barcode: 0, sku: 1, title: 2 } as const;
  groups.sort((a, b) =>
    rank[a.reason] !== rank[b.reason] ? rank[a.reason] - rank[b.reason] : b.members.length - a.members.length,
  );
  nameClashes.sort((a, b) => b.members.length - a.members.length);

  return { groups, nameClashes, scanned: all.length, truncated };
}

/** Back-compat wrapper for callers that only want the groups. */
export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  return (await findDuplicates()).groups;
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

export type BatchMergeResult = {
  groupsMerged: number;
  productsRemoved: number;
  /** Name-only matches left alone because nothing confirmed them. */
  skippedUnconfirmed: number;
};

/** Resolve every duplicate group at once, keeping the newest or oldest of each. */
export async function mergeDuplicatesAuto(
  strategy: "newest" | "oldest",
  opts: { addStock?: boolean; who?: string; include?: "certain" | "all" } = {},
): Promise<BatchMergeResult> {
  // Merging deletes products, so unattended merging is limited to groups an
  // identifier proves are the same thing. A name-only match is a prompt to
  // look, not grounds to delete one of them — including those needs an
  // explicit ask, and even then it is the operator's judgement, not ours.
  const include = opts.include ?? "certain";
  const all = await findDuplicateGroups();
  const groups = include === "all" ? all : all.filter((g) => g.confidence === "certain");
  const skipped = all.length - groups.length;
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
  return { groupsMerged, productsRemoved, skippedUnconfirmed: skipped };
}
