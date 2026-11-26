"use client";
import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { btnGhost } from "@/components/ui";
import { RefImage } from "@/components/RefImage";
import { DESIGN_AXES, driverLabel, formatPct, inr, type IntelItem } from "./types";

export function IntelThumb({ sku, imageUrl, className = "h-12 w-12" }: { sku: string; imageUrl?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [imageUrl, sku]);

  if (imageUrl && !failed) {
    return (
      <div className={`relative overflow-hidden rounded-lg border border-black/[0.08] bg-stone-100 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={sku} loading="lazy" referrerPolicy="no-referrer"
          onError={() => setFailed(true)} className="h-full w-full object-contain" />
      </div>
    );
  }
  return <RefImage sku={sku} className={`rounded-lg border border-black/[0.08] bg-stone-100 ${className}`} />;
}

export function StockLabelBadge({ status }: { status?: string | null }) {
  const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";
  switch (status) {
    case "in_stock_online":
      return <span className={`${pill} bg-apple-green/15 text-ink-green`}>In stock</span>;
    case "in_stock_store_only":
      return <span className={`${pill} bg-apple-orange/15 text-ink-orange`}>Store only</span>;
    case "out_of_stock":
      return <span className={`${pill} bg-apple-red/15 text-ink-red`}>Out of stock</span>;
    case "not_found":
      return <span className={`${pill} bg-black/[0.06] text-stone-500`}>Not found</span>;
    default:
      return <span className={`${pill} bg-black/[0.045] text-stone-400`}>Unscraped</span>;
  }
}

export function ProbPill({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-stone-400">—</span>;
  const n = Number(value);
  const cls = n >= 0.7 ? "bg-apple-green/15 text-ink-green"
    : n >= 0.4 ? "bg-apple-orange/15 text-ink-orange"
    : "bg-black/[0.06] text-stone-600";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}>{formatPct(n)}</span>;
}

export function TierBadge({ tier }: { tier?: string | null }) {
  if (!tier) return <span className="text-stone-400">—</span>;
  const cls = tier === "Proven Winner" ? "bg-apple-green/15 text-ink-green"
    : tier === "Hidden Gem" ? "bg-apple-purple/15 text-ink-purple"
    : tier === "Watchlist" ? "bg-apple-blue/15 text-ink-blue"
    : "bg-black/[0.06] text-stone-500";
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{tier}</span>;
}

export function IntelDrawer({ item, onClose }: { item: IntelItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const drivers = (item.top_drivers ?? []).map(driverLabel).filter(Boolean);
  const snapshotEntries = Object.entries(item.feature_snapshot ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const axes = [...new Set([...DESIGN_AXES, ...Object.keys(item.effectiveTags)])];

  return (
    <div className="scrim anim-fade fixed inset-0 z-[70] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.sku_code}>
      <aside className="sheet flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-black/[0.08]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{item.sku_code}</h2>
              <TierBadge tier={item.tier} />
            </div>
            <p className="mt-0.5 truncate text-sm text-stone-500">{item.master?.title || item.master?.category || "Jewellery SKU"}</p>
          </div>
          <button type="button" onClick={onClose} className={`${btnGhost} p-2`} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
          <div className="flex gap-4">
            <IntelThumb sku={item.sku_code} imageUrl={item.master?.image_url} className="h-36 w-36 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-xs text-stone-400">Category / Collection</p>
                <p className="font-medium text-stone-900">
                  {item.master?.category || "—"}{item.master?.collection ? ` · ${item.master.collection}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold tabular-nums text-stone-900">
                  {item.effectivePrice != null ? inr.format(item.effectivePrice) : "—"}
                </span>
                {item.priceIsFallback && item.effectivePrice != null && (
                  <span className="text-xs text-stone-400">(avg catalog price)</span>
                )}
                <StockLabelBadge status={item.market?.stock_status} />
              </div>
              {item.market?.product_url && (
                <a href={item.market.product_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-maroon-700 hover:underline">
                  Open product page <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-black/[0.06] bg-stone-50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-stone-400">Perf Prob</p>
              <div className="mt-1"><ProbPill value={item.perf_sell_prob} /></div>
            </div>
            <div className="rounded-xl border border-black/[0.06] bg-stone-50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-stone-400">OMS Prob</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{formatPct(item.oms_sell_prob)}</p>
            </div>
            <div className="rounded-xl border border-black/[0.06] bg-stone-50 p-3">
              <p className="text-[0.6875rem] uppercase tracking-wide text-stone-400">Breakout</p>
              <p className="mt-1 text-base font-semibold tabular-nums">{item.breakout_score != null ? Number(item.breakout_score).toFixed(1) : "—"}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Top Drivers</h3>
            {drivers.length ? (
              <div className="flex flex-wrap gap-1.5">
                {drivers.map((d, i) => (
                  <span key={i} className="rounded-full border border-black/[0.08] bg-stone-50 px-2.5 py-1 text-xs text-stone-700">{d}</span>
                ))}
              </div>
            ) : <p className="text-xs text-stone-400">No drivers recorded.</p>}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Design &amp; Aesthetic Tags</h3>
            <div className="space-y-2 rounded-xl border border-black/[0.06] bg-stone-50 p-3">
              {axes.map((axis) => {
                const tags = item.effectiveTags[axis] ?? [];
                return (
                  <div key={axis} className="flex items-start gap-2 text-xs">
                    <span className="w-24 shrink-0 capitalize text-stone-500">{axis.replace("_", " ")}</span>
                    <div className="flex flex-wrap gap-1">
                      {tags.length ? tags.map((t) => (
                        <span key={t} className="rounded-full bg-white px-2 py-0.5 font-medium text-stone-800 ring-1 ring-black/[0.08]">{t}</span>
                      )) : <span className="text-stone-400">—</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Feature Snapshot</h3>
            {snapshotEntries.length ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/[0.06] bg-stone-50 p-3 text-xs">
                {snapshotEntries.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 border-b border-black/[0.04] pb-1">
                    <span className="truncate text-stone-500">{k.replace(/_/g, " ")}</span>
                    <span className="font-medium tabular-nums text-stone-900">
                      {typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(3)) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-stone-400">No snapshot metrics available.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

