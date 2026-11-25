-- SKU price & stock market data populated by the external GitHub Actions scraper.
-- Keeps existing triage/upload/batch-lock/RLS logic completely untouched.
create table sku_market_data (
  sku_code text primary key,
  product_url text,
  price numeric,
  currency text default 'INR',
  stock_status text check (stock_status in ('in_stock_online', 'in_stock_store_only', 'out_of_stock', 'unknown')),
  scrape_status text not null default 'queued' check (scrape_status in ('queued', 'running', 'done', 'error')),
  scrape_error text,
  scraped_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint sku_market_data_code_norm check (sku_code = upper(btrim(sku_code)) and sku_code <> '')
);

alter table sku_market_data enable row level security;

create policy admin_all on sku_market_data for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create policy sku_market_data_select on sku_market_data for select
  using (auth_role() in ('approver', 'uploader'));

alter publication supabase_realtime add table sku_market_data;

