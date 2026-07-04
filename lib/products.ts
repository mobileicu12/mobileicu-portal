// Product read/write helpers for the portal (export, import, create/edit).
import { adminGraphQL, getLocations, setAvailable, ShopifyError } from "./shopify";
import { tagsForChannelKeys } from "./channels";

export type ProductRecord = {
  handle: string;
  title: string;
  brand: string;
  model: string; // comma-joined if multiple
  type: string; // custom.product_type
  shopifyType: string; // productType
  vendor: string;
  tags: string; // comma-joined
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  available: number;
  status: string;
  image: string;
  collections: string; // comma-joined titles
};

// Column order used for Excel export + import template.
export const EXPORT_COLUMNS: { key: keyof ProductRecord; header: string; width: number }[] = [
  { key: "handle", header: "Handle (leave blank for new)", width: 24 },
  { key: "title", header: "Title", width: 40 },
  { key: "brand", header: "Brand", width: 14 },
  { key: "model", header: "Model", width: 18 },
  { key: "type", header: "Type", width: 16 },
  { key: "tags", header: "Tags (comma separated)", width: 28 },
  { key: "sku", header: "SKU", width: 16 },
  { key: "barcode", header: "Barcode", width: 16 },
  { key: "price", header: "Price", width: 10 },
  { key: "compareAt", header: "Compare At Price", width: 14 },
  { key: "available", header: "Stock", width: 8 },
  { key: "status", header: "Status (ACTIVE/DRAFT)", width: 18 },
  { key: "image", header: "Image URL", width: 36 },
  { key: "shopifyType", header: "Shopify Product Type", width: 22 },
  { key: "vendor", header: "Vendor", width: 14 },
  { key: "collections", header: "Collections (read-only)", width: 28 },
];

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

const EXPORT_QUERY = `
  query Export($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          handle title status productType tags vendor totalInventory
          featuredImage { url }
          brand: metafield(namespace: "custom", key: "brand") { value }
          ptype: metafield(namespace: "custom", key: "product_type") { value }
          model: metafield(namespace: "custom", key: "product_model") { value }
          collections(first: 10) { edges { node { title } } }
          variants(first: 1) { edges { node { sku barcode price compareAtPrice } } }
        }
      }
    }
  }
`;

type ExportNode = {
  handle: string;
  title: string;
  status: string;
  productType: string;
  tags: string[];
  vendor: string;
  totalInventory: number;
  featuredImage: { url: string } | null;
  brand: { value: string } | null;
  ptype: { value: string } | null;
  model: { value: string } | null;
  collections: { edges: { node: { title: string } }[] };
  variants: { edges: { node: { sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null } }[] };
};

