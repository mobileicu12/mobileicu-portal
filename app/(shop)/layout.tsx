import Link from "next/link";
import { CartProvider } from "@/components/shop/cart";
import ShopHeader from "@/components/shop/ShopHeader";
import { getStorefrontCollections, STORE_DOMAIN } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  let nav: { handle: string; title: string; children: { handle: string; title: string }[] }[] = [];
  try {
    const cols = await getStorefrontCollections();
    const top = cols.filter((c) => !c.parent || !cols.some((x) => x.id === c.parent));
    nav = top.map((c) => ({
      handle: c.handle,
      title: c.title,
      children: cols.filter((s) => s.parent === c.id).map((s) => ({ handle: s.handle, title: s.title })),
    }));
  } catch { /* storefront still renders without nav */ }

  const loginUrl = `https://${STORE_DOMAIN}/account/login`;
  const year = new Date().getFullYear();

  return (
    <CartProvider domain={STORE_DOMAIN}>
      <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
        <ShopHeader nav={nav} loginUrl={loginUrl} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <p className="text-lg font-extrabold tracking-tight">MOBILE<span className="text-amber-500"> ICU</span></p>
              <p className="mt-2 text-sm text-neutral-500">Phone &amp; laptop accessories and repair parts at genuine wholesale prices. Trade accounts welcome.</p>
            </div>
            <div className="flex gap-12 text-sm">
              <div>
                <p className="font-semibold text-neutral-900">Shop</p>
                <Link href="/shop" className="mt-2 block text-neutral-500 hover:text-amber-600">Home</Link>
                <Link href="/shop/collections" className="mt-1 block text-neutral-500 hover:text-amber-600">All collections</Link>
                <Link href="/shop/search" className="mt-1 block text-neutral-500 hover:text-amber-600">Search</Link>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Account</p>
                <a href={loginUrl} className="mt-2 block text-neutral-500 hover:text-amber-600">Trade login</a>
                <a href={`https://${STORE_DOMAIN}/account/register`} className="mt-1 block text-neutral-500 hover:text-amber-600">Register</a>
              </div>
            </div>
          </div>
          <div className="border-t border-neutral-200">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-neutral-400 sm:flex-row sm:justify-between sm:px-6">
              <span>© {year} MOBILE ICU. All rights reserved.</span>
              <span>Wholesale phone &amp; laptop accessories</span>
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
