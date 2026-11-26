-- 0017_sku_intelligence.sql
-- Standalone SKU Intelligence & Prediction tables (isolated from sku_market_data)

-- 1. Upload & Run Audit Log
create table if not exists public.intel_upload_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('web', 'oms', 'perf', 'master')),
  period_start date,
  period_end date,
  granularity text check (granularity in ('weekly', 'monthly', 'catalog')),
  r2_key text,
  file_name text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'done', 'error')),
  rows_ingested integer default 0,
  rows_excluded_non_jewellery integer default 0,
  master_match_pct numeric(5,2),
  error_message text,
  created_at timestamptz not null default now()
);

-- 2. Master Product DNA + Extracted Design/Aesthetic/Wearability Tags
create table if not exists public.sku_master_attributes (
  sku_code text primary key,
  base_sku_13 text,
  title text,
  category text,
  collection text,
  metal text,
  gold_karatage text,
  metal_color text,
  jewellery_type text,
  occasion text,
  diamond_clarity text,
  weight_band text,
  design text,
  styling text,
  is_new_collection boolean default false,
  is_best_deal boolean default false,
  short_description text,
  long_description text,
  design_tags jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_sku_master_base13 on public.sku_master_attributes(base_sku_13);

-- 3. Multi-Period Fact Table (Supports 3-month init + rolling monthly/weekly uploads)
create table if not exists public.sku_period_metrics (
  sku_code text not null,
  period_start date not null,
  period_end date not null,
  granularity text not null default 'monthly' check (granularity in ('weekly', 'monthly')),
  product_name text,
  category text,
  price_range text,
  avg_price numeric(12,2),
  web_clicks integer default 0,
  web_views integer default 0,
  web_atc integer default 0,
  web_purchases integer default 0,
  web_revenue numeric(14,2) default 0,
  web_atc_rate numeric(8,6),
  web_conv_rate numeric(8,6),
  web_cart_abandon_rate numeric(8,6),
  oms_units integer default 0,
  oms_revenue_inr numeric(14,2) default 0,
  oms_rev_share numeric(10,8) default 0,
  perf_users integer default 0,
  perf_units integer default 0,
  match_tier text,
  updated_at timestamptz not null default now(),
  primary key (sku_code, period_start, period_end)
);
create index if not exists idx_sku_period_sku on public.sku_period_metrics(sku_code);
create index if not exists idx_sku_period_dates on public.sku_period_metrics(period_start, period_end);

-- 4. Model Predictions, Breakout Scores & Full Explainability
create table if not exists public.sku_intelligence_scores (
  sku_code text primary key,
  perf_sell_prob numeric(6,4),
  oms_sell_prob numeric(6,4),
  breakout_score numeric(6,2),
  tier text check (tier in ('Proven Winner', 'Hidden Gem', 'Watchlist', 'Low Potential')),
  trend_3m numeric(8,4),
  top_drivers jsonb default '[]'::jsonb,
  design_tags jsonb default '{}'::jsonb,
  feature_snapshot jsonb default '{}'::jsonb,
  model_version text,
  scored_at timestamptz not null default now()
);
create index if not exists idx_sku_intel_breakout on public.sku_intelligence_scores(breakout_score desc);
create index if not exists idx_sku_intel_perf_prob on public.sku_intelligence_scores(perf_sell_prob desc);
