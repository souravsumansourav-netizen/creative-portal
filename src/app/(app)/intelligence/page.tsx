"use client";
import { Fragment, useMemo, useRef, useState } from "react";
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
  TIER_HELP,
  type IntelItem,
  type MarketRow,
  type MasterAttr,
  type PriceBand,
  type ScoreRow,
  type SortKey,
  type TierName,
  type TierTab,
  type UploadBatch,
} from "./types";

const PAGE = 1000; // Supabase caps a single select at 1,000 rows

async function fetchAllScores(): Promise<ScoreRow[]> {
  const sb = supabaseBrowser();
  const out: ScoreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("sku_intelligence_scores")
      .select("*")
      .order("sku_code", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as ScoreRow[]));
    if (!data || data.length < PAGE) return out;
  }
}

const TOP_N_OPTIONS = [10, 25, 50, 0] as const; // 0 = all

const SORT_LABEL: Record<SortKey, string> = {
  by_category: "Best per category",
  winner: "Winner chance",
  units: "Units sold",
  gem: "Hidden Gem strength",
  price: "Price",
};

const TAB_TIER: Record<"proven_winners" | "hidden_gems" | "watchlist", TierName> = {
  proven_winners: "Proven Winner",
  hidden_gems: "Hidden Gem",
  watchlist: "Watchlist",
};

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
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += 200) chunks.push(codes.slice(i, i + 200));
  const out: T[] = [];
  // A few requests at a time: ~13k SKUs is ~65 chunks per table.
  for (let i = 0; i < chunks.length; i += 6) {
    const results = await Promise.all(
      chunks.slice(i, i + 6).map((chunk) => sb.from(table).select(cols).in("sku_code", chunk)),
    );
    for (const { data, error } of results) {
      if (error) throw error;
      if (data) out.push(...(data as T[]));
    }
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
  const [sortBy, setSortBy] = useState<SortKey>("by_category");
  const [topN, setTopN] = useState<(typeof TOP_N_OPTIONS)[number]>(10);

  // selection & drawer
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [activeSku, setActiveSku] = useState<IntelItem | null>(null);
  const [axisFilter, setAxisFilter] = useState<string>("all");
  const catBtnRef = useRef<HTMLDivElement>(null);

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [bRes, scores] = await Promise.all([
      sb.from("intel_upload_batches").select("*").order("created_at", { ascending: false }).limit(30),
      fetchAllScores(),
    ]);
    if (bRes.error) throw bRes.error;
    setBatches((bRes.data ?? []) as UploadBatch[]);

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
      const snap = s.feature_snapshot ?? {};
      const snapRaw = snap.live_price ?? snap.avg_price;
      const snapPrice = snapRaw != null ? Number(snapRaw) : null;
      const livePrice = market?.price != null ? Number(market.price) : null;
      const effectivePrice = livePrice ?? (snapPrice != null && !Number.isNaN(snapPrice) ? snapPrice : null);
      const rawTags = (s.design_tags && Object.keys(s.design_tags).length ? s.design_tags : master?.design_tags) ?? {};
      return {
        ...s,
        cat: s.category || master?.category || "Other",
        title: master?.title || (typeof snap.product_name === "string" ? snap.product_name : null),
        master,
        market,
        effectivePrice,
        priceIsFallback: livePrice == null && effectivePrice != null,
        effectiveTags: normalizeTags(rawTags),
      };
    });
    setItems(merged);
  }, ["sku_intelligence_scores", "intel_upload_batches", "sku_market_data"]);

  // Categories ordered by size, so the biggest categories lead the grouped view.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.cat, (counts.get(it.cat) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const band = PRICE_BANDS.find((b) => b.key === priceBand);
    const minVal = minPrice.trim() !== "" ? Number(minPrice) : band?.min;
    const maxVal = maxPrice.trim() !== "" ? Number(maxPrice) : band?.max;

    const catOrder = new Map(categories.map((c, i) => [c, i]));
    return items
      .filter((it) => {
        if (tierTab === "hidden_gems" && it.tier !== "Hidden Gem") return false;
        if (tierTab === "proven_winners" && it.tier !== "Proven Winner") return false;
        if (tierTab === "watchlist" && it.tier !== "Watchlist") return false;
        if (tierTab === "restock_alerts") {
          // Out of stock, and either already a winner or likely to be one.
          const wanted = it.tier === "Proven Winner" || (it.winner_prob ?? 0) >= 0.5;
          if (it.market?.stock_status !== "out_of_stock" || !wanted) return false;
        }
        if (tierTab === "in_stock") {
          const st = it.market?.stock_status;
          if (st !== "in_stock_online" && st !== "in_stock_store_only") return false;
        }
        if (selCats.size > 0 && !selCats.has(it.cat)) return false;
        if (minVal != null && !Number.isNaN(minVal) && (it.effectivePrice == null || it.effectivePrice < minVal)) return false;
        if (maxVal != null && !Number.isNaN(maxVal) && (it.effectivePrice == null || it.effectivePrice > maxVal)) return false;
        if (q) {
          const hit = it.sku_code.toLowerCase().includes(q) || (it.title ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "winner") return (b.winner_prob ?? -1) - (a.winner_prob ?? -1);
        if (sortBy === "units") return (b.units_sold ?? -1) - (a.units_sold ?? -1);
        if (sortBy === "gem") return (b.gem_score ?? -1) - (a.gem_score ?? -1);
        if (sortBy === "price") return (b.effectivePrice ?? -1) - (a.effectivePrice ?? -1);
        // by_category: biggest categories first, then rank within the category
        return (catOrder.get(a.cat) ?? 999) - (catOrder.get(b.cat) ?? 999)
          || (a.category_rank ?? 1e9) - (b.category_rank ?? 1e9);
      });
  }, [items, categories, tierTab, selCats, priceBand, minPrice, maxPrice, query, sortBy]);

  const tierCounts = useMemo(() => {
    const out: Partial<Record<TierName, number>> = {};
    for (const it of items) if (it.tier) out[it.tier] = (out[it.tier] ?? 0) + 1;
    return out;
  }, [items]);

  const catStats = useMemo(() => {
    const out = new Map<string, { size: number; winners: number }>();
    for (const it of items) {
      const s = out.get(it.cat) ?? { size: 0, winners: 0 };
      s.size += 1;
      if (it.tier === "Proven Winner") s.winners += 1;
      out.set(it.cat, s);
    }
    return out;
  }, [items]);

  // In the grouped view, keep only the top N rows of each category (after filters).
  const visible = useMemo(() => {
    if (sortBy !== "by_category" || topN === 0) return filtered;
    const seen = new Map<string, number>();
    return filtered.filter((it) => {
      const n = (seen.get(it.cat) ?? 0) + 1;
      seen.set(it.cat, n);
      return n <= topN;
    });
  }, [filtered, sortBy, topN]);

  const designInsights = useMemo(() => {
    const map = new Map<string, { axis: string; tag: string; count: number; probSum: number; probN: number; winners: number }>();
    for (const it of items) {
      for (const [axis, tags] of Object.entries(it.effectiveTags)) {
        for (const tag of tags) {
          const key = `${axis}::${tag}`;
          const row = map.get(key) ?? { axis, tag, count: 0, probSum: 0, probN: 0, winners: 0 };
          row.count += 1;
          if (it.winner_prob != null) { row.probSum += Number(it.winner_prob); row.probN += 1; }
          if (it.tier === "Proven Winner") row.winners += 1;
          map.set(key, row);
        }
      }
    }
    return [...map.values()]
      .filter((r) => axisFilter === "all" || r.axis === axisFilter)
      .sort((a, b) => b.count - a.count || b.winners / b.count - a.winners / a.count);
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
                    <th className="px-4 py-2.5 text-right font-medium">Avg Winner Chance</th>
                    <th className="px-4 py-2.5 text-right font-medium">Proven Winners</th>
                  </tr>
                </thead>
                <tbody>
                  {designInsights.map((r) => (
                    <tr key={`${r.axis}:${r.tag}`} className="border-t border-black/[0.05]">
                      <td className="px-4 py-2.5 capitalize text-stone-500">{r.axis.replace("_", " ")}</td>
                      <td className="px-4 py-2.5 font-medium text-stone-900">{r.tag}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.probN ? formatPct(r.probSum / r.probN) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {r.winners} <span className="font-normal text-stone-400">({formatPct(r.winners / r.count)})</span>
                      </td>
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
                  { value: "proven_winners" as const, label: "Proven Winners", badge: tierCounts["Proven Winner"] },
                  { value: "hidden_gems" as const, label: "Hidden Gems", badge: tierCounts["Hidden Gem"] },
                  { value: "watchlist" as const, label: "Watchlist", badge: tierCounts["Watchlist"] },
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
                display={`Sort · ${SORT_LABEL[sortBy]}`}>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </Select>

              {sortBy === "by_category" && (
                <Select className={input} value={String(topN)} onChange={(e) => setTopN(Number(e.target.value) as typeof topN)}
                  display={topN ? `Top ${topN} per category` : "All per category"}>
                  {TOP_N_OPTIONS.map((n) => <option key={n} value={n}>{n ? `Top ${n} per category` : "All per category"}</option>)}
                </Select>
              )}
            </div>

            {tierTab !== "all" && tierTab !== "in_stock" && (
              <p className="text-xs text-stone-500">
                {tierTab === "restock_alerts"
                  ? "Out of stock now, and either a Proven Winner or 50%+ winner chance."
                  : TIER_HELP[TAB_TIER[tierTab]]}
              </p>
            )}

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
                        checked={visible.length > 0 && visible.every((it) => sel.has(it.sku_code))}
                        onChange={(e) => setSel((prev) => {
                          const next = new Set(prev);
                          visible.forEach((it) => (e.target.checked ? next.add(it.sku_code) : next.delete(it.sku_code)));
                          return next;
                        })}
                      />
                    </th>
                    <th className="py-2.5 font-medium">Image</th>
                    <th className="px-2 py-2.5 font-medium">SKU &amp; Title</th>
                    <th className="px-2 py-2.5 font-medium">Category</th>
                    <th className="px-2 py-2.5 font-medium" title="Rank by winner chance within its category (1 = most likely)">Rank in Category</th>
                    <th className="px-2 py-2.5 font-medium" title="Model's chance this SKU is a top-20% seller in its category">Winner Chance</th>
                    <th className="px-2 py-2.5 font-medium" title="max(OMS units, web + app purchases) this period">Units Sold</th>
                    <th className="px-2 py-2.5 font-medium">Live Price</th>
                    <th className="px-2 py-2.5 font-medium">Stock</th>
                    <th className="px-2 py-2.5 font-medium">Tier</th>
                    <th className="px-2 py-2.5 font-medium">Top Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((it, i) => {
                    const drivers = (it.top_drivers ?? []).slice(0, 2).map(driverLabel).filter(Boolean);
                    const newGroup = sortBy === "by_category" && (i === 0 || visible[i - 1].cat !== it.cat);
                    return (
                      <Fragment key={it.sku_code}>
                      {newGroup && (
                        <tr className="border-t border-black/[0.08] bg-stone-50">
                          <td colSpan={12} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
                            {it.cat}
                            <span className="ml-2 font-normal normal-case tracking-normal text-stone-400">
                              {catStats.get(it.cat)?.size ?? 0} SKUs · {catStats.get(it.cat)?.winners ?? 0} proven winners
                            </span>
                          </td>
                        </tr>
                      )}
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
                          {it.title && <p className="truncate text-xs text-stone-500" title={it.title}>{it.title}</p>}
                        </td>
                        <td className="px-2 py-2 text-stone-700">{it.cat}</td>
                        <td className="px-2 py-2 tabular-nums text-stone-700">
                          {it.category_rank != null ? (
                            <><span className="font-semibold text-stone-900">#{it.category_rank}</span>
                              <span className="text-xs text-stone-400"> / {it.category_size?.toLocaleString("en-IN")}</span></>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-2"><ProbPill value={it.winner_prob} /></td>
                        <td className="px-2 py-2 tabular-nums text-stone-700">
                          {it.units_sold != null ? Number(it.units_sold).toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "—"}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {it.effectivePrice != null ? (
                            <span className={it.priceIsFallback ? "text-stone-500" : "font-medium text-stone-900"}
                              title={it.priceIsFallback ? "Snapshot price at scoring time (not yet scraped)" : "Live scraped price"}>
                              {inr.format(it.effectivePrice)}
                            </span>
                          ) : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-2 py-2"><StockLabelBadge status={it.market?.stock_status} /></td>
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
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {visible.length < filtered.length && (
                <p className="border-t border-black/[0.05] px-4 py-2.5 text-xs text-stone-500">
                  Showing top {topN} of each category ({visible.length.toLocaleString("en-IN")} of {filtered.length.toLocaleString("en-IN")} SKUs).
                  Choose “All per category” or pick a category to see more.
                </p>
              )}
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

