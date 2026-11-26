alter table public.sku_master_attributes
  add column if not exists image_url text;