export async function getAllProductsForExport(): Promise<ProductRecord[]> {
  const out: ProductRecord[] = [];
  let after: string | null = null;
  // Cap to keep within request limits; covers the full catalog comfortably.
  for (let page = 0; page < 40; page++) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: ExportNode }[];
      };
    } = await adminGraphQL(EXPORT_QUERY, { first: 100, after });
    for (const { node } of data.products.edges) {
      const v = node.variants.edges[0]?.node;
      out.push({
        handle: node.handle,
        title: node.title,
        brand: node.brand?.value ?? "",
        model: parseList(node.model?.value),
        type: node.ptype?.value ?? "",
        shopifyType: node.productType ?? "",
        vendor: node.vendor ?? "",
        tags: (node.tags ?? []).join(", "),
        sku: v?.sku ?? "",
        barcode: v?.barcode ?? "",
        price: v?.price ?? "",
        compareAt: v?.compareAtPrice ?? "",
        available: node.totalInventory ?? 0,
        status: node.status,
        image: node.featuredImage?.url ?? "",
        collections: node.collections.edges.map((e) => e.node.title).join(", "),
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    after = data.products.pageInfo.endCursor;
  }
  return out;
}

// ---------------- Import / create / update ----------------

export type ImportRow = {
  handle?: string;
  title: string;
  descriptionHtml?: string;
  brand?: string;
  model?: string;
  type?: string;
  shopifyType?: string;
  vendor?: string;
  tags?: string;
  sku?: string;
  barcode?: string;
  price?: string;
  compareAt?: string;
  stock?: string | number;
  status?: string;
  image?: string;
};

export type UpsertResult = { title: string; ok: boolean; action: string; error?: string };

const PRODUCT_SET = `
  mutation Set($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product {
        id
        handle
        variants(first: 1) { edges { node { id inventoryItem { id } } } }
      }
      userErrors { field message }
    }
  }
`;

function metafield(namespace: string, key: string, type: string, value: string) {
  return { namespace, key, type, value };
}

export async function upsertProduct(
  row: ImportRow,
  primaryLocationId: string,
): Promise<UpsertResult> {
  if (!row.title || !row.title.trim()) {
    return { title: row.title || "(untitled)", ok: false, action: "skip", error: "Missing title" };
  }

  const tags = (row.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const metafields: ReturnType<typeof metafield>[] = [];
  if (row.brand?.trim()) metafields.push(metafield("custom", "brand", "single_line_text_field", row.brand.trim()));
  if (row.type?.trim()) metafields.push(metafield("custom", "product_type", "single_line_text_field", row.type.trim()));
  if (row.model?.trim()) {
    const models = row.model.split(",").map((m) => m.trim()).filter(Boolean);
    metafields.push(metafield("custom", "product_model", "list.single_line_text_field", JSON.stringify(models)));
  }

  const status = (row.status ?? "ACTIVE").toUpperCase() === "DRAFT" ? "DRAFT" : "ACTIVE";

  const variant: Record<string, unknown> = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
    price: row.price ? String(row.price) : "0",
    inventoryItem: { tracked: true },
  };
  if (row.sku?.trim()) variant.sku = row.sku.trim();
  if (row.barcode?.trim()) variant.barcode = row.barcode.trim();
  if (row.compareAt?.trim()) variant.compareAtPrice = String(row.compareAt).trim();

  const input: Record<string, unknown> = {
    title: row.title.trim(),
    vendor: row.vendor?.trim() || "Mobile ICU",
    status,
    tags,
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [variant],
    metafields,
  };
  if (row.shopifyType?.trim()) input.productType = row.shopifyType.trim();
  if (row.descriptionHtml?.trim()) input.descriptionHtml = row.descriptionHtml;
  if (row.handle?.trim()) input.handle = row.handle.trim();
  if (row.image?.trim()) input.files = [{ originalSource: row.image.trim(), contentType: "IMAGE" }];

  const isUpdate = Boolean(row.handle?.trim());

  let data;
  try {
    data = await adminGraphQL<{
      productSet: {
        product: { id: string; handle: string; variants: { edges: { node: { id: string; inventoryItem: { id: string } } }[] } } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(PRODUCT_SET, { input });
  } catch (e) {
    return { title: row.title, ok: false, action: "error", error: e instanceof Error ? e.message : "Request failed" };
  }

  const errs = data.productSet.userErrors;
  if (errs.length) {
    return { title: row.title, ok: false, action: "error", error: errs.map((e) => e.message).join("; ") };
  }

  // Set stock at the primary location.
  const stock = Number(row.stock);
  const invItemId = data.productSet.product?.variants.edges[0]?.node.inventoryItem?.id;
  if (!Number.isNaN(stock) && row.stock !== "" && row.stock !== undefined && invItemId && primaryLocationId) {
    try {
      await setAvailable(invItemId, primaryLocationId, Math.max(0, Math.round(stock)));
    } catch {
      return { title: row.title, ok: true, action: isUpdate ? "updated (stock failed)" : "created (stock failed)" };
    }
  }

  return { title: row.title, ok: true, action: isUpdate ? "updated" : "created" };
}

export async function importRows(rows: ImportRow[]): Promise<UpsertResult[]> {
  const locations = await getLocations();
  const primary = locations[0]?.id ?? "";
  if (!primary) throw new ShopifyError("No active location found.");
  const results: UpsertResult[] = [];
  for (const row of rows) {
    // Sequential to respect API rate limits.
    results.push(await upsertProduct(row, primary));
  }
  return results;
}

// ---------------- Channels (tag-based routing) ----------------

export async function bulkSetChannels(
  productIds: string[],
  addKeys: string[],
  removeKeys: string[],
): Promise<{ ok: number; failed: number }> {
  const addTags = tagsForChannelKeys(addKeys);
  const removeTags = tagsForChannelKeys(removeKeys);
  let ok = 0;
  let failed = 0;
  for (const id of productIds) {
    try {
      if (addTags.length) {
        const d = await adminGraphQL<{ tagsAdd: { userErrors: { message: string }[] } }>(
          `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
          { id, tags: addTags },
        );
        if (d.tagsAdd.userErrors.length) { failed++; continue; }
      }
      if (removeTags.length) {
        const d = await adminGraphQL<{ tagsRemove: { userErrors: { message: string }[] } }>(
          `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`,
          { id, tags: removeTags },
        );
        if (d.tagsRemove.userErrors.length) { failed++; continue; }
      }
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

// ---------------- Bulk actions ----------------

export async function bulkSetStatus(
  ids: string[],
  status: "ACTIVE" | "DRAFT",
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const d = await adminGraphQL<{
        productUpdate: { userErrors: { message: string }[] };
      }>(
        `mutation($id: ID!, $status: ProductStatus!) {
          productUpdate(product: { id: $id, status: $status }) { userErrors { field message } }
        }`,
        { id, status },
      );
      if (d.productUpdate.userErrors.length) failed++;
      else ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

export async function bulkDelete(
  ids: string[],
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const d = await adminGraphQL<{
        productDelete: { deletedProductId: string | null; userErrors: { message: string }[] };
      }>(
        `mutation($id: ID!) {
          productDelete(input: { id: $id }) { deletedProductId userErrors { field message } }
        }`,
        { id },
      );
      if (d.productDelete.userErrors.length) failed++;
      else ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

export async function bulkSetPrice(
  variants: { id: string; productId: string }[],
  price: number,
): Promise<{ ok: number; failed: number }> {
  // group variant ids by product
  const byProduct = new Map<string, string[]>();
  for (const v of variants) {
    const arr = byProduct.get(v.productId) ?? [];
    arr.push(v.id);
    byProduct.set(v.productId, arr);
  }
  let ok = 0;
  let failed = 0;
  for (const [productId, ids] of byProduct) {
    try {
      const d = await adminGraphQL<{
        productVariantsBulkUpdate: { userErrors: { message: string }[] };
      }>(
        `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $pid, variants: $variants) { userErrors { field message } }
        }`,
        { pid: productId, variants: ids.map((id) => ({ id, price: String(price) })) },
      );
      if (d.productVariantsBulkUpdate.userErrors.length) failed += ids.length;
      else ok += ids.length;
    } catch {
      failed += ids.length;
    }
  }
  return { ok, failed };
}

export async function bulkSetStock(
  inventoryItemIds: string[],
  locationId: string,
  quantity: number,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const id of inventoryItemIds) {
    try {
      await setAvailable(id, locationId, Math.max(0, Math.round(quantity)));
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

export async function bulkAddToCollection(
  productIds: string[],
  collectionId: string,
): Promise<{ ok: number; failed: number }> {
  try {
    const d = await adminGraphQL<{
      collectionAddProductsV2: { job: { id: string } | null; userErrors: { message: string }[] };
    }>(
      `mutation($id: ID!, $pids: [ID!]!) {
        collectionAddProductsV2(id: $id, productIds: $pids) { job { id } userErrors { field message } }
      }`,
      { id: collectionId, pids: productIds },
    );
    if (d.collectionAddProductsV2.userErrors.length) {
      return { ok: 0, failed: productIds.length };
    }
    return { ok: productIds.length, failed: 0 };
  } catch {
    return { ok: 0, failed: productIds.length };
  }
}

// ---------------- Collections ----------------

export type CollectionRecord = {
  id: string;
  title: string;
  handle: string;
  products: number;
  smart: boolean;
  image: string | null;
};

export async function getCollectionsDetailed(): Promise<CollectionRecord[]> {
  const out: CollectionRecord[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: {
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: {
          node: {
            id: string;
            title: string;
            handle: string;
            productsCount: { count: number } | null;
            ruleSet: { rules: unknown[] } | null;
            image: { url: string } | null;
          };
        }[];
      };
    } = await adminGraphQL(
      `query($after: String) {
        collections(first: 100, after: $after, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title handle productsCount { count } ruleSet { rules { column } } image { url } } }
        }
      }`,
      { after },
    );
    for (const e of data.collections.edges) {
      out.push({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        products: e.node.productsCount?.count ?? 0,
        smart: Boolean(e.node.ruleSet),
        image: e.node.image?.url ?? null,
      });
    }
    if (!data.collections.pageInfo.hasNextPage) break;
    after = data.collections.pageInfo.endCursor;
  }
  return out;
}

export async function getManualCollections(): Promise<{ id: string; title: string }[]> {
  return (await getCollectionsDetailed())
    .filter((c) => !c.smart)
    .map((c) => ({ id: c.id, title: c.title }));
}

// ---------------- Collections (for filters / pickers) ----------------

export async function getCollectionsList(): Promise<{ id: string; title: string; handle: string }[]> {
  const out: { id: string; title: string; handle: string }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const data: {
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: { id: string; title: string; handle: string } }[];
      };
    } = await adminGraphQL(
      `query($after:String){ collections(first:100, after:$after, sortKey: TITLE){ pageInfo{ hasNextPage endCursor } edges{ node{ id title handle } } } }`,
      { after },
    );
    for (const e of data.collections.edges) out.push(e.node);
    if (!data.collections.pageInfo.hasNextPage) break;
    after = data.collections.pageInfo.endCursor;
  }
  return out;
}
