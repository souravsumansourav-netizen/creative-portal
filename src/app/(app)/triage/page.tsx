"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { invoke, rpc } from "@/lib/api";
import { useLiveData } from "@/lib/hooks";
import { Badge, batchLabel, btn, btnDanger, btnGhost, Card, R2Image, Empty, input, Msg, PageHeader } from "@/components/ui";
import { RefImage } from "@/components/RefImage";
import { Select, Checkbox, Segmented } from "@/components/controls";
import { TableSkeleton } from "@/components/controls";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Layers, RefreshCw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { CategoryChips } from "@/components/CategoryChips";
import { categoryCounts, categoryOf } from "@/lib/skuCategory";

type Tab = "triage" | "assigned";

const DAY = 86_400_000;
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
const dayLabel = (n: number) => (n === 0 ? "Today" : n === 1 ? "1 day" : `${n} days`);

type Row = { shoot: { mood: boolean; model: boolean }; batch_id: string; creator_id: string };
type MarketData = {
  sku_code: string;
  product_url: string | null;
  price: number | null;
  currency: string | null;
  stock_status: "in_stock_online" | "in_stock_store_only" | "out_of_stock" | "not_found" | "unknown" | null;
  scrape_status: "queued" | "running" | "done" | "error";
  scrape_error: string | null;
  scraped_at: string | null;
};

type StockF = "all" | "in" | "out";
type PriceF = "all" | "low" | "high";
type SortF = "none" | "asc" | "desc";
const PRICE_CUTOFF = 50_000; // "low" is up to and including this, "high" is above it

/** In stock = only SKUs tagged "In stock". Out of stock = SKUs tagged "Out of stock" or "Store only" (not buyable online).
 *  Not found / unknown / not fetched yet / fetching / error match neither, so they only show under "Any stock". */
