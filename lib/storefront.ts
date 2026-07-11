// Public storefront data — read-only catalog via the Admin API (server-side only).
import { adminGraphQL } from "./shopify";

export const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";

export type ShopProductCard = {
  id: string;
  handle: string;
  title: string;
  image: string | null;
  price: string;
  compareAt: string | null;
  available: boolean;
  vendor: string;
  brand: string;
  type: string;
  models: string[];
  variantNumericId: string | null; // default variant, for quick add-to-cart
  hasOptions: boolean; // multiple variants -> choose on product page
  wholesalePrice: string | null; // trade price (custom.wholesale_price)
};

export type ShopCollectionCard = {
  id: string;
  handle: string;
  title: string;
  image: string | null;
  count: number;
  parent: string | null;
};

const num = (gid: string) => gid.split("/").pop() ?? gid;

function parseModels(v: string | null | undefined): string[] {
  if (!v) return [];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : [String(a)]; }
  catch { return v ? [v] : []; }
}

type CardNode = {
  id: string; handle: string; title: string; vendor: string | null;
  featuredImage: { url: string } | null;
  priceRangeV2: { minVariantPrice: { amount: string } };
  compareAtPriceRange?: { minVariantCompareAtPrice: { amount: string } | null } | null;
  totalInventory: number | null;
  status: string;
  brand?: { value: string } | null;
  ptype?: { value: string } | null;
  modelsMf?: { value: string } | null;
  wholesale?: { value: string } | null;
  variants?: { edges: { node: { id: string } }[] };
};

function mapProduct(node: CardNode): ShopProductCard {
  const compare = node.compareAtPriceRange?.minVariantCompareAtPrice?.amount ?? null;
  const vEdges = node.variants?.edges ?? [];
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    image: node.featuredImage?.url ?? null,
    price: node.priceRangeV2.minVariantPrice.amount,
    compareAt: compare && Number(compare) > Number(node.priceRangeV2.minVariantPrice.amount) ? compare : null,
    available: (node.totalInventory ?? 0) > 0,
    vendor: node.vendor ?? "",
    brand: node.brand?.value ?? "",
    type: node.ptype?.value ?? "",
    models: parseModels(node.modelsMf?.value),
    variantNumericId: vEdges[0] ? (vEdges[0].node.id.split("/").pop() ?? null) : null,
    hasOptions: vEdges.length > 1,
    wholesalePrice: node.wholesale?.value && Number(node.wholesale.value) > 0 ? node.wholesale.value : null,
  };
}

const PRODUCT_CARD_FIELDS = `
  id handle title vendor status totalInventory
  featuredImage { url }
  priceRangeV2 { minVariantPrice { amount } }
  compareAtPriceRange { minVariantCompareAtPrice { amount } }
  brand: metafield(namespace: "custom", key: "brand") { value }
  ptype: metafield(namespace: "custom", key: "product_type") { value }
  modelsMf: metafield(namespace: "custom", key: "product_model") { value }
  wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
  variants(first: 2) { edges { node { id } } }
`;

export async function getFeaturedProducts(first = 8): Promise<ShopProductCard[]> {
  const d = await adminGraphQL<{ products: { edges: { node: Parameters<typeof mapProduct>[0] }[] } }>(
    `query($first: Int!) {
      products(first: $first, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
        edges { node { ${PRODUCT_CARD_FIELDS} } }
      }
    }`,
    { first },
  );
  return d.products.edges.map((e) => mapProduct(e.node));
}

export async function getAllProducts(max = 250): Promise<ShopProductCard[]> {
  const out: ShopProductCard[] = [];
  let after: string | null = null;
  while (out.length < max) {
    const d: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; edges: { node: CardNode }[] } } =
      await adminGraphQL(
        `query($after: String) {
          products(first: 100, after: $after, query: "status:active", sortKey: TITLE) {
            pageInfo { hasNextPage endCursor }
            edges { node { ${PRODUCT_CARD_FIELDS} } }
          }
        }`,
        { after },
      );
    out.push(...d.products.edges.map((e) => mapProduct(e.node)));
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  return out.slice(0, max);
}

export async function getStorefrontCollections(): Promise<ShopCollectionCard[]> {
  const out: ShopCollectionCard[] = [];
  let after: string | null = null;
  for (let p = 0; p < 5; p++) {
    const d: {
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; handle: string; title: string; image: { url: string } | null; productsCount: { count: number } | null; parent: { value: string } | null } }[];
      };
    } = await adminGraphQL(
      `query($after: String) {
        collections(first: 100, after: $after, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges { node { id handle title image { url } productsCount { count } parent: metafield(namespace: "portal", key: "parent") { value } } }
        }
      }`,
      { after },
    );
    for (const e of d.collections.edges) {
      out.push({ id: e.node.id, handle: e.node.handle, title: e.node.title, image: e.node.image?.url ?? null, count: e.node.productsCount?.count ?? 0, parent: e.node.parent?.value || null });
    }
    if (!d.collections.pageInfo.hasNextPage) break;
    after = d.collections.pageInfo.endCursor;
  }
  return out;
}

export type ShopCollectionPage = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  image: string | null;
  products: ShopProductCard[];
  subCollections: ShopCollectionCard[];
};

