"use client";
import { useEffect, useState } from "react";
import { referenceUrl } from "@/lib/constants";

/** Catalogue (original) product image for a SKU, hot-linked from the public site. */
export function RefImage({ sku, className = "", lazy = true }: { sku: string; className?: string; lazy?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [sku]);
  if (failed) {
    return <div className={`flex items-center justify-center bg-stone-100 p-1 text-center text-xs text-stone-400 ${className}`}>no image</div>;
  }
  return (
    <>
      {!loaded && <div className={`skeleton ${className}`} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={referenceUrl(sku)} alt={sku} loading={lazy ? "lazy" : "eager"} referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        className={loaded ? `anim-fade bg-stone-100 object-contain ${className}` : "hidden"} />
    </>
  );
}
