// Full product editing: load all fields, update everything, manage images.
import { adminGraphQL, getLocations, setAvailable, ShopifyError } from "./shopify";

export const PRODUCT_TYPE_CHOICES = [
  "LCD", "Batteries", "Cables", "Chargers", "Car Chargers", "Adptors",
  "Holders", "Cases", "Screen Protectors", "Audio", "Power Banks", "Parts",
];

export type EditProduct = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  status: string;
  vendor: string;
  productType: string;
  tags: string[];
  brand: string;
  type: string;
  model: string;
  images: { id: string; url: string }[];
  variantId: string;
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  inventoryItemId: string | null;
  available: number;
  collections: { id: string; title: string }[];
};

export async function getProductForEdit(id: string): Promise<EditProduct> {
  const d = await adminGraphQL<{
    product: {
      id: string; title: string; handle: string; descriptionHtml: string; status: string;
      vendor: string; productType: string; tags: string[];
      brand: { value: string } | null; ptype: { value: string } | null; model: { value: string } | null;
      media: { edges: { node: { id: string; image: { url: string } | null } }[] };
      variants: { edges: { node: { id: string; sku: string | null; barcode: string | null; price: string; compareAtPrice: string | null; inventoryQuantity: number | null; inventoryItem: { id: string } | null } }[] };
      collections: { edges: { node: { id: string; title: string } }[] };
    } | null;
  }>(
    `query($id: ID!) {
      product(id: $id) {
        id title handle descriptionHtml status vendor productType tags
        brand: metafield(namespace: "custom", key: "brand") { value }
        ptype: metafield(namespace: "custom", key: "product_type") { value }
        model: metafield(namespace: "custom", key: "product_model") { value }
        media(first: 20) { edges { node { ... on MediaImage { id image { url } } } } }
        variants(first: 1) { edges { node { id sku barcode price compareAtPrice inventoryQuantity inventoryItem { id } } } }
        collections(first: 25) { edges { node { id title } } }
      }
    }`,
    { id },
  );
  const p = d.product;
  if (!p) throw new ShopifyError("Product not found.");
  const v = p.variants.edges[0]?.node;
  let model = "";
  if (p.model?.value) {
    try { const arr = JSON.parse(p.model.value); model = Array.isArray(arr) ? arr.join(", ") : p.model.value; }
    catch { model = p.model.value; }
  }
  return {
    id: p.id, title: p.title, handle: p.handle, descriptionHtml: p.descriptionHtml ?? "",
    status: p.status, vendor: p.vendor ?? "", productType: p.productType ?? "", tags: p.tags ?? [],
    brand: p.brand?.value ?? "", type: p.ptype?.value ?? "", model,
    images: p.media.edges.filter((e) => e.node.image).map((e) => ({ id: e.node.id, url: e.node.image!.url })),
    variantId: v?.id ?? "", sku: v?.sku ?? "", barcode: v?.barcode ?? "", price: v?.price ?? "",
    compareAt: v?.compareAtPrice ?? "", inventoryItemId: v?.inventoryItem?.id ?? null,
    available: v?.inventoryQuantity ?? 0,
    collections: p.collections.edges.map((e) => e.node),
  };
}

export type ProductEditInput = {
  title?: string; descriptionHtml?: string; status?: string; vendor?: string; productType?: string;
  tags?: string; brand?: string; type?: string; model?: string;
  variantId?: string; price?: string; compareAt?: string; sku?: string; barcode?: string; stock?: string;
};

