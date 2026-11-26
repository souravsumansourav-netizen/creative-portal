"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Search, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { btn, btnGhost, Card, Empty, input, Msg, PageHeader } from "@/components/ui";
import { Checkbox, Segmented, Select, TableSkeleton } from "@/components/controls";
import { IntelDrawer, IntelThumb, ProbPill, StockLabelBadge, TierBadge } from "./IntelDrawer";
import { UploadPanel } from "./UploadPanel";
import {
  DESIGN_AXES,
  driverLabel,
  formatPct,
  inr,
  normalizeTags,
  type IntelItem,
  type MarketRow,
  type MasterAttr,
  type PriceBand,
  type ScoreRow,
  type SortKey,
  type TierTab,
  type UploadBatch,
} from "./types";

const PRICE_BANDS: { key: PriceBand; label: string; min?: number; max?: number }[] = [
  { key: "all", label: "All" },
  { key: "under_25k", label: "<25k", max: 25_000 },
  { key: "25k_50k", label: "25k–50k", min: 25_000, max: 50_000 },
  { key: "50k_100k", label: "50k–1L", min: 50_000, max: 100_000 },
  { key: "over_100k", label: "1L+", min: 100_000 },
];

async function fetchInChunks<T>(table: string, cols: string, codes: string[]): Promise<T[]> {
  if (!codes.length) return [];
  const sb = supabaseBrowser();
  const out: T[] = [];
  for (let i = 0; i < codes.length; i += 200) {
    const chunk = codes.slice(i, i + 200);
    const { data, error } = await sb.from(table).select(cols).in("sku_code", chunk);
    if (error) throw error;
    if (data) out.push(...(data as T[]));
  }
  return out;
}

