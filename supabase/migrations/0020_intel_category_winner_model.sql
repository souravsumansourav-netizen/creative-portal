-- 0020_intel_category_winner_model.sql
-- Phase 1 of the category-winner model:
--   * App (GA4) uploads as a new source
--   * period metrics carry app traffic, listed price band and units sold
--   * scores carry category, winner probability and rank within category
--   * scrape history (price/stock per scrape) and first-seen date start accumulating now

-- 1. App uploads
alter table public.intel_upload_batches drop constraint if exists intel_upload_batches_source_type_check;
alter table public.intel_upload_batches
  add constraint intel_upload_batches_source_type_check
  check (source_type in ('web', 'app', 'oms', 'perf', 'master'));

-- 2. Period metrics: app traffic (fractional when an app name maps to several SKUs), price band, units sold
alter table public.sku_period_metrics
  add column if not exists price_band text,
  add column if not exists app_clicks numeric(14,2) default 0,
  add column if not exists app_views numeric(14,2) default 0,
  add column if not exists app_atc numeric(14,2) default 0,
  add column if not exists app_purchases numeric(14,2) default 0,
  add column if not exists app_revenue numeric(16,2) default 0,
  add column if not exists units_sold numeric(14,2) default 0;

-- 3. Master catalog: published flag defines the scored universe
alter table public.sku_master_attributes
  add column if not exists gender text,
  add column if not exists published boolean default false;

-- 4. Scores
alter table public.sku_intelligence_scores
  add column if not exists category text,
  add column if not exists winner_prob numeric(6,4),
  add column if not exists category_rank integer,
  add column if not exists category_size integer,
  add column if not exists category_pct numeric(6,2),
  add column if not exists units_sold numeric(14,2),
  add column if not exists gem_score numeric(6,2);

alter table public.sku_intelligence_scores drop constraint if exists sku_intelligence_scores_tier_check;
alter table public.sku_intelligence_scores
  add constraint sku_intelligence_scores_tier_check
  check (tier in ('Proven Winner', 'Rising Star', 'Fading Winner', 'Hidden Gem', 'Watchlist', 'Low Potential'));

create index if not exists idx_sku_intel_cat_rank on public.sku_intelligence_scores(category, category_rank);

-- 5. Scrape history: one row per successful scrape, so stock/price over time can be used later
create table if not exists public.sku_market_snapshots (
  id bigint generated always as identity primary key,
  sku_code text not null,
  scraped_at timestamptz not null default now(),
  price numeric,
  currency text,
  stock_status text
);
create index if not exists idx_sku_market_snap_sku_time on public.sku_market_snapshots(sku_code, scraped_at desc);

alter table public.sku_market_snapshots enable row level security;
create policy admin_all on public.sku_market_snapshots for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy sku_market_snapshots_select on public.sku_market_snapshots for select
  using (auth_role() in ('approver', 'uploader'));

-- 6. First time the scraper saw a SKU (launch-date proxy for new products from now on)
alter table public.sku_market_data
  add column if not exists first_seen_at timestamptz default now();
