import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { STORE_DOMAIN } from "@/lib/storefront";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const s = await getSettings().catch(() => null);
  const email = s?.email || "mobileicu12@gmail.com";
  const phone = s?.phone || "";
  const address = (s?.address || "United Kingdom").split("\n").filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900">Contact us</h1>
      <p className="mt-2 text-neutral-500">Questions about products, trade accounts or an order? We&apos;re here to help.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <a href={`mailto:${email}`} className="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-amber-400 hover:shadow-lg">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Email</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 group-hover:text-amber-600">{email}</p>
          <p className="mt-1 text-sm text-neutral-500">We reply within one business day.</p>
        </a>
        {phone && (
          <a href={`tel:${phone.replace(/\s+/g, "")}`} className="group rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-amber-400 hover:shadow-lg">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Phone</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 group-hover:text-amber-600">{phone}</p>
            <p className="mt-1 text-sm text-neutral-500">Mon–Fri, business hours.</p>
          </a>
        )}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Address</p>
          <p className="mt-1 text-neutral-700">{address.join(", ")}</p>
        </div>
      </div>

      <div className="mt-10 rounded-2xl bg-neutral-900 p-8 text-center text-white">
        <h2 className="text-xl font-bold">Want trade pricing?</h2>
        <p className="mt-1 text-sm text-neutral-300">Open a wholesale account to unlock trade prices and ordering.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/shop/register" className="rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-amber-400">Register</Link>
          <a href={`https://${STORE_DOMAIN}/account/login`} className="rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Trade login</a>
        </div>
      </div>
    </div>
  );
}
