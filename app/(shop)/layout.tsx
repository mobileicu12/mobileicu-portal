import Link from "next/link";
import { CartProvider } from "@/components/shop/cart";
import ShopHeader from "@/components/shop/ShopHeader";
import TradeBar from "@/components/shop/TradeBar";
import { STORE_DOMAIN } from "@/lib/storefront";
import { getTradeCustomerId } from "@/lib/trade";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const loginUrl = "/shop/trade-login";
  const year = new Date().getFullYear();
  const trade = !!(await getTradeCustomerId());

  return (
    <CartProvider domain={STORE_DOMAIN} trade={trade}>
      <div className="flex min-h-dvh flex-col bg-white text-neutral-900">
        {trade && <TradeBar />}
        <ShopHeader loginUrl={loginUrl} />
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
                <Link href="/shop/all" className="mt-2 block text-neutral-500 hover:text-amber-600">All products</Link>
                <Link href="/shop/collections" className="mt-1 block text-neutral-500 hover:text-amber-600">Collections</Link>
                <Link href="/shop/search" className="mt-1 block text-neutral-500 hover:text-amber-600">Search</Link>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Company</p>
                <Link href="/shop/about" className="mt-2 block text-neutral-500 hover:text-amber-600">About us</Link>
                <Link href="/shop/contact" className="mt-1 block text-neutral-500 hover:text-amber-600">Contact</Link>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Account</p>
                <a href={loginUrl} className="mt-2 block text-neutral-500 hover:text-amber-600">Trade login</a>
                <Link href="/shop/register" className="mt-1 block text-neutral-500 hover:text-amber-600">Register</Link>
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
