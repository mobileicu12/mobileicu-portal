// Barcode assignment + scan lookup (server).
// Products store their code in Shopify's variant.barcode field. Parts without a
// manufacturer barcode get an internal Code128 value (their SKU, or a generated
// MI-code). Scanning looks a variant up by exact barcode OR SKU.
import { adminGraphQL } from "./shopify";
import type { VariantHit } from "./billing";
import type { TierPrices } from "./pricing";

function genCode(): string {
  return "MI" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

export type AssignResult = { ok: number; failed: number; skipped: number; assigned: { id: string; barcode: string }[] };

// Fill the barcode field for products that don't have one (from SKU, else a
// generated internal code). overwrite:true regenerates even if one exists.
export async function assignBarcodes(productIds: string[], opts: { overwrite?: boolean } = {}): Promise<AssignResult> {
  let ok = 0, failed = 0, skipped = 0;
  const assigned: { id: string; barcode: string }[] = [];
  for (const pid of productIds) {
    try {
      const d = await adminGraphQL<{ product: { variants: { edges: { node: { id: string; sku: string | null; barcode: string | null } }[] } } | null }>(
        `query($id: ID!) { product(id: $id) { variants(first: 1) { edges { node { id sku barcode } } } } }`,
        { id: pid },
      );
      const v = d.product?.variants.edges[0]?.node;
      if (!v) { failed++; continue; }
      if (v.barcode && v.barcode.trim() && !opts.overwrite) { skipped++; continue; }
      const code = v.sku && v.sku.trim() ? v.sku.trim() : genCode();
      const r = await adminGraphQL<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
        `mutation($pid: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $variants) { userErrors { field message } } }`,
        { pid, variants: [{ id: v.id, barcode: code }] },
      );
      if (r.productVariantsBulkUpdate.userErrors.length) { failed++; continue; }
      ok++;
      assigned.push({ id: pid, barcode: code });
    } catch { failed++; }
  }
  return { ok, failed, skipped, assigned };
}

// Find a single variant by a scanned code (exact barcode or SKU match).
export async function lookupByCode(code: string): Promise<VariantHit | null> {
  const c = code.trim();
  if (!c) return null;
  const esc = c.replace(/["\\]/g, "\\$&");
  const data = await adminGraphQL<{
    products: {
      edges: {
        node: {
          title: string;
          featuredImage: { url: string } | null;
          wholesale: { value: string } | null;
          priceShop: { value: string } | null;
          priceEbay: { value: string } | null;
          priceAmazon: { value: string } | null;
          variants: { edges: { node: { id: string; title: string; sku: string | null; barcode: string | null; price: string; inventoryQuantity: number | null } }[] };
        };
      }[];
    };
  }>(
    `query($q: String!) {
      products(first: 5, query: $q) {
        edges { node {
          title
          featuredImage { url }
          wholesale: metafield(namespace: "custom", key: "wholesale_price") { value }
          priceShop: metafield(namespace: "custom", key: "price_shop") { value }
          priceEbay: metafield(namespace: "custom", key: "price_ebay") { value }
          priceAmazon: metafield(namespace: "custom", key: "price_amazon") { value }
          variants(first: 10) { edges { node { id title sku barcode price inventoryQuantity } } }
        } }
      }
    }`,
    { q: `barcode:${esc} OR sku:${esc}` },
  );

  for (const p of data.products.edges) {
    const tiers: TierPrices = {
      wholesale: p.node.wholesale?.value ?? null,
      shop: p.node.priceShop?.value ?? null,
      ebay: p.node.priceEbay?.value ?? null,
      amazon: p.node.priceAmazon?.value ?? null,
    };
    for (const v of p.node.variants.edges) {
      if (v.node.barcode === c || v.node.sku === c) {
        return {
          variantId: v.node.id,
          productTitle: p.node.title,
          variantTitle: v.node.title === "Default Title" ? "" : v.node.title,
          sku: v.node.sku ?? "",
          price: v.node.price,
          image: p.node.featuredImage?.url ?? null,
          available: v.node.inventoryQuantity ?? 0,
          tiers,
        };
      }
    }
  }
  return null;
}
