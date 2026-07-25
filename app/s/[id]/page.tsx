"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildCustomerDayItemisedDoc } from "@/lib/report-pdf";
import type { Business } from "@/lib/business";

export default function PublicStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sp = useSearchParams();
  const [src, setSrc] = useState("");
  const [dl, setDl] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/statement/${encodeURIComponent(id)}?d=${encodeURIComponent(sp.get("d") || "")}&t=${encodeURIComponent(sp.get("t") || "")}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Couldn't load this statement.");
        const st = d.statement;
        const doc = buildCustomerDayItemisedDoc(st.name, st.bills,
          { todayTotal: st.todayTotal, todayPaid: st.todayPaid, todayOutstanding: st.todayOutstanding, accountOutstanding: st.accountOutstanding },
          { dateLabel: st.dateLabel, business: d.business as Business });
        setSrc(doc.output("datauristring"));
        setDl({ url: URL.createObjectURL(doc.output("blob")), name: `${st.name.replace(/[^\w-]/g, "_")}_${st.dateLabel.replace(/\//g, "-")}.pdf` });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load this statement.");
      } finally { setLoading(false); }
    })();
  }, [id, sp]);

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <span className="text-base font-extrabold tracking-tight text-neutral-900">MOBILE<span className="text-amber-500"> ICU</span></span>
        {dl && <a href={dl.url} download={dl.name} className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">⬇ Download PDF</a>}
      </header>
      <div className="flex flex-1 items-stretch justify-center p-3">
        {loading && <p className="mt-16 text-sm text-neutral-500">Loading statement…</p>}
        {error && <div className="mt-16 text-center"><p className="text-lg font-semibold text-neutral-900">Can&apos;t open this statement</p><p className="mt-1 text-sm text-neutral-500">{error}</p></div>}
        {!loading && !error && src && <iframe title="Statement" src={src} className="h-[80vh] w-full max-w-3xl rounded-lg border border-neutral-300 bg-white shadow" />}
      </div>
      {dl && !error && <div className="border-t border-neutral-200 bg-white p-3 text-center sm:hidden"><a href={dl.url} download={dl.name} className="inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white">⬇ Download / open PDF</a></div>}
    </div>
  );
}
