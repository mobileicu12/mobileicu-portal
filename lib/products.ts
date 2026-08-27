// Product read/write helpers for the portal (export, import, create/edit).
import { adminGraphQL, getLocations, setAvailable, ShopifyError } from "./shopify";
import { tagsForChannelKeys } from "./channels";
import { mapLimit } from "./async";

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
  wholesale: string; // custom.wholesale_price
  shopPrice: string; // custom.price_shop
  ebayPrice: string; // custom.price_ebay
  amazonPrice: string; // custom.price_amazon
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
  { key: "wholesale", header: "Wholesale Price", width: 14 },
  { key: "shopPrice", header: "Shop Price", width: 12 },
  { key: "ebayPrice", header: "eBay Price", width: 12 },
  { key: "amazonPrice", header: "Amazon Price", width: 12 },
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
  query Export($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          handle title status productType tags vendor totalInventory
          featuredImage { url }
          brand: metafield(namespace: "custom", key: "brand") { value }
          ptype: metafield(namespace: "custom", key: "product_type") { value }
          model: metafield(namespace: "custom", key: "product_model") { value }
          wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
          priceShop: metafield(namespace: "custom", key: "price_shop") { value }
          priceEbay: metafield(namespace: "custom", key: "price_ebay") { value }
          priceAmazon: metafield(namespace: "custom", key: "price_amazon") { value }
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
  wholesale: { value: string } | null;
  priceShop: { value: string } | null;
  priceEbay: { value: string } | null;
  priceAmazon: { value: string } | null;
  collections: { edges: { node: { title: string } }[] };
  variants: { edges: { node: { sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null } }[] };
};

export async function getAllProductsForExport(queryFilter?: string): Promise<ProductRecord[]> {
  const out: ProductRecord[] = [];
  let after: string | null = null;
  // Pages to the end. The old ceiling of 40 pages stopped at 4,000 products
  // without saying so, which quietly made an import preview treat everything
  // past that as new — the same silent truncation the duplicate scan had.
  for (let page = 0; page < 500; page++) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: { node: ExportNode }[];
      };
    } = await adminGraphQL(EXPORT_QUERY, { first: 100, after, query: queryFilter ?? null });
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
        wholesale: node.wholesale?.value ?? "",
        shopPrice: node.priceShop?.value ?? "",
        ebayPrice: node.priceEbay?.value ?? "",
        amazonPrice: node.priceAmazon?.value ?? "",
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
  wholesale?: string;
  shopPrice?: string;
  ebayPrice?: string;
  amazonPrice?: string;
  stock?: string | number;
  status?: string;
  image?: string;
};

export type UpsertResult = {
  title: string;
  ok: boolean;
  action: string;
  error?: string;
  /** The product written, so a run can be undone later. */
  productId?: string;
  handle?: string;
  /** What the product looked like before this row touched it. Null for creates. */
  before?: ProductSnapshot | null;
};

// Everything needed to put a product back exactly as it was.
export type ProductSnapshot = {
  id: string;
  handle: string;
  title: string;
  status: string;
  vendor: string;
  productType: string;
  descriptionHtml: string;
  tags: string[];
  variantId: string | null;
  inventoryItemId: string | null;
  price: string;
  compareAtPrice: string | null;
  sku: string;
  barcode: string;
  /** Only the `custom` namespace — the one the importer writes to. */
  metafields: { namespace: string; key: string; type: string; value: string }[];
  /** Available at the primary location, or null if not tracked there. */
  stock: number | null;
};

const SNAPSHOT_QUERY = `
  query Snap($handle: String!, $loc: ID!) {
    productByIdentifier(identifier: { handle: $handle }) {
      id handle title status vendor productType descriptionHtml tags
      metafields(namespace: "custom", first: 50) {
        edges { node { namespace key type value } }
      }
      variants(first: 1) {
        edges { node {
          id price compareAtPrice sku barcode
          inventoryItem { id inventoryLevel(locationId: $loc) { quantities(names: ["available"]) { name quantity } } }
        } }
      }
    }
  }
`;