async function productsInCollectionId(collectionId: string, first = 100): Promise<ShopProductCard[]> {
  const d = await adminGraphQL<{ collection: { products: { edges: { node: CardNode }[] } } | null }>(
    `query($id: ID!, $first: Int!) {
      collection(id: $id) { products(first: $first) { edges { node { ${PRODUCT_CARD_FIELDS} } } } }
    }`,
    { id: collectionId, first },
  );
  return d.collection?.products.edges.map((e) => mapProduct(e.node)) ?? [];
}

export async function getStorefrontCollection(handle: string): Promise<ShopCollectionPage | null> {
  const d = await adminGraphQL<{
    collections: { edges: { node: {
      id: string; title: string; handle: string; descriptionHtml: string; image: { url: string } | null;
      products: { edges: { node: CardNode }[] };
    } }[] };
  }>(
    `query($q: String!) {
      collections(first: 1, query: $q) {
        edges { node {
          id title handle descriptionHtml image { url }
          products(first: 100) { edges { node { ${PRODUCT_CARD_FIELDS} } } }
        } }
      }
    }`,
    { q: `handle:${handle}` },
  );
  const c = d.collections.edges[0]?.node;
  if (!c) return null;

  const all = await getStorefrontCollections();
  const subs = all.filter((x) => x.parent === c.id);

  // Aggregate: this collection's own products + all direct children's products (deduped).
  let products = c.products.edges.map((e) => mapProduct(e.node));
  if (subs.length > 0) {
    const childSets = await Promise.all(subs.map((s) => productsInCollectionId(s.id).catch(() => [])));
    const seen = new Set(products.map((p) => p.id));
    for (const set of childSets) {
      for (const p of set) if (!seen.has(p.id)) { seen.add(p.id); products.push(p); }
    }
  }

  return {
    id: c.id,
    title: c.title,
    handle: c.handle,
    descriptionHtml: c.descriptionHtml ?? "",
    image: c.image?.url ?? null,
    products,
    subCollections: subs,
  };
}

export type ShopVariant = { id: string; numericId: string; title: string; price: string; compareAt: string | null; available: boolean; options: { name: string; value: string }[] };
export type ShopProduct = {
  id: string; handle: string; title: string; descriptionHtml: string; vendor: string;
  images: string[];
  price: string; compareAt: string | null; wholesalePrice: string | null;
  options: { name: string; values: string[] }[];
  variants: ShopVariant[];
  available: boolean;
};

export async function getStorefrontProduct(handle: string): Promise<ShopProduct | null> {
  const d = await adminGraphQL<{
    products: { edges: { node: {
      id: string; handle: string; title: string; descriptionHtml: string; vendor: string | null; totalInventory: number | null;
      priceRangeV2: { minVariantPrice: { amount: string } };
      compareAtPriceRange: { minVariantCompareAtPrice: { amount: string } | null } | null;
      wholesale: { value: string } | null;
      options: { name: string; optionValues: { name: string }[] }[];
      images: { edges: { node: { url: string } }[] };
      variants: { edges: { node: { id: string; title: string; price: string; compareAtPrice: string | null; availableForSale: boolean; selectedOptions: { name: string; value: string }[] } }[] };
    } }[] };
  }>(
    `query($q: String!) {
      products(first: 1, query: $q) {
        edges { node {
          id handle title descriptionHtml vendor totalInventory
          priceRangeV2 { minVariantPrice { amount } }
          compareAtPriceRange { minVariantCompareAtPrice { amount } }
          wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
          options { name optionValues { name } }
          images(first: 10) { edges { node { url } } }
          variants(first: 100) { edges { node { id title price compareAtPrice availableForSale selectedOptions { name value } } } }
        } }
      }
    }`,
    { q: `handle:${handle}` },
  );
  const p = d.products.edges[0]?.node;
  if (!p) return null;
  const compare = p.compareAtPriceRange?.minVariantCompareAtPrice?.amount ?? null;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.descriptionHtml ?? "",
    vendor: p.vendor ?? "",
    images: p.images.edges.map((e) => e.node.url),
    price: p.priceRangeV2.minVariantPrice.amount,
    compareAt: compare && Number(compare) > Number(p.priceRangeV2.minVariantPrice.amount) ? compare : null,
    wholesalePrice: p.wholesale?.value && Number(p.wholesale.value) > 0 ? p.wholesale.value : null,
    options: p.options.map((o) => ({ name: o.name, values: o.optionValues.map((v) => v.name) })),
    variants: p.variants.edges.map((e) => ({
      id: e.node.id,
      numericId: num(e.node.id),
      title: e.node.title === "Default Title" ? "" : e.node.title,
      price: e.node.price,
      compareAt: e.node.compareAtPrice && Number(e.node.compareAtPrice) > Number(e.node.price) ? e.node.compareAtPrice : null,
      available: e.node.availableForSale,
      options: e.node.selectedOptions,
    })),
    available: (p.totalInventory ?? 0) > 0,
  };
}

export async function searchStorefront(q: string, first = 24): Promise<ShopProductCard[]> {
  if (!q.trim()) return [];
  const d = await adminGraphQL<{ products: { edges: { node: Parameters<typeof mapProduct>[0] }[] } }>(
    `query($q: String!, $first: Int!) {
      products(first: $first, query: $q, sortKey: RELEVANCE) { edges { node { ${PRODUCT_CARD_FIELDS} } } }
    }`,
    { q: `status:active AND (title:*${q.trim()}* OR tag:${q.trim()})`, first },
  );
  return d.products.edges.map((e) => mapProduct(e.node));
}
