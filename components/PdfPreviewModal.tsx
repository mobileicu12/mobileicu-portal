"use client";

import { useEffect, useRef, useState } from "react";
import type { jsPDF } from "jspdf";

// Generic PDF preview with Download / Print / Share (Web Share where supported).
export default function PdfPreviewModal({
  doc,
  filename,
  title,
  subtitle,
  onClose,
}: {
  doc: jsPDF;
  filename: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [msg, setMsg] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const b = doc.output("blob");
    setBlob(b);
    const u = URL.createObjectURL(b);
    setUrl(u);
    try {
      const file = new File([b], filename, { type: "application/pdf" });
      setCanShare(typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] }));
    } catch {
      setCanShare(false);
    }
    return () => URL.revokeObjectURL(u);
  }, [doc, filename]);

  function download() {
    doc.save(filename);
  }

  function print() {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  }

  async function share() {
    if (!blob) return;
    setMsg("");
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      await navigator.share({ files: [file], title });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg("Sharing isn't available — download instead.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
            {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={print} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900">🖨 Print</button>
            {canShare && <button onClick={share} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900">↗ Share</button>}
            <button onClick={download} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-500 hover:text-neutral-900">⬇ Download</button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-900">Close</button>
          </div>
        </div>
        {msg && <p className="bg-amber-50 px-5 py-2 text-sm text-amber-700">{msg}</p>}
        <div className="flex-1 bg-neutral-100">
          {url ? <iframe ref={iframeRef} src={url} title={title} className="h-full w-full" /> : <div className="flex h-full items-center justify-center text-sm text-neutral-400">Rendering…</div>}
        </div>
      </div>
    </div>
  );
}
