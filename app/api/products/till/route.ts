import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/guard";
import { adminGraphQL, getLocations, shopifyConfigured, ShopifyError } from "@/lib/shopify";
import { TILL_TAG } from "@/lib/channels";

export const runtime = "nodejs";

// Quick-create an in-shop till product (tagged for POS-only search) and return it
// ready to add to the current bill. Not stock-tracked — it's a quick till item.
export async function POST(req: Request) {
  const denied = await requireAnyPermission(["billing", "inventory"]);
  if (denied) return denied;
  if (!shopifyConfigured()) return NextResponse.json({ error: "Shopify not configured." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { title?: string; price?: number | string; sku?: string } | null;
  const title = body?.title?.trim();
  const price = Number(body?.price);
  if (!title) return NextResponse.json({ error: "Enter an item name." }, { status: 400 });
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });

  try {
    const variant: Record<string, unknown> = {
      optionValues: [{ optionName: "Title", name: "Default Title" }],
      price: String(price),
      inventoryItem: { tracked: false },
    };
    if (body?.sku?.trim()) variant.sku = body.sku.trim();

    const d = await adminGraphQL<{
      productSet: {
        product: { id: string; variants: { edges: { node: { id: string; sku: string | null; price: string } }[] } } | null;
        userErrors: { field: string[]; message: string }[];
      };
    }>(
      `mutation Set($input: ProductSetInput!) {
        productSet(input: $input, synchronous: true) {
          product { id variants(first: 1) { edges { node { id sku price } } } }
          userErrors { field message }
        }
      }`,
      {
        input: {
          title,
          status: "ACTIVE",
          vendor: "Mobile ICU",
          tags: [TILL_TAG],
          productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
          variants: [variant],
        },
      },
    );
    const errs = d.productSet.userErrors;
    if (errs.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
    const v = d.productSet.product?.variants.edges[0]?.node;
    if (!v) throw new ShopifyError("Could not create the till item.");

    // Ensure a location exists (product is untracked, so no stock to set).
    await getLocations().catch(() => []);

    return NextResponse.json({
      hit: { variantId: v.id, productTitle: title, variantTitle: "", sku: v.sku ?? "", price: v.price, image: null, available: 0, tiers: {} },
    });
  } catch (e) {
    const msg = e instanceof ShopifyError ? e.message : "Failed to create till item.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
