import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/shop/ProductCard";
import { getStorefrontCollection } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const c = await getStorefrontCollection(handle).catch(() => null);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-neutral-400">
        <Link href="/shop" className="hover:text-amber-600">Home</Link> <span className="mx-1">/</span>
        <Link href="/shop/collections" className="hover:text-amber-600">Collections</Link> <span className="mx-1">/</span>
        <span className="text-neutral-600">{c.title}</span>
      </nav>

      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-neutral-900">{c.title}</h1>
      {c.descriptionHtml && (
        <div className="prose prose-sm mt-2 max-w-2xl text-neutral-500 [&_a]:text-amber-600" dangerouslySetInnerHTML={{ __html: c.descriptionHtml }} />
      )}

      {c.subCollections.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {c.subCollections.map((s) => (
            <Link key={s.id} href={`/shop/c/${s.handle}`} className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-amber-500 hover:text-amber-600">
              {s.title} <span className="text-neutral-400">({s.count})</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {c.products.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
      {c.products.length === 0 && <p className="mt-8 text-neutral-400">No products in this collection yet.</p>}
    </div>
  );
}