export default function IntelligencePage() {
  const [viewTab, setViewTab] = useState<"predictions" | "insights">("predictions");
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [items, setItems] = useState<IntelItem[]>([]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  // filters
  const [tierTab, setTierTab] = useState<TierTab>("all");
  const [selCats, setSelCats] = useState<Set<string>>(new Set());
  const [catOpen, setCatOpen] = useState(false);
  const [priceBand, setPriceBand] = useState<PriceBand>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("breakout");

  // selection & drawer
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [activeSku, setActiveSku] = useState<IntelItem | null>(null);
  const [axisFilter, setAxisFilter] = useState<string>("all");
  const catBtnRef = useRef<HTMLDivElement>(null);

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [bRes, sRes] = await Promise.all([
      sb.from("intel_upload_batches").select("*").order("created_at", { ascending: false }).limit(30),
      sb.from("sku_intelligence_scores").select("*").order("breakout_score", { ascending: false }),
    ]);
    if (bRes.error) throw bRes.error;
    if (sRes.error) throw sRes.error;
    setBatches((bRes.data ?? []) as UploadBatch[]);

    const scores = (sRes.data ?? []) as ScoreRow[];
    const codes = [...new Set(scores.map((s) => s.sku_code.trim().toUpperCase()).filter(Boolean))];
    const [masters, markets] = await Promise.all([
      fetchInChunks<MasterAttr>("sku_master_attributes", "sku_code, title, category, collection, design_tags, image_url", codes),
      fetchInChunks<MarketRow>("sku_market_data", "sku_code, price, stock_status, product_url, scrape_status", codes),
    ]);

    const masterMap = new Map(masters.map((m) => [m.sku_code.toUpperCase(), m]));
    const marketMap = new Map(markets.map((m) => [m.sku_code.toUpperCase(), m]));

    const merged: IntelItem[] = scores.map((s) => {
      const code = s.sku_code.toUpperCase();
      const master = masterMap.get(code);
      const market = marketMap.get(code);
      const snapPrice = s.feature_snapshot?.avg_price != null ? Number(s.feature_snapshot.avg_price) : null;
      const livePrice = market?.price != null ? Number(market.price) : null;
      const effectivePrice = livePrice ?? (snapPrice != null && !Number.isNaN(snapPrice) ? snapPrice : null);
      const rawTags = (s.design_tags && Object.keys(s.design_tags).length ? s.design_tags : master?.design_tags) ?? {};
      return {
        ...s,
        master,
        market,
        effectivePrice,
        priceIsFallback: livePrice == null && effectivePrice != null,
        effectiveTags: normalizeTags(rawTags),
      };
    });
    setItems(merged);
  }, ["sku_intelligence_scores", "intel_upload_batches", "sku_market_data"]);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.master?.category).filter((c): c is string => !!c))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = PRICE_BANDS.find((b) => b.key === priceBand);
    const minVal = minPrice.trim() !== "" ? Number(minPrice) : band?.min;
    const maxVal = maxPrice.trim() !== "" ? Number(maxPrice) : band?.max;

    return items
      .filter((it) => {
        if (tierTab === "hidden_gems" && it.tier !== "Hidden Gem") return false;
        if (tierTab === "proven_winners" && it.tier !== "Proven Winner") return false;
        if (tierTab === "restock_alerts") {
          const highProb = (it.perf_sell_prob ?? 0) >= 0.5 || (it.oms_sell_prob ?? 0) >= 0.5 || (it.breakout_score ?? 0) >= 60;
          if (it.market?.stock_status !== "out_of_stock" || !highProb) return false;
        }
        if (tierTab === "in_stock") {
          const st = it.market?.stock_status;
          if (st !== "in_stock_online" && st !== "in_stock_store_only") return false;
        }
        if (selCats.size > 0 && !selCats.has(it.master?.category ?? "")) return false;
        if (minVal != null && !Number.isNaN(minVal) && (it.effectivePrice == null || it.effectivePrice < minVal)) return false;
        if (maxVal != null && !Number.isNaN(maxVal) && (it.effectivePrice == null || it.effectivePrice > maxVal)) return false;
        if (q) {
          const hit = it.sku_code.toLowerCase().includes(q) || (it.master?.title ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "perf") return (b.perf_sell_prob ?? -1) - (a.perf_sell_prob ?? -1);
        if (sortBy === "oms") return (b.oms_sell_prob ?? -1) - (a.oms_sell_prob ?? -1);
        if (sortBy === "price") return (b.effectivePrice ?? -1) - (a.effectivePrice ?? -1);
        return (b.breakout_score ?? -1) - (a.breakout_score ?? -1);
      });
  }, [items, tierTab, selCats, priceBand, minPrice, maxPrice, query, sortBy]);

  const designInsights = useMemo(() => {
    const map = new Map<string, { axis: string; tag: string; count: number; perfSum: number; perfN: number; brkSum: number; brkN: number }>();
    for (const it of items) {
      for (const [axis, tags] of Object.entries(it.effectiveTags)) {
        for (const tag of tags) {
          const key = `${axis}::${tag}`;
          const row = map.get(key) ?? { axis, tag, count: 0, perfSum: 0, perfN: 0, brkSum: 0, brkN: 0 };
          row.count += 1;
          if (it.perf_sell_prob != null) { row.perfSum += Number(it.perf_sell_prob); row.perfN += 1; }
          if (it.breakout_score != null) { row.brkSum += Number(it.breakout_score); row.brkN += 1; }
          map.set(key, row);
        }
      }
    }
    return [...map.values()]
      .filter((r) => axisFilter === "all" || r.axis === axisFilter)
      .sort((a, b) => b.count - a.count || (b.brkN ? b.brkSum / b.brkN : 0) - (a.brkN ? a.brkSum / a.brkN : 0));
  }, [items, axisFilter]);

  const allAxes = useMemo(() => {
    const s = new Set<string>(DESIGN_AXES);
    for (const it of items) for (const ax of Object.keys(it.effectiveTags)) s.add(ax);
    return [...s];
  }, [items]);

  const toggle = (code: string) => setSel((prev) => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });

  async function assignToTriage() {
    const codes = [...sel];
    if (!codes.length) return;
    setAssigning(true);
    setMsg({});
    try {
      let inserted = 0;
      let skipped = 0;
      try {
        const res = await rpc<{ inserted: number; skipped: number }>("assign_intel_to_triage", { p_codes: codes });
        inserted = res.inserted ?? 0;
        skipped = res.skipped ?? 0;
      } catch (e) {
        const em = (e as Error).message;
        if (!em.includes("assign_intel_to_triage") && !em.includes("PGRST202")) throw e;
        // Fallback if migration 0019 has not been applied yet: skip untriaged duplicates and call ingest_skus
        const { data: existingRows, error: exErr } = await supabaseBrowser()
          .from("skus")
          .select("sku_code")
          .eq("triaged", false)
          .in("sku_code", codes);
        if (exErr) throw exErr;
        const existingSet = new Set((existingRows ?? []).map((r: any) => String(r.sku_code).toUpperCase()));
        const toInsert = codes.filter((c) => !existingSet.has(c.toUpperCase()));
        skipped = codes.length - toInsert.length;
        if (toInsert.length > 0) {
          const r = await rpc<{ sku_count: number }>("ingest_skus", { p_codes: toInsert, p_label: "Intelligence Discovery" });
          inserted = r.sku_count ?? toInsert.length;
        }
      }
      setMsg({
        ok: `Assigned ${inserted} SKU${inserted === 1 ? "" : "s"} to Triage${skipped ? ` (${skipped} already existed)` : ""}`,
      });
      setSel(new Set());
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
    setAssigning(false);
  }

  return (
    <>
      <PageHeader title="SKU Intelligence" sub="Demand predictions, design pattern insights, and one-click Triage discovery." />
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      <UploadPanel batches={batches} onMsg={setMsg} onReload={reload} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={viewTab}
          onChange={setViewTab}
          options={[
            { value: "predictions" as const, label: "SKU Predictions", badge: items.length },
            { value: "insights" as const, label: "Design & Aesthetic Insights" },
          ]}
        />
      </div>

      {viewTab === "insights" ? (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-3.5">
            <p className="text-sm font-medium text-stone-700">Aggregated design tags across scored SKUs</p>
            <Select className={input} value={axisFilter} onChange={(e) => setAxisFilter(e.target.value)} aria-label="Filter by design axis">
              <option value="all">All axes</option>
              {allAxes.map((ax) => <option key={ax} value={ax}>{ax.replace("_", " ")}</option>)}
            </Select>
          </div>
          {loading ? <div className="p-4"><TableSkeleton /></div> : !designInsights.length ? (
            <Empty icon={Sparkles} hint="Run the intelligence model after uploading Master + performance CSVs.">No design tags scored yet</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.025] text-left text-stone-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Axis</th>
                    <th className="px-4 py-2.5 font-medium">Tag</th>
                    <th className="px-4 py-2.5 text-right font-medium">SKU Count</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg Perf Prob %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg Breakout Score</th>
                  </tr>
                </thead>
                <tbody>
                  {designInsights.map((r) => (
                    <tr key={`${r.axis}:${r.tag}`} className="border-t border-black/[0.05]">
                      <td className="px-4 py-2.5 capitalize text-stone-500">{r.axis.replace("_", " ")}</td>
                      <td className="px-4 py-2.5 font-medium text-stone-900">{r.tag}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.perfN ? formatPct(r.perfSum / r.perfN) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{r.brkN ? (r.brkSum / r.brkN).toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-4 space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                value={tierTab}
                onChange={setTierTab}
                options={[
                  { value: "all" as const, label: "All Jewellery" },
                  { value: "hidden_gems" as const, label: "Hidden Gems" },
                  { value: "proven_winners" as const, label: "Proven Winners" },
                  { value: "restock_alerts" as const, label: "Restock Alerts" },
                  { value: "in_stock" as const, label: "In Stock Only" },
                ]}
              />

              <div ref={catBtnRef} className="relative">
                <button type="button" className={`${btnGhost} py-2`} onClick={() => setCatOpen((o) => !o)}>
                  {selCats.size ? `Categories (${selCats.size})` : "All categories"} <ChevronDown size={14} />
                </button>
                {catOpen && (
                  <div className="sheet anim-pop absolute left-0 z-40 mt-1.5 w-60 rounded-2xl p-2 shadow-xl">
                    <div className="mb-1 flex items-center justify-between px-2 py-1 text-xs text-stone-500">
                      <span>Filter categories</span>
                      {selCats.size > 0 && (
                        <button type="button" className="text-maroon-700 hover:underline" onClick={() => setSelCats(new Set())}>Clear</button>
                      )}
                    </div>
                    <div className="max-h-60 space-y-0.5 overflow-y-auto">
                      {categories.map((cat) => (
                        <label key={cat} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/[0.04]">
                          <Checkbox
                            checked={selCats.has(cat)}
                            onChange={() => setSelCats((prev) => {
                              const next = new Set(prev);
                              next.has(cat) ? next.delete(cat) : next.add(cat);
                              return next;
                            })}
                          />
                          <span className="truncate">{cat}</span>
                        </label>
                      ))}
                      {!categories.length && <p className="px-2 py-2 text-xs text-stone-400">No categories yet</p>}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative min-w-[14rem] flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className={`${input} w-full pl-8`} placeholder="Search SKU or title…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>

              <Select className={input} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
                display={`Sort · ${sortBy === "breakout" ? "Breakout Score" : sortBy === "perf" ? "Perf Prob" : sortBy === "oms" ? "OMS Prob" : "Price"}`}>
                <option value="breakout">Breakout Score</option>
                <option value="perf">Perf Prob</option>
                <option value="oms">OMS Prob</option>
                <option value="price">Price</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.05] pt-3">
              <span className="text-xs font-medium text-stone-500">Price:</span>
              {PRICE_BANDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => { setPriceBand(b.key); setMinPrice(""); setMaxPrice(""); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    priceBand === b.key && !minPrice && !maxPrice
                      ? "bg-stone-900 text-white"
                      : "bg-black/[0.05] text-stone-700 hover:bg-black/[0.09]"
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 text-xs">
                <input type="number" min={0} placeholder="Min ₹" className={`${input} w-24 py-1 text-xs`}
                  value={minPrice} onChange={(e) => { setMinPrice(e.target.value); setPriceBand("all"); }} />
                <span className="text-stone-400">–</span>
                <input type="number" min={0} placeholder="Max ₹" className={`${input} w-24 py-1 text-xs`}
                  value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value); setPriceBand("all"); }} />
              </div>
            </div>
          </Card>

          {loading ? <TableSkeleton /> : !filtered.length ? (
            <Empty icon={Sparkles} hint="Upload historical CSVs and run the intelligence model, or adjust your filters.">
              {items.length ? "No matching SKUs" : "No predictions yet"}
            </Empty>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.025] text-left text-xs text-stone-500">
                  <tr>
                    <th className="p-2.5">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every((it) => sel.has(it.sku_code))}
                        onChange={(e) => setSel((prev) => {
                          const next = new Set(prev);
                          filtered.forEach((it) => (e.target.checked ? next.add(it.sku_code) : next.delete(it.sku_code)));
                          return next;
                        })}
                      />
                    </th>
                    <th className="py-2.5 font-medium">Image</th>
                    <th className="px-2 py-2.5 font-medium">SKU &amp; Title</th>
                    <th className="px-2 py-2.5 font-medium">Category</th>
                    <th className="px-2 py-2.5 font-medium">Live Price</th>
                    <th className="px-2 py-2.5 font-medium">Stock</th>
                    <th className="px-2 py-2.5 font-medium">Perf Prob</th>
                    <th className="px-2 py-2.5 font-medium">OMS Prob</th>
                    <th className="px-2 py-2.5 font-medium">Breakout</th>
                    <th className="px-2 py-2.5 font-medium">Tier</th>
                    <th className="px-2 py-2.5 font-medium">Top Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const drivers = (it.top_drivers ?? []).slice(0, 2).map(driverLabel).filter(Boolean);
                    return (
                      <tr
                        key={it.sku_code}
                        onClick={() => setActiveSku(it)}
                        className={`cursor-pointer border-t border-black/[0.05] transition-colors hover:bg-black/[0.02] ${sel.has(it.sku_code) ? "bg-maroon-50/70" : ""}`}
                      >
                        <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={sel.has(it.sku_code)} onChange={() => toggle(it.sku_code)} />
                        </td>
                        <td className="py-2">
                          <IntelThumb sku={it.sku_code} imageUrl={it.master?.image_url} className="h-12 w-12" />
                        </td>
                        <td className="max-w-[14rem] px-2 py-2">
                          <div className="flex items-center gap-1.5 font-medium text-stone-900">
                            <span>{it.sku_code}</span>
                            {it.market?.product_url && (
                              <a href={it.market.product_url} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()} title="Open PDP" className="text-stone-400 hover:text-maroon-700">
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          {it.master?.title && <p className="truncate text-xs text-stone-500" title={it.master.title}>{it.master.title}</p>}
                        </td>
                        <td className="px-2 py-2 text-stone-700">{it.master?.category || "—"}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {it.effectivePrice != null ? (
                            <span className={it.priceIsFallback ? "text-stone-500" : "font-medium text-stone-900"}
                              title={it.priceIsFallback ? "Avg catalog price (not yet scraped)" : "Live scraped price"}>
                              {inr.format(it.effectivePrice)}
                            </span>
                          ) : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-2 py-2"><StockLabelBadge status={it.market?.stock_status} /></td>
                        <td className="px-2 py-2"><ProbPill value={it.perf_sell_prob} /></td>
                        <td className="px-2 py-2 tabular-nums text-stone-700">{formatPct(it.oms_sell_prob)}</td>
                        <td className="px-2 py-2 font-semibold tabular-nums text-stone-900">
                          {it.breakout_score != null ? Number(it.breakout_score).toFixed(1) : "—"}
                        </td>
                        <td className="px-2 py-2"><TierBadge tier={it.tier} /></td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {drivers.length ? drivers.map((d, idx) => (
                              <span key={idx} className="max-w-[10rem] truncate rounded-full bg-black/[0.045] px-2 py-0.5 text-[0.6875rem] text-stone-600" title={d}>
                                {d}
                              </span>
                            )) : <span className="text-stone-400">—</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {sel.size > 0 && (
        <div className="sticky bottom-4 z-30 mt-4">
          <div className="anim-pop mx-auto flex max-w-fit flex-wrap items-center gap-4 rounded-[1.5rem] border border-black/[0.08] bg-white/90 px-5 py-3 text-sm shadow-[0_12px_40px_-8px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <span className="rounded-full bg-stone-900 px-3 py-1 text-[0.8125rem] font-semibold tabular-nums text-white">{sel.size} selected</span>
            <button type="button" className="text-stone-500 underline-offset-2 hover:underline" onClick={() => setSel(new Set())}>Clear</button>
            <button type="button" className={btn} disabled={assigning} onClick={assignToTriage}>
              {assigning ? "Assigning…" : `Assign Selected to Triage (${sel.size})`}
            </button>
          </div>
        </div>
      )}

      {activeSku && <IntelDrawer item={activeSku} onClose={() => setActiveSku(null)} />}
    </>
  );
}