/** Read a product by handle, or null if there isn't one. */
export async function getProductSnapshot(handle: string, locationId: string): Promise<ProductSnapshot | null> {
  const d = await adminGraphQL<{
    productByIdentifier: {
      id: string; handle: string; title: string; status: string; vendor: string;
      productType: string; descriptionHtml: string; tags: string[];
      metafields: { edges: { node: { namespace: string; key: string; type: string; value: string } }[] };
      variants: { edges: { node: {
        id: string; price: string; compareAtPrice: string | null; sku: string | null; barcode: string | null;
        inventoryItem: { id: string; inventoryLevel: { quantities: { name: string; quantity: number }[] } | null } | null;
      } }[] };
    } | null;
  }>(SNAPSHOT_QUERY, { handle: handle.trim(), loc: locationId });

  const p = d.productByIdentifier;
  if (!p) return null;
  const v = p.variants.edges[0]?.node;
  const avail = v?.inventoryItem?.inventoryLevel?.quantities.find((q) => q.name === "available");
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    status: p.status,
    vendor: p.vendor ?? "",
    productType: p.productType ?? "",
    descriptionHtml: p.descriptionHtml ?? "",
    tags: p.tags ?? [],
    variantId: v?.id ?? null,
    inventoryItemId: v?.inventoryItem?.id ?? null,
    price: v?.price ?? "0",
    compareAtPrice: v?.compareAtPrice ?? null,
    sku: v?.sku ?? "",
    barcode: v?.barcode ?? "",
    metafields: p.metafields.edges.map((e) => e.node),
    stock: avail ? avail.quantity : null,
  };
}

