"use client";
import { useEffect, useRef, useState } from "react";
import { referenceUrl } from "@/lib/constants";

/** Catalogue (original) product image for a SKU, hot-linked from the public site. */
export function RefImage({ sku, className = "", lazy = true }: { sku: string; className?: string; lazy?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => { setFailed(false); setLoaded(false); }, [sku]);
  // the server-rendered <img> can finish loading before React attaches onLoad: catch that case here
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [sku, failed]);
  if (failed) {
    return <div className={`flex items-center justify-center bg-stone-100 p-1 text-center text-xs text-stone-400 ${className}`}>no image</div>;
  }
  // The <img> stays on the page (invisible until loaded) so lazy-loading still works; a hidden image never loads.
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={referenceUrl(sku)} alt={sku} loading={lazy ? "lazy" : "eager"} referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}
