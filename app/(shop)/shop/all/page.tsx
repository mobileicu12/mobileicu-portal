import CategorySidebar from "@/components/shop/CategorySidebar";
import CollectionBrowser from "@/components/shop/CollectionBrowser";
import { getAllProducts, getStorefrontCollections } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function AllProductsPage() {
  const [products, allCols] = await Promise.all([
    getAllProducts(250).catch(() => []),
    getStorefrontCollections().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">Shop all</h1>
      <p className="mt-1 text-neutral-500">Browse the full range — filter by brand, part or model.</p>

      <div className="mt-8 flex gap-8">
        <CategorySidebar collections={allCols} active="" />
        <div className="min-w-0 flex-1">
          <CollectionBrowser products={products} />
        </div>
      </div>
    </div>
  );
}