// Metafields are written separately from productSet, NOT inside it.
//
// productSet treats metafields as a list field: entries not included in the
// input are deleted. Sending only the handful of `custom` keys the spreadsheet
// carries would therefore wipe anything else on the product — including the
// portal's own metafields. metafieldsSet only touches the keys it's given.
async function writeMetafields(
  ownerId: string,
  fields: { namespace: string; key: string; type: string; value: string }[],
): Promise<void> {
  if (!fields.length) return;
  await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
    `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
    { mf: fields.map((f) => ({ ...f, ownerId })) },
  );
}

// `identifier` is what makes this an upsert. Without it productSet always
// creates, so a spreadsheet row carrying a Handle would make a SECOND product
// rather than updating the one it names — which is what "Handle updates
// existing products" on the import screen has been promising all along.
const PRODUCT_SET = `
  mutation Set($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
    productSet(input: $input, identifier: $identifier, synchronous: true) {
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
  extraTags: string[] = [],
): Promise<UpsertResult> {
  if (!row.title || !row.title.trim()) {
    return { title: row.title || "(untitled)", ok: false, action: "skip", error: "Missing title" };
  }

  const tags = Array.from(new Set([
    ...(row.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    ...extraTags,
  ]));

  const metafields: ReturnType<typeof metafield>[] = [];
  if (row.brand?.trim()) metafields.push(metafield("custom", "brand", "single_line_text_field", row.brand.trim()));
  if (row.type?.trim()) metafields.push(metafield("custom", "product_type", "single_line_text_field", row.type.trim()));
  if (row.model?.trim()) {
    const models = row.model.split(",").map((m) => m.trim()).filter(Boolean);
    metafields.push(metafield("custom", "product_model", "list.single_line_text_field", JSON.stringify(models)));
  }
  // Channel prices (blank / non-positive = leave to base price).
  const tierCols: { value: string | undefined; key: string }[] = [
    { value: row.wholesale, key: "wholesale_price" },
    { value: row.shopPrice, key: "price_shop" },
    { value: row.ebayPrice, key: "price_ebay" },
    { value: row.amazonPrice, key: "price_amazon" },
  ];
  for (const t of tierCols) {
    const n = Number(t.value);
    if (t.value && String(t.value).trim() && Number.isFinite(n) && n > 0)
      metafields.push(metafield("custom", t.key, "number_decimal", String(n)));
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
    // Metafields are NOT sent here — see writeMetafields for why.
  };
  if (row.shopifyType?.trim()) input.productType = row.shopifyType.trim();
  if (row.descriptionHtml?.trim()) input.descriptionHtml = row.descriptionHtml;
  if (row.handle?.trim()) input.handle = row.handle.trim();
  if (row.image?.trim()) input.files = [{ originalSource: row.image.trim(), contentType: "IMAGE" }];

  // Read the product first when the row names one. This settles two things at
  // once: whether the row is really an update (a handle that matches nothing is
  // a create, whatever the spreadsheet intended), and what the product looked
  // like beforehand so the run can be undone.
  const handle = row.handle?.trim();
  let before: ProductSnapshot | null = null;
  if (handle) {
    try {
      before = await getProductSnapshot(handle, primaryLocationId);
    } catch {
      // A failed read shouldn't block the write; it only costs us the undo.
      before = null;
    }
  }
  const isUpdate = Boolean(before);

  let data;
  try {
    data = await adminGraphQL<{
      productSet: {
        product: { id: string; handle: string; variants: { edges: { node: { id: string; inventoryItem: { id: string } } }[] } } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(PRODUCT_SET, { input, identifier: handle ? { handle } : undefined });
  } catch (e) {
    return { title: row.title, ok: false, action: "error", error: e instanceof Error ? e.message : "Request failed" };
  }

  const errs = data.productSet.userErrors;
  if (errs.length) {
    return { title: row.title, ok: false, action: "error", error: errs.map((e) => e.message).join("; ") };
  }

  const product = data.productSet.product;
  const base: UpsertResult = {
    title: row.title,
    ok: true,
    action: isUpdate ? "updated" : "created",
    productId: product?.id,
    handle: product?.handle,
    before,
  };

  if (product?.id && metafields.length) {
    try {
      await writeMetafields(product.id, metafields);
    } catch {
      return { ...base, action: `${base.action} (metafields failed)` };
    }
  }

  // Set stock at the primary location.
  const stock = Number(row.stock);
  const invItemId = product?.variants.edges[0]?.node.inventoryItem?.id;
  if (!Number.isNaN(stock) && row.stock !== "" && row.stock !== undefined && invItemId && primaryLocationId) {
    try {
      await setAvailable(invItemId, primaryLocationId, Math.max(0, Math.round(stock)));
    } catch {
      return { ...base, action: `${base.action} (stock failed)` };
    }
  }

  return base;
}

// ---- Putting a product back the way it was ----------------------------------

/** Restore a product to a snapshot taken before an import touched it. */
export async function restoreProduct(snap: ProductSnapshot, primaryLocationId: string): Promise<void> {
  const variant: Record<string, unknown> = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
    price: snap.price,
    // compareAtPrice must be sent as null to clear it, not omitted.
    compareAtPrice: snap.compareAtPrice,
    sku: snap.sku,
    barcode: snap.barcode,
    inventoryItem: { tracked: true },
  };
  if (snap.variantId) variant.id = snap.variantId;

  const res = await adminGraphQL<{
    productSet: { product: { id: string } | null; userErrors: { field: string[]; message: string }[] };
  }>(PRODUCT_SET, {
    input: {
      title: snap.title,
      handle: snap.handle,
      vendor: snap.vendor,
      productType: snap.productType,
      descriptionHtml: snap.descriptionHtml,
      status: snap.status,
      tags: snap.tags,
      productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
      variants: [variant],
    },
    identifier: { id: snap.id },
  });
  if (res.productSet.userErrors.length) {
    throw new ShopifyError(res.productSet.userErrors.map((e) => e.message).join("; "));
  }

  // Metafields: put back what was there, and remove any the import added that
  // weren't. metafieldsSet can't delete, so the two halves are done separately.
  if (snap.metafields.length) await writeMetafields(snap.id, snap.metafields);
  const current = await getProductSnapshot(snap.handle, primaryLocationId).catch(() => null);
  const had = new Set(snap.metafields.map((m) => `${m.namespace}.${m.key}`));
  const added = (current?.metafields ?? []).filter((m) => !had.has(`${m.namespace}.${m.key}`));
  if (added.length) {
    await adminGraphQL<{ metafieldsDelete: { userErrors: { message: string }[] } }>(
      `mutation Del($mf: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $mf) { userErrors { field message } }
      }`,
      { mf: added.map((m) => ({ ownerId: snap.id, namespace: m.namespace, key: m.key })) },
    ).catch(() => { /* a leftover metafield is not worth failing the restore */ });
  }

  if (snap.stock !== null && snap.inventoryItemId && primaryLocationId) {
    await setAvailable(snap.inventoryItemId, primaryLocationId, snap.stock);
  }
}

/** Delete one product. Used to undo the rows an import created. */
export async function deleteProduct(id: string): Promise<void> {
  const d = await adminGraphQL<{
    productDelete: { deletedProductId: string | null; userErrors: { message: string }[] };
  }>(
    `mutation($id: ID!) { productDelete(input: { id: $id }) { deletedProductId userErrors { field message } } }`,
    { id },
  );
  if (d.productDelete.userErrors.length) {
    throw new ShopifyError(d.productDelete.userErrors.map((e) => e.message).join("; "));
  }
}

// Rows are written a few at a time rather than strictly one after another.
//
// Each row costs four Shopify round trips (read, write, metafields, stock), so
// one-at-a-time made a 900-row sheet a genuinely long wait. This was sequential
// to stay under the rate limit, which adminGraphQL now handles properly: it
// backs off and retries on THROTTLED instead of failing. A small pool is the
// difference between minutes and a quarter of them, and a burst that does get
// throttled costs a short wait rather than a broken import.
const IMPORT_CONCURRENCY = 4;

export async function importRows(rows: ImportRow[], extraTags: string[] = []): Promise<UpsertResult[]> {
  const locations = await getLocations();
  const primary = locations[0]?.id ?? "";
  if (!primary) throw new ShopifyError("No active location found.");

  // Rows naming the same handle must keep their order: they are edits to ONE
  // product, and run in parallel the later row's snapshot could be taken after
  // the earlier row's write — recording a "before" state that never existed,
  // and quietly making undo restore the wrong thing. So each handle becomes a
  // lane processed in sheet order, and only separate lanes overlap. Rows with
  // no handle create their own product, so each is a lane of its own.
  const lanes: number[][] = [];
  const laneOf = new Map<string, number>();
  rows.forEach((row, i) => {
    const handle = row.handle?.trim().toLowerCase();
    if (!handle) {
      lanes.push([i]);
      return;
    }
    const existing = laneOf.get(handle);
    if (existing === undefined) {
      laneOf.set(handle, lanes.length);
      lanes.push([i]);
    } else {
      lanes[existing].push(i);
    }
  });

  const results = new Array<UpsertResult>(rows.length);
  await mapLimit(lanes, IMPORT_CONCURRENCY, async (lane) => {
    for (const i of lane) {
      results[i] = await upsertProduct(rows[i], primary, extraTags);
    }
  });
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
  parent: string | null; // parent collection GID (portal.parent metafield) or null = top-level
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
            parent: { value: string } | null;
          };
        }[];
      };
    } = await adminGraphQL(
      `query($after: String) {
        collections(first: 100, after: $after, sortKey: TITLE) {
          pageInfo { hasNextPage endCursor }
          edges { node { id title handle productsCount { count } ruleSet { rules { column } } image { url } parent: metafield(namespace: "portal", key: "parent") { value } } }
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
        parent: e.node.parent?.value || null,
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