export async function updateFullProduct(id: string, f: ProductEditInput): Promise<void> {
  // 1) core product fields
  const input: Record<string, unknown> = { id };
  if (f.title !== undefined) input.title = f.title;
  if (f.descriptionHtml !== undefined) input.descriptionHtml = f.descriptionHtml;
  if (f.status !== undefined) input.status = f.status.toUpperCase();
  if (f.vendor !== undefined) input.vendor = f.vendor;
  if (f.productType !== undefined) input.productType = f.productType;
  if (f.tags !== undefined) input.tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);

  const up = await adminGraphQL<{ productUpdate: { userErrors: { message: string }[] } }>(
    `mutation($input: ProductInput!) { productUpdate(input: $input) { userErrors { field message } } }`,
    { input },
  );
  if (up.productUpdate.userErrors.length) throw new ShopifyError(up.productUpdate.userErrors.map((e) => e.message).join("; "));

  // 2) metafields (brand / type / model)
  const mfs: { ownerId: string; namespace: string; key: string; type: string; value: string }[] = [];
  if (f.brand !== undefined) mfs.push({ ownerId: id, namespace: "custom", key: "brand", type: "single_line_text_field", value: f.brand });
  if (f.type !== undefined && f.type) mfs.push({ ownerId: id, namespace: "custom", key: "product_type", type: "single_line_text_field", value: f.type });
  if (f.model !== undefined) {
    const models = f.model.split(",").map((m) => m.trim()).filter(Boolean);
    mfs.push({ ownerId: id, namespace: "custom", key: "product_model", type: "list.single_line_text_field", value: JSON.stringify(models) });
  }
  if (mfs.length) {
    const mr = await adminGraphQL<{ metafieldsSet: { userErrors: { message: string }[] } }>(
      `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
      { m: mfs },
    );
    if (mr.metafieldsSet.userErrors.length) throw new ShopifyError(mr.metafieldsSet.userErrors.map((e) => e.message).join("; "));
  }

  // 3) variant price / compareAt / sku / barcode
  if (f.variantId && (f.price !== undefined || f.compareAt !== undefined || f.sku !== undefined || f.barcode !== undefined)) {
    const variant: Record<string, unknown> = { id: f.variantId };
    if (f.price !== undefined) variant.price = String(f.price);
    if (f.compareAt !== undefined) variant.compareAtPrice = f.compareAt ? String(f.compareAt) : null;
    if (f.sku !== undefined || f.barcode !== undefined) {
      variant.inventoryItem = {};
      if (f.sku !== undefined) (variant.inventoryItem as Record<string, unknown>).sku = f.sku;
    }
    if (f.barcode !== undefined) variant.barcode = f.barcode;
    const vr = await adminGraphQL<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
      `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $variants) { userErrors { field message } } }`,
      { pid: id, variants: [variant] },
    );
    if (vr.productVariantsBulkUpdate.userErrors.length) throw new ShopifyError(vr.productVariantsBulkUpdate.userErrors.map((e) => e.message).join("; "));
  }

  // 4) stock
  if (f.stock !== undefined && f.stock !== "") {
    const invItemId = (await getProductForEdit(id)).inventoryItemId;
    const loc = (await getLocations())[0]?.id;
    if (invItemId && loc) await setAvailable(invItemId, loc, Math.max(0, Math.round(Number(f.stock))));
  }
}

export async function addProductImage(id: string, url: string): Promise<void> {
  const d = await adminGraphQL<{ productCreateMedia: { mediaUserErrors: { message: string }[] } }>(
    `mutation($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) { mediaUserErrors { field message } }
    }`,
    { id, media: [{ originalSource: url, mediaContentType: "IMAGE" }] },
  );
  if (d.productCreateMedia.mediaUserErrors.length) throw new ShopifyError(d.productCreateMedia.mediaUserErrors.map((e) => e.message).join("; "));
}

export async function deleteProductImage(id: string, mediaId: string): Promise<void> {
  const d = await adminGraphQL<{ productDeleteMedia: { mediaUserErrors: { message: string }[] } }>(
    `mutation($id: ID!, $ids: [ID!]!) {
      productDeleteMedia(productId: $id, mediaIds: $ids) { mediaUserErrors { field message } }
    }`,
    { id, ids: [mediaId] },
  );
  if (d.productDeleteMedia.mediaUserErrors.length) throw new ShopifyError(d.productDeleteMedia.mediaUserErrors.map((e) => e.message).join("; "));
}
