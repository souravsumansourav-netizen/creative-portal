alter table sku_market_data
  drop constraint if exists sku_market_data_stock_status_check;

alter table sku_market_data
  add constraint sku_market_data_stock_status_check
  check (stock_status in ('in_stock_online', 'in_stock_store_only', 'out_of_stock', 'unknown', 'not_found'));
