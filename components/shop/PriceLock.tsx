// Prompts shown to non-registered visitors in place of prices / buy buttons.
// Plain components (no client hooks) so they work in both server and client trees.
import Link from "next/link";

export function PriceLockInline({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/shop/trade-login"
      className={`inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 transition hover:bg-neutral-200 ${className}`}
    >
      🔒 Log in to see price
    </Link>
  );
}

// Full-width "log in to buy" button for product cards.
export function PriceLockButton() {
  return (
    <Link
      href="/shop/trade-login"
      className="flex w-full items-center justify-center gap-1.5 rounded-full border border-neutral-300 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
    >
      🔒 Log in to buy
    </Link>
  );
}

// Panel used on the product page in place of the add-to-cart controls.
export function PriceLockPanel() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
      <p className="text-base font-semibold text-neutral-900">🔒 Trade account required</p>
      <p className="mt-1 text-sm text-neutral-500">
        Prices and ordering are for registered trade customers only. Log in to see wholesale prices and buy, or register for an account.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/shop/trade-login" className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Log in</Link>
        <Link href="/shop/register" className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900">Register</Link>
      </div>
    </div>
  );
}
