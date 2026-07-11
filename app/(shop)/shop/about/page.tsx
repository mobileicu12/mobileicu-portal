import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AboutPage() {
  return (
    <div>
      <section className="border-b border-neutral-200 bg-gradient-to-b from-neutral-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Since 2005</span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-neutral-900">About MOBILE ICU</h1>
          <p className="mt-4 text-lg text-neutral-600">A UK wholesaler of phone &amp; laptop accessories and repair parts — trusted by retailers, repair shops and traders for genuine wholesale pricing and fast dispatch.</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="prose prose-neutral max-w-none">
          <p>Since 2005, Mobile ICU has proudly served customers across the UK with an extensive range of innovative accessories for phones, tablets and handheld devices — plus a deep catalogue of quality replacement parts for repairs.</p>
          <p>We supply thousands of lines across cases, cables, chargers, batteries, audio, gadgets and screens/LCDs for hundreds of models. You&apos;ll find our products in shopping centres, train stations, motorway services and retail parks, and we work with well-known agencies and retailers across Europe.</p>
          <p>Our focus is simple: quality stock, honest wholesale prices, and a smooth ordering experience for trade customers.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { t: "20+ years", s: "serving UK trade" },
            { t: "1,000s of lines", s: "accessories & parts" },
            { t: "Fast dispatch", s: "mostly same-day" },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
              <p className="text-2xl font-extrabold text-neutral-900">{x.t}</p>
              <p className="mt-1 text-sm text-neutral-500">{x.s}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/shop/all" className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">Browse the range</Link>
          <Link href="/shop/register" className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900">Open a trade account</Link>
        </div>
      </section>
    </div>
  );
}
