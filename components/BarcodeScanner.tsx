"use client";

import { useEffect, useRef, useState } from "react";

// Camera barcode scanner modal (mobile-friendly). Calls onDetected(code) for each
// scan; the parent decides whether to keep scanning or close.
export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(onDetected);
  useEffect(() => { detectedRef.current = onDetected; }, [onDetected]);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const last = { code: "", t: 0 };
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          if (!result) return;
          const code = result.getText();
          const now = Date.now();
          if (code === last.code && now - last.t < 1500) return; // debounce duplicate reads
          last.code = code; last.t = now;
          detectedRef.current(code);
        });
        if (cancelled) controls.stop();
        else { controlsRef.current = controls; setReady(true); }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Camera unavailable. Check permissions or use a USB scanner.");
      }
    })();
    return () => { cancelled = true; controlsRef.current?.stop(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-neutral-900">Scan barcode</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-800">✕</button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-amber-400/80 shadow-[0_0_12px] shadow-amber-400" />
          {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera…</p>}
        </div>
        {error ? (
          <p className="px-4 py-3 text-xs text-red-600">{error}</p>
        ) : (
          <p className="px-4 py-3 text-xs text-neutral-500">Point the camera at a barcode. Items add automatically.</p>
        )}
      </div>
    </div>
  );
}