const stockClass = (m?: MarketData): "in" | "out" | null => {
  if (!m || m.scrape_status === "queued" || m.scrape_status === "running" || m.scrape_status === "error") return null;
  switch (m.stock_status) {
    case "in_stock_online": return "in";
    case "in_stock_store_only": case "out_of_stock": return "out";
    default: return null;
  }
};
const priceOf = (m?: MarketData): number | null => (m && m.price != null && Number.isFinite(Number(m.price)) ? Number(m.price) : null);

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function TriagePage() {
  const [tab, setTab] = useState<Tab>("triage");
  const [assigned, setAssigned] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [marketBySku, setMarketBySku] = useState<Record<string, MarketData>>({});
  const [batches, setBatches] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  // bulk-apply controls
  const [bulkBatch, setBulkBatch] = useState("");
  const [bulkCreator, setBulkCreator] = useState("");
  const [bulkShoot, setBulkShoot] = useState<"" | "mood" | "model" | "both">("");
  const [delIds, setDelIds] = useState<string[] | null>(null); // SKUs waiting for delete confirmation
  const [preview, setPreview] = useState<number | null>(null); // index into the visible list
  const [cat, setCat] = useState("all"); // category filter ("all" or a group name)
  const [stock, setStock] = useState<StockF>("all");
  const [price, setPrice] = useState<PriceF>("all");
  const [sort, setSort] = useState<SortF>("none");
  const [showFilters, setShowFilters] = useState(false);
  // batch naming dialogs
  const [dlg, setDlg] = useState<null | "new" | "rename">(null);
  const [newName, setNewName] = useState("");
  const [moveSelected, setMoveSelected] = useState(true);
  const [renames, setRenames] = useState<Record<string, string>>({});

  const { loading, error: loadError, reload } = useLiveData(async () => {
    const sb = supabaseBrowser();
    const [s, b, c, a] = await Promise.all([
      sb.from("skus").select("id, sku_code, batch_id, created_at, uploads(file_name)").eq("triaged", false).order("created_at", { ascending: false }).order("sku_code"),
      sb.from("batches").select("*").order("batch_no"),
      sb.from("profiles").select("id, full_name, email").eq("role", "creator"),
      sb.from("shots").select("id, shot_type, status, created_at, creator_id, profiles:creator_id(full_name, email), skus(sku_code, triaged_at, batches(batch_no, name)), shot_versions(version_no, review_status, assets(object_key))")
        .neq("status", "dropped").order("created_at"),
    ]);
    if (a.error) throw a.error;
    setAssigned(a.data ?? []);
    if (s.error) throw s.error;
    const skuList = s.data ?? [];
    setSkus(skuList); setBatches(b.data ?? []); setCreators(c.data ?? []);
    const codes = [...new Set(skuList.map((k: any) => String(k.sku_code ?? "").trim().toUpperCase()).filter(Boolean))];
    const nextMarket: Record<string, MarketData> = {};
    if (codes.length) {
      const { data: mRows, error: mErr } = await sb
        .from("sku_market_data")
        .select("sku_code, product_url, price, currency, stock_status, scrape_status, scrape_error, scraped_at")
        .in("sku_code", codes);
      if (mErr) throw mErr;
      for (const m of mRows ?? []) nextMarket[String(m.sku_code).toUpperCase()] = m as MarketData;
    }
    setMarketBySku(nextMarket);
    setRows((prev) => {
      const next = { ...prev };
      for (const k of skuList) next[k.id] ??= { shoot: { mood: false, model: false }, batch_id: k.batch_id, creator_id: "" };
      return next;
    });
  }, ["skus", "shots", "sku_market_data"]);

  const patch = (ids: string[], p: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], ...(typeof p === "function" ? p(next[id]) : p) };
      return next;
    });

  const marketFor = (code: string) => marketBySku[String(code ?? "").trim().toUpperCase()];
  // filters: category (digit 7 of the SKU code), stock and price (from the scraped market data), then an optional price sort
  type Filters = { cat: string; stock: StockF; price: PriceF };
  const matches = (k: any, f: Filters) => {
    if (f.cat !== "all" && categoryOf(k.sku_code).group !== f.cat) return false;
    const m = marketFor(k.sku_code);
    if (f.stock !== "all" && stockClass(m) !== f.stock) return false;
    if (f.price !== "all") {
      const v = priceOf(m);
      if (v == null || (f.price === "low" ? v > PRICE_CUTOFF : v <= PRICE_CUTOFF)) return false;
    }
    return true;
  };
  const allCats = categoryCounts(skus.map((k) => k.sku_code));
  const activeCat = cat === "all" || allCats.some((c) => c.group === cat) ? cat : "all"; // a finished category drops out
  const f: Filters = { cat: activeCat, stock, price };
  const sortedByPrice = (list: any[]) => sort === "none" ? list : [...list].sort((a, b) => {
    const pa = priceOf(marketFor(a.sku_code)), pb = priceOf(marketFor(b.sku_code));
    if (pa == null || pb == null) return pa == null && pb == null ? 0 : pa == null ? 1 : -1; // no price always last
    return sort === "asc" ? pa - pb : pb - pa;
  });
  const visible = sortedByPrice(skus.filter((k) => matches(k, f)));
  // each control's numbers reflect the other two, so a menu item shows what picking it would give. Category chips stay put.
  const nStock = (v: StockF) => skus.filter((k) => matches(k, { ...f, stock: v })).length;
  const nPrice = (v: PriceF) => skus.filter((k) => matches(k, { ...f, price: v })).length;
  const inFilteredCat = skus.filter((k) => matches(k, { ...f, cat: "all" }));
  const counts = allCats.map((c) => ({ group: c.group, count: inFilteredCat.filter((k) => categoryOf(k.sku_code).group === c.group).length }));
  const nActive = (stock !== "all" ? 1 : 0) + (price !== "all" ? 1 : 0) + (sort !== "none" ? 1 : 0);
  const filtersOn = activeCat !== "all" || stock !== "all" || price !== "all" || sort !== "none";
  // "ready" and the bulk actions follow what you can see, so a filter never confirms rows that are hidden
  const visibleIds = new Set(visible.map((k) => k.id));
  const selected = [...sel].filter((id) => visibleIds.has(id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ready = visible.filter((k) => { const r = rows[k.id]; return r && (r.shoot.mood || r.shoot.model) && r.creator_id; });

  /** Change any filter; rows that drop out of view also drop out of the selection. */
  function setFilters(next: Partial<Filters>) {
    const nf = { ...f, ...next };
    if (next.cat !== undefined) setCat(next.cat);
    if (next.stock !== undefined) setStock(next.stock);
    if (next.price !== undefined) setPrice(next.price);
    setPreview(null);
    const inView = new Set(skus.filter((k) => matches(k, nf)).map((k) => k.id));
    setSel((prev) => new Set([...prev].filter((id) => inView.has(id))));
  }
  const resetFilters = () => { setFilters({ cat: "all", stock: "all", price: "all" }); setSort("none"); };

  /** Apply whatever the sticky bar has chosen (shot type, batch, creator) to every selected row in one go. */
  function applyBulk() {
    const p: Partial<Row> = {};
    if (bulkShoot) p.shoot = { mood: bulkShoot !== "model", model: bulkShoot !== "mood" };
    if (bulkBatch) p.batch_id = bulkBatch;
    if (bulkCreator) p.creator_id = bulkCreator;
    patch(selected, p);
    const parts = [bulkShoot && (bulkShoot === "both" ? "Mood + Model" : bulkShoot === "mood" ? "Mood" : "Model"),
      bulkBatch && batchLabel(batches.find((b) => b.id === bulkBatch)),
      bulkCreator && cName(creators.find((c) => c.id === bulkCreator))].filter(Boolean);
    setMsg({ ok: `Set ${parts.join(" · ")} on ${selected.length} SKU${selected.length === 1 ? "" : "s"}.` });
    setSel(new Set());
  }

  async function deleteSkus() {
    if (!delIds) return;
    setBusy(true); setMsg({});
    try {
      const n = await rpc<number>("delete_skus", { p_ids: delIds });
      setMsg({ ok: `Deleted ${n} SKU${n === 1 ? "" : "s"} from Triage.` });
      setSel((prev) => new Set([...prev].filter((id) => !delIds.includes(id))));
      setDelIds(null);
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); setDelIds(null); }
    setBusy(false);
  }

  function openNew() { setNewName(""); setMoveSelected(true); setDlg("new"); }
  function openRename() { setRenames(Object.fromEntries(batches.map((b) => [b.id, b.name ?? ""]))); setDlg("rename"); }

  async function createBatch() {
    setMsg({});
    try {
      const b = await rpc("create_batch", { p_name: newName.trim() || null });
      if (moveSelected && selected.length) patch(selected, { batch_id: b.id });
      setBulkBatch(b.id);
      setMsg({ ok: `Created ${batchLabel(b)}${moveSelected && selected.length ? ` and moved ${selected.length} SKU${selected.length === 1 ? "" : "s"} into it` : ""}.` });
      setDlg(null);
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function saveRenames() {
    const items = batches.filter((b) => (renames[b.id] ?? "") !== (b.name ?? "")).map((b) => ({ id: b.id, name: renames[b.id] ?? "" }));
    if (!items.length) return setDlg(null);
    setMsg({});
    try {
      const n = await rpc<number>("rename_batches", { p_items: items });
      setMsg({ ok: `Renamed ${n} batch${n === 1 ? "" : "es"}.` });
      setDlg(null);
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function confirm() {
    setBusy(true); setMsg({});
    try {
      const items = ready.map((k) => ({
        sku_id: k.id, batch_id: rows[k.id].batch_id, creator_id: rows[k.id].creator_id,
        shot_types: (["mood", "model"] as const).filter((t) => rows[k.id].shoot[t]),
      }));
      const n = await rpc<number>("triage_skus", { p_items: items });
      setMsg({ ok: `Triaged ${n} SKUs. Their batches are now locked.` });
      setSel(new Set()); await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  async function fetchMarketData(skuCodes: string[]) {
    const codes = [...new Set(skuCodes.map((c) => String(c ?? "").trim().toUpperCase()).filter(Boolean))];
    if (!codes.length) return;
    setFetchingPrice(true); setMsg({});
    try {
      const r = await invoke<{ queued: number }>("trigger-scrape", { sku_codes: codes, mode: "queued" });
      setMsg({ ok: `Queued price & stock fetch for ${r.queued ?? codes.length} SKU${codes.length === 1 ? "" : "s"}.` });
      await reload();
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setFetchingPrice(false);
  }

  const cName = (c: any) => c.full_name || c.email;
  const selectedCodes = skus.filter((k) => selected.includes(k.id)).map((k) => k.sku_code);

  return (
    <>
      <PageHeader title="Triage" sub="Choose shot types, a creator and a batch. Confirming locks the batch.">
        {tab === "triage" && <>
          <button className={btnGhost} disabled={fetchingPrice || !visible.length} onClick={() => fetchMarketData(visible.map((k) => k.sku_code))}>
            <RefreshCw size={14} className={fetchingPrice ? "animate-spin" : ""} /> {fetchingPrice ? "Fetching…" : "Fetch price & stock"}
          </button>
          <Select className={btnGhost} value="" display={<><Layers size={14} /> Batches</>}
            onChange={(e) => (e.target.value === "new" ? openNew() : openRename())}>
            <option value="new">New batch…</option>
            <option value="rename">Rename batches…</option>
          </Select>
          <button className={btn} disabled={busy || !ready.length} onClick={confirm}>Confirm {ready.length} ready</button>
        </>}
      </PageHeader>
      <Msg error={msg.error ?? loadError} ok={msg.ok} />

      <div className="mb-4">
        <Segmented value={tab} onChange={setTab}
          options={[{ value: "triage" as const, label: "To triage", badge: skus.length }, { value: "assigned" as const, label: "Assigned", badge: assigned.length }]} />
      </div>

      {tab === "assigned" ? (
        loading ? <TableSkeleton /> : <AssignedView shots={assigned} />
      ) : (<>
      {skus.length > 0 && (<>
        <div className="mb-3"><CategoryChips counts={counts} total={inFilteredCat.length} value={activeCat} onChange={(g) => setFilters({ cat: g })} /></div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* what is switched on, each removable with one tap */}
          {stock !== "all" && <ActiveChip label={stock === "in" ? "In stock" : "Out of stock"} onClear={() => setFilters({ stock: "all" })} />}
          {price !== "all" && <ActiveChip label={price === "low" ? "₹50,000 and below" : "Above ₹50,000"} onClear={() => setFilters({ price: "all" })} />}
          {sort !== "none" && <ActiveChip label={sort === "asc" ? "Price: Low to High" : "Price: High to Low"} onClear={() => setSort("none")} />}
          {filtersOn && <button type="button" onClick={resetFilters} className="px-1.5 text-[0.8125rem] font-medium text-maroon-700 hover:underline active:opacity-60">Reset</button>}
          <span className="ml-auto text-[0.8125rem] tabular-nums text-stone-500" aria-live="polite">
            {visible.length === skus.length ? `${skus.length} SKUs` : `${visible.length} of ${skus.length} SKUs`}
          </span>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[0.8125rem] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 ${
              showFilters || nActive ? "bg-stone-900 text-white" : "bg-black/[0.06] text-stone-800 hover:bg-black/[0.10]"}`}>
            <SlidersHorizontal size={14} /> Filters
            {nActive > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[0.6875rem] font-semibold tabular-nums">{nActive}</span>}
          </button>
        </div>
      </>)}

      {loading ? <TableSkeleton /> : !skus.length ? <Empty tone="success" hint="New SKUs appear here after an upload or when SKUs are pasted in.">All caught up</Empty> : !visible.length ? <Empty hint="Try a different combination, or tap Reset.">No SKUs match these filters</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.025] text-left text-stone-500">
              <tr>
                <th className="p-2"><Checkbox checked={visible.length > 0 && visible.every((k) => sel.has(k.id))} onChange={(e) => setSel((prev) => { const n = new Set(prev); visible.forEach((k) => (e.target.checked ? n.add(k.id) : n.delete(k.id))); return n; })} /></th>
                <th /><th>Product</th><th>Price &amp; stock</th><th>Shoot</th><th>Batch</th><th>Creator</th><th />
              </tr>
            </thead>
            <tbody>
              {visible.map((k) => {
                const r = rows[k.id]; if (!r) return null;
                const c = categoryOf(k.sku_code);
                const detail = c.label && c.label.toLowerCase() !== c.group.toLowerCase().replace(/s$/, "") ? c.label : "";
                const market = marketFor(k.sku_code);
                return (
                  <tr key={k.id} className={`border-t border-black/[0.05] transition-colors ${sel.has(k.id) ? "bg-maroon-50/70" : ""}`}>
                    <td className="p-2"><Checkbox checked={sel.has(k.id)} onChange={() => toggle(k.id)} /></td>
                    <td className="py-2">
                      <button type="button" title="Click to enlarge" onClick={() => setPreview(visible.indexOf(k))}>
                        <RefImage sku={k.sku_code} className="h-28 w-28 rounded-xl border border-stone-200" />
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      <p className="font-semibold">{k.sku_code}</p>
                      <p className={`text-[0.8125rem] ${c.group === "Unrecognised" ? "text-stone-400" : "text-stone-700"}`}>{c.group}</p>
                      {detail && <p className="max-w-[13rem] truncate text-xs text-stone-500" title={detail}>{detail}</p>}
                      {k.uploads?.file_name && <p className="mt-0.5 max-w-[13rem] truncate text-xs text-stone-400" title={k.uploads.file_name}>{k.uploads.file_name}</p>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-col items-start gap-1.5 tabular-nums">
                        <span className="text-[0.9375rem]"><PriceCell market={market} /></span>
                        <StockBadge market={market} />
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-1.5">
                        {(["mood", "model"] as const).map((t) => (
                          <button key={t} type="button" aria-pressed={r.shoot[t]} onClick={() => patch([k.id], { shoot: { ...r.shoot, [t]: !r.shoot[t] } })}
                            className={`rounded-full px-3 py-1 text-[0.8125rem] font-medium capitalize transition-[background-color,color,transform] duration-150 active:scale-[0.96] motion-reduce:active:scale-100 ${
                              r.shoot[t] ? "bg-maroon-700 text-white" : "bg-black/[0.05] text-stone-500 hover:bg-black/[0.09]"}`}>{t}</button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Select className={input} value={r.batch_id} onChange={(e) => patch([k.id], { batch_id: e.target.value })}>
                        {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                      </Select>
                    </td>
                    <td>
                      <Select className={input} value={r.creator_id} onChange={(e) => patch([k.id], { creator_id: e.target.value })}>
                        <option value="">—</option>
                        {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
                      </Select>
                    </td>
                    <td className="pr-2 text-right">
                      <button type="button" title="Delete this SKU" aria-label={`Delete ${k.sku_code}`} onClick={() => setDelIds([k.id])}
                        className="rounded-full p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-700 active:scale-95"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      </>)}

      {tab === "triage" && showFilters && (
        <FilterPanel
          stock={stock} price={price} sort={sort} nStock={nStock} nPrice={nPrice} shown={visible.length}
          onStock={(v) => setFilters({ stock: v })} onPrice={(v) => setFilters({ price: v })} onSort={setSort}
          onReset={resetFilters} canReset={nActive > 0 || activeCat !== "all"} onClose={() => setShowFilters(false)} />
      )}

      {tab === "triage" && selected.length > 0 && (
        <div className="sticky bottom-4 z-30 mt-4">
          <div className="anim-pop mx-auto flex max-w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.5rem] border border-black/[0.08] bg-white/90 px-5 py-3.5 text-sm shadow-[0_12px_40px_-8px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-900 px-3 py-1 text-[0.8125rem] font-semibold tabular-nums text-white">{selected.length} selected</span>
              <button type="button" className="text-stone-500 underline-offset-2 hover:underline" onClick={() => setSel(new Set())}>Clear</button>
            </div>
            <label className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-stone-400">1 Shoot</span>
              <Segmented value={bulkShoot} onChange={setBulkShoot}
                options={[{ value: "mood" as const, label: "Mood" }, { value: "model" as const, label: "Model" }, { value: "both" as const, label: "Both" }]} />
            </label>
            <label className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-stone-400">2 Batch</span>
              <Select className={input} value={bulkBatch} onChange={(e) => setBulkBatch(e.target.value)}>
                <option value="">Keep as is</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
              </Select>
            </label>
            <label className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-stone-400">3 Creator</span>
              <Select className={input} value={bulkCreator} onChange={(e) => setBulkCreator(e.target.value)}>
                <option value="">Keep as is</option>
                {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
              </Select>
            </label>
            <button className={btn} disabled={!bulkShoot && !bulkBatch && !bulkCreator} onClick={applyBulk}>Apply to {selected.length}</button>
            <span className="mx-1 hidden h-6 w-px bg-black/[0.08] sm:block" />
            <button className={btnGhost} disabled={fetchingPrice} onClick={() => fetchMarketData(selectedCodes)}>
              <RefreshCw size={14} className={fetchingPrice ? "animate-spin" : ""} /> Fetch price
            </button>
            <button className={btnGhost} disabled={busy || !ready.length} onClick={confirm}>Confirm {ready.length} ready</button>
            <button className={`${btnDanger} ml-auto`} disabled={busy} onClick={() => setDelIds(selected)}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      )}
      {delIds && (
        <Dialog title={`Delete ${delIds.length} SKU${delIds.length === 1 ? "" : "s"}?`}
          subtitle="They are removed from Triage permanently and cannot be recovered. Re-upload the SKU if you need it back."
          onClose={() => setDelIds(null)}
          footer={<><button className={btnGhost} onClick={() => setDelIds(null)}>Cancel</button>
            <button className={btnDanger} disabled={busy} onClick={deleteSkus}>{busy ? "Deleting…" : "Delete permanently"}</button></>}>
          <p className="text-sm text-stone-600">{delIds.length <= 5
            ? skus.filter((k) => delIds.includes(k.id)).map((k) => k.sku_code).join(", ")
            : `${delIds.length} selected SKUs`}</p>
        </Dialog>
      )}
      {dlg === "new" && (
        <Dialog title="New batch" subtitle="Give it a name your team will recognise." onClose={() => setDlg(null)}
          footer={<><button className={btnGhost} onClick={() => setDlg(null)}>Cancel</button><button className={btn} onClick={createBatch}>Create batch</button></>}>
          <input autoFocus className={`${input} w-full py-2.5`} placeholder="e.g. Wedding Gifting" maxLength={60} value={newName}
            onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createBatch(); }} />
          {selected.length > 0 && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <Checkbox checked={moveSelected} onChange={(e) => setMoveSelected(e.target.checked)} />
              Move the {selected.length} selected SKU{selected.length === 1 ? "" : "s"} into it
            </label>
          )}
          <p className="mt-3 text-xs text-stone-500">It appears as “Batch N · your name”. You can rename it again any time before SKUs are confirmed.</p>
        </Dialog>
      )}

      {dlg === "rename" && (
        <Dialog title="Rename batches" subtitle="Edit one name or several, then save once. Leave a name blank to go back to the plain batch number."
          width="max-w-lg" onClose={() => setDlg(null)}
          footer={<><button className={btnGhost} onClick={() => setDlg(null)}>Cancel</button><button className={btn} onClick={saveRenames}>Save names</button></>}>
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm font-medium text-stone-600">Batch {b.batch_no}</span>
                <input className={`${input} flex-1`} placeholder="Add a name" maxLength={60} value={renames[b.id] ?? ""}
                  onChange={(e) => setRenames((r) => ({ ...r, [b.id]: e.target.value }))} />
              </div>
            ))}
            {!batches.length && <p className="text-sm text-stone-500">No batches yet.</p>}
          </div>
        </Dialog>
      )}

      {preview !== null && visible[preview] && (() => {
        const k = visible[preview]; const r = rows[k.id]; const market = marketFor(k.sku_code);
        return (
          <div className="scrim anim-fade fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
            <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl sheet anim-pop md:flex-row" onClick={(e) => e.stopPropagation()}>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-stone-100 p-2">
                <RefImage sku={k.sku_code} lazy={false} className="h-[70vh] w-full" />
              </div>
              <div className="w-full space-y-4 p-5 text-sm md:w-80">
                <div className="flex items-start justify-between">
                  <div><p className="text-base font-semibold">{k.sku_code}</p><p className="text-stone-500">{categoryOf(k.sku_code).group} · {preview + 1} of {visible.length}</p></div>
                  <button className={btnGhost} onClick={() => setPreview(null)}><X size={16} /></button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-stone-50 px-3 py-2.5">
                  <div className="tabular-nums"><PriceCell market={market} /></div>
                  <StockBadge market={market} />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2"><Checkbox checked={r.shoot.mood} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, mood: e.target.checked } })} /> Mood shot</label>
                  <label className="flex items-center gap-2"><Checkbox checked={r.shoot.model} onChange={(e) => patch([k.id], { shoot: { ...r.shoot, model: e.target.checked } })} /> Model shot</label>
                </div>
                <label className="block">Batch
                  <Select className={`${input} mt-1 w-full`} value={r.batch_id} onChange={(e) => patch([k.id], { batch_id: e.target.value })}>
                    {batches.map((b) => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
                  </Select>
                </label>
                <label className="block">Creator
                  <Select className={`${input} mt-1 w-full`} value={r.creator_id} onChange={(e) => patch([k.id], { creator_id: e.target.value })}>
                    <option value="">—</option>
                    {creators.map((c) => <option key={c.id} value={c.id}>{cName(c)}</option>)}
                  </Select>
                </label>
                <div className="flex gap-2">
                  <button className={btnGhost} disabled={preview <= 0} onClick={() => setPreview(preview - 1)}><ChevronLeft size={16} /> Prev</button>
                  <button className={btn} disabled={preview >= visible.length - 1} onClick={() => setPreview(preview + 1)}>Next <ChevronRight size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

type Stage = "all" | "prod" | "review" | "done";
const STAGES: { key: Stage; label: string; match: (st: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "prod", label: "In production", match: (st) => st === "in_production" },
  { key: "review", label: "In review", match: (st) => st === "submitted" || st === "in_review" },
  { key: "done", label: "Approved", match: (st) => st === "approved" || st === "done" },
];
const stageRank = (st: string) => STAGES.findIndex((x) => x.key !== "all" && x.match(st)); // production, review, approved

/** What has been handed out: grouped by creator, with how many days each shot has been with them. */
function AssignedView({ shots }: { shots: any[] }) {
  const [cat, setCat] = useState("all");
  const [stage, setStage] = useState<Stage>("all");
  const [creator, setCreator] = useState("all");
  const when = (s: any) => s.skus?.triaged_at ?? s.created_at;
  const cid = (s: any) => s.creator_id ?? "none";
  const cname = (s: any) => s.profiles?.full_name || s.profiles?.email || "No creator";
  const inStage = (s: any, k: Stage) => STAGES.find((x) => x.key === k)!.match(s.status);

  // each filter's counts reflect the other two, so a chip shows what clicking it would give
  const creators = [...new Map(shots.map((s) => [cid(s), cname(s)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const activeCreator = creator === "all" || creators.some(([id]) => id === creator) ? creator : "all";
  const byCreatorSel = shots.filter((s) => activeCreator === "all" || cid(s) === activeCreator);
  const byStage = byCreatorSel.filter((s) => inStage(s, stage));
  const counts = categoryCounts(byStage.map((s) => s.skus?.sku_code));
  const activeCat = cat === "all" || counts.some((c) => c.group === cat) ? cat : "all";
  const inCat = (s: any) => activeCat === "all" || categoryOf(s.skus?.sku_code).group === activeCat;
  const shown = byStage.filter(inCat);

  if (!shots.length) return <Empty hint="Shots appear here once you confirm them in the To triage tab.">Nothing assigned yet</Empty>;

  const byCreator = new Map<string, { name: string; items: any[] }>();
  for (const s of shown) {
    const g: { name: string; items: any[] } = byCreator.get(cid(s)) ?? { name: cname(s), items: [] as any[] };
    byCreator.set(cid(s), g);
    g.items.push(s);
  }
  const isOpen = (s: any) => s.status === "in_production";
  const groups = [...byCreator.values()].map((g) => ({
    ...g,
    // in production first, then in review, approved last; longest-waiting first within each
    items: g.items.sort((a, b) => stageRank(a.status) - stageRank(b.status) || +new Date(when(a)) - +new Date(when(b))),
    open: g.items.filter(isOpen).length,
  })).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented value={stage} onChange={setStage}
          options={STAGES.map((x) => ({ value: x.key, label: x.label, badge: byCreatorSel.filter((s) => x.match(s.status) && inCat(s)).length }))} />
        <Select className={input} value={activeCreator} onChange={(e) => setCreator(e.target.value)} aria-label="Filter by creator">
          <option value="all">All creators</option>
          {creators.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      </div>
      <div className="mb-4"><CategoryChips counts={counts} total={byStage.length} value={activeCat} onChange={setCat} /></div>
      {!groups.length && <Empty hint="Try another filter above.">Nothing here</Empty>}
      <div className="space-y-4">
        {groups.map((g) => {
          const oldest = Math.max(0, ...g.items.filter(isOpen).map((s) => daysSince(when(s))));
          return (
            <Card key={g.name} className="overflow-x-auto p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/[0.05] bg-black/[0.025] px-4 py-3">
                <p className="text-[1rem] font-semibold">{g.name}</p>
                <p className="text-xs text-stone-500 tabular-nums">
                  {g.items.length} shown · <b className="text-stone-900">{g.open}</b> in production
                  {g.open > 0 && <> · oldest waiting <b className={oldest >= 14 ? "text-red-700" : oldest >= 7 ? "text-apple-orange" : "text-stone-900"}>{dayLabel(oldest)}</b></>}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-stone-500">
                  <tr><th className="px-4 py-2 font-medium">SKU</th><th className="font-medium">Preview</th><th className="font-medium">Category</th><th className="font-medium">Shot</th><th className="font-medium">Batch</th><th className="font-medium">Status</th><th className="font-medium">Assigned</th><th className="px-4 text-right font-medium">Time since</th></tr>
                </thead>
                <tbody>
                  {g.items.map((s: any) => {
                    const d = daysSince(when(s));
                    const tone = !isOpen(s) ? "text-stone-400" : d >= 14 ? "font-semibold text-red-700" : d >= 7 ? "font-semibold text-apple-orange" : "text-stone-900";
                    const vs = [...(s.shot_versions ?? [])].sort((a: any, b: any) => b.version_no - a.version_no);
                    const shownV = vs.find((v: any) => v.review_status === "approved") ?? vs[0]; // approved image, else the latest upload
                    return (
                      <tr key={s.id} className="border-t border-black/[0.05]">
                        <td className="px-4 py-2 font-medium">
                          <a href={`/shots/${s.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-maroon-700 hover:underline">{s.skus?.sku_code}</a>
                        </td>
                        <td className="py-2">
                          {shownV?.assets ? (
                            <a href={`/shots/${s.id}`} target="_blank" rel="noopener noreferrer" title="Open the shot" className="block w-fit overflow-hidden rounded border border-stone-200">
                              <R2Image objectKey={shownV.assets.object_key} className="h-14 w-14 bg-stone-100" />
                            </a>
                          ) : <span className="text-stone-400" title="Nothing uploaded yet">—</span>}
                        </td>
                        <td className="text-stone-700">{categoryOf(s.skus?.sku_code).group}</td>
                        <td className="capitalize text-stone-700">{s.shot_type}</td>
                        <td className="text-stone-700">{s.skus?.batches ? batchLabel(s.skus.batches) : "—"}</td>
                        <td><Badge value={s.status} /></td>
                        <td className="text-stone-500">{new Date(when(s)).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                        <td className={`px-4 text-right tabular-nums ${tone}`}>{dayLabel(d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function PriceCell({ market }: { market?: MarketData }) {
  if (!market || market.price == null) {
    return market?.product_url ? (
      <a href={market.product_url} target="_blank" rel="noopener noreferrer" title="Open PDP"
        className="inline-flex items-center gap-1 text-stone-500 hover:text-maroon-700">
        — <ExternalLink size={12} />
      </a>
    ) : <span className="text-stone-400">—</span>;
  }
  const formatted = market.currency && market.currency !== "INR"
    ? `${market.currency} ${Number(market.price).toLocaleString("en-IN")}`
    : inr.format(Number(market.price));
  const tip = market.scraped_at ? `Scraped ${new Date(market.scraped_at).toLocaleString()}` : undefined;
  if (market.product_url) {
    return (
      <a href={market.product_url} target="_blank" rel="noopener noreferrer" title={tip ? `${tip} · Open PDP` : "Open PDP"}
        className="inline-flex items-center gap-1 font-medium text-stone-900 hover:text-maroon-700 hover:underline">
        {formatted} <ExternalLink size={12} className="text-stone-400" />
      </a>
    );
  }
  return <span className="font-medium text-stone-900" title={tip}>{formatted}</span>;
}

function StockBadge({ market }: { market?: MarketData }) {
  if (!market) return <span className="text-stone-400">—</span>;
  const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";
  if (market.scrape_status === "queued" || market.scrape_status === "running") {
    return <span className={`${pill} animate-pulse bg-black/[0.06] text-stone-600`}>Fetching…</span>;
  }
  if (market.scrape_status === "error") {
    return <span className={`${pill} bg-apple-red/15 text-ink-red`} title={market.scrape_error ?? "Scrape failed"}>Error</span>;
  }
  switch (market.stock_status) {
    case "in_stock_online":
      return <span className={`${pill} bg-apple-green/15 text-ink-green`}>In stock</span>;
    case "in_stock_store_only":
      return <span className={`${pill} bg-apple-orange/15 text-ink-orange`}>Store only</span>;
    case "out_of_stock":
      return <span className={`${pill} bg-apple-red/15 text-ink-red`}>Out of stock</span>;
    case "not_found":
      return <span className={`${pill} bg-black/[0.06] text-stone-500`}>Not found</span>;
    default:
      return <span className="text-stone-400">—</span>;
  }
}

/** A filter that is on, shown as a removable pill. */
function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-maroon-700/10 py-1 pl-3 pr-1.5 text-[0.8125rem] font-medium text-maroon-800 ring-1 ring-inset ring-maroon-700/15">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`} className="rounded-full p-0.5 text-maroon-700/70 transition hover:bg-maroon-700/15 hover:text-maroon-800 active:scale-90"><X size={13} /></button>
    </span>
  );
}

/** Inset list of single-choice rows (like iOS Settings): label, live count, tick on the chosen one. */
function ChoiceList<T extends string>({ title, value, options, onChange }: {
  title: string; value: T; onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <section>
      <h3 className="mb-1.5 px-1 !text-[0.75rem] font-medium uppercase tracking-wide !text-stone-500">{title}</h3>
      <div role="radiogroup" aria-label={title} className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]">
        {options.map((o, i) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] transition-colors active:bg-black/[0.05] ${i ? "border-t border-black/[0.06]" : ""} ${o.value === value ? "font-medium text-stone-900" : "text-stone-700 hover:bg-black/[0.025]"}`}>
            <span className="flex-1">{o.label}</span>
            {o.count !== undefined && <span className="text-[0.8125rem] tabular-nums text-stone-400">{o.count}</span>}
            <span className="flex w-4 justify-center text-maroon-700">{o.value === value && <Check size={16} strokeWidth={2.5} />}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Right-hand filter sheet. No scrim, so the list stays visible and updates as you choose. */
function FilterPanel({ stock, price, sort, nStock, nPrice, shown, onStock, onPrice, onSort, onReset, canReset, onClose }: {
  stock: StockF; price: PriceF; sort: SortF; nStock: (v: StockF) => number; nPrice: (v: PriceF) => number; shown: number;
  onStock: (v: StockF) => void; onPrice: (v: PriceF) => void; onSort: (v: SortF) => void;
  onReset: () => void; canReset: boolean; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside role="complementary" aria-label="Filters" className="sheet anim-slide-in fixed bottom-4 right-4 top-4 z-[60] flex w-[21.5rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[1.75rem]">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h2 className="!text-[1.375rem]">Filters</h2>
        <button type="button" onClick={onClose} aria-label="Close filters" className="rounded-full bg-black/[0.06] p-1.5 text-stone-600 transition hover:bg-black/[0.10] active:scale-95"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-3">
        <ChoiceList title="Stock" value={stock} onChange={onStock} options={[
          { value: "all", label: "Any stock" },
          { value: "in", label: "In stock", count: nStock("in") },
          { value: "out", label: "Out of stock", count: nStock("out") },
        ]} />
        <p className="-mt-3 px-1 text-xs text-stone-500">Out of stock also includes “Store only” SKUs.</p>
        <ChoiceList title="Price" value={price} onChange={onPrice} options={[
          { value: "all", label: "Any price" },
          { value: "low", label: "₹50,000 and below", count: nPrice("low") },
          { value: "high", label: "Above ₹50,000", count: nPrice("high") },
        ]} />
        <ChoiceList title="Sort by" value={sort} onChange={onSort} options={[
          { value: "none", label: "Default order" },
          { value: "asc", label: "Price: Low to High" },
          { value: "desc", label: "Price: High to Low" },
        ]} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-4">
        <button type="button" disabled={!canReset} onClick={onReset} className="text-[0.875rem] font-medium text-maroon-700 hover:underline disabled:text-stone-300 disabled:no-underline">Reset</button>
        <button type="button" className={btn} onClick={onClose}>Show {shown} SKU{shown === 1 ? "" : "s"}</button>
      </div>
    </aside>
  );
}
