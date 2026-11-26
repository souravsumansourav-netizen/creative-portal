export type SourceType = "web" | "oms" | "perf" | "master";
export type Granularity = "monthly" | "weekly" | "catalog";
export type TierName = "Proven Winner" | "Hidden Gem" | "Watchlist" | "Low Potential";
export type TierTab = "all" | "hidden_gems" | "proven_winners" | "restock_alerts" | "in_stock";
export type PriceBand = "all" | "under_25k" | "25k_50k" | "50k_100k" | "over_100k";
export type SortKey = "breakout" | "perf" | "oms" | "price";

export type UploadBatch = {
  id: string;
  source_type: SourceType;
  period_start: string | null;
  period_end: string | null;
  granularity: Granularity | null;
  r2_key: string | null;
  file_name: string | null;
  status: "uploaded" | "processing" | "done" | "error";
  rows_ingested: number | null;
  rows_excluded_non_jewellery: number | null;
  master_match_pct: number | null;
  error_message: string | null;
  created_at: string;
};

export type MasterAttr = {
  sku_code: string;
  title: string | null;
  category: string | null;
  collection: string | null;
  design_tags: Record<string, unknown> | null;
  image_url: string | null;
};

export type MarketRow = {
  sku_code: string;
  price: number | null;
  stock_status: "in_stock_online" | "in_stock_store_only" | "out_of_stock" | "not_found" | "unknown" | null;
  product_url: string | null;
  scrape_status: string | null;
};

export type ScoreRow = {
  sku_code: string;
  perf_sell_prob: number | null;
  oms_sell_prob: number | null;
  breakout_score: number | null;
  tier: TierName | null;
  trend_3m: number | null;
  top_drivers: unknown[] | null;
  design_tags: Record<string, unknown> | null;
  feature_snapshot: Record<string, unknown> | null;
  model_version: string | null;
  scored_at: string;
};

export type IntelItem = ScoreRow & {
  master?: MasterAttr;
  market?: MarketRow;
  effectivePrice: number | null;
  priceIsFallback: boolean;
  effectiveTags: Record<string, string[]>;
};

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const DESIGN_AXES = ["motif", "aesthetic", "wearability", "form_factor", "accent"] as const;

export function normalizeTags(raw: Record<string, unknown> | null | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [axis, val] of Object.entries(raw)) {
    const items = Array.isArray(val) ? val : typeof val === "string" ? val.split(",") : [];
    const clean = items.map((v) => String(v ?? "").trim()).filter(Boolean);
    if (clean.length) out[axis] = clean;
  }
  return out;
}

export function driverLabel(d: unknown): string {
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    const name = o.label ?? o.feature ?? o.name ?? o.driver;
    if (name) return o.impact != null ? `${name} (${o.impact})` : String(name);
  }
  return String(d ?? "");
}

export function formatPct(p: number | null | undefined): string {
  if (p == null || Number.isNaN(Number(p))) return "—";
  return `${Math.round(Number(p) * 100)}%`;
}

