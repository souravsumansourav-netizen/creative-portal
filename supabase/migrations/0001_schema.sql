-- Creative Approval Portal: schema, enums, triggers
create extension if not exists pgcrypto;

-- ENUMS
create type role_enum as enum ('uploader','approver','creator','pdp_uploader','performance','admin');
create type shot_type_enum as enum ('mood','model');
create type shot_status_enum as enum ('in_production','submitted','in_review','approved','done','dropped');
create type review_status_enum as enum ('pending','approved','rejected');
create type reject_reason_enum as enum ('color_gold_tone','lighting','background','crop','wrong_sku','brand_guideline','other');
create type destination_enum as enum ('pdp','performance');
create type routing_status_enum as enum ('pending','done');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role role_enum not null default 'creator',
  created_at timestamptz default now()
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references profiles(id),
  file_name text,
  source_object_key text,          -- R2 key of the stored Excel (optional)
  sku_count int default 0,
  created_at timestamptz default now()
);

create table batches (
  id uuid primary key default gen_random_uuid(),
  batch_no int not null unique,     -- sequential human label: "Batch {batch_no}"
  name text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table skus (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null,
  upload_id uuid references uploads(id) on delete set null,
  batch_id uuid references batches(id) on delete cascade,
  triaged boolean default false,
  triaged_by uuid references profiles(id),
  triaged_at timestamptz,
  created_at timestamptz default now()
);
create index on skus (sku_code);
create index on skus (batch_id);
create index on skus (upload_id);

create table assets (
  id uuid primary key default gen_random_uuid(),
  provider text default 'r2',
  bucket text,
  object_key text not null,
  file_name text,
  mime text,
  size_bytes bigint,
  width int,
  height int,
  created_at timestamptz default now()
);
create index on assets (object_key);

create table shots (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references skus(id) on delete cascade,
  shot_type shot_type_enum not null,
  status shot_status_enum not null default 'in_production',
  creator_id uuid references profiles(id),
  current_version int default 0,
  created_at timestamptz default now(),
  unique (sku_id, shot_type)
);
create index on shots (status);
create index on shots (creator_id);

create table shot_versions (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid references shots(id) on delete cascade,
  version_no int not null,
  asset_id uuid references assets(id) on delete set null,
  review_status review_status_enum not null default 'pending',
  reject_reason reject_reason_enum,
  reject_comment text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  unique (shot_id, version_no)
);

create table routings (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid references shots(id) on delete cascade,
  destination destination_enum not null,
  campaign_name text,
  status routing_status_enum not null default 'pending',
  routed_by uuid references profiles(id),
  routed_at timestamptz default now(),
  completed_by uuid references profiles(id),
  completed_at timestamptz,
  unique (shot_id, destination),
  check (destination <> 'performance' or campaign_name is not null)
);
create index on routings (destination, status);

create table transitions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,        -- 'sku' | 'shot' | 'routing' | 'batch'
  entity_id uuid not null,
  from_state text,
  to_state text not null,
  actor uuid references profiles(id),
  note text,
  created_at timestamptz default now()
);
create index on transitions (entity_type, entity_id);
create index on transitions (created_at);

-- BATCH LOCK: no re-batching once a SKU is triaged
create or replace function skus_batch_lock() returns trigger
language plpgsql as $$
begin
  if old.triaged = true and new.batch_id is distinct from old.batch_id then
    raise exception 'batch_id is immutable after triage (sku %)', old.sku_code
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger skus_batch_lock_trg
  before update on skus
  for each row execute function skus_batch_lock();

-- PROFILE AUTO-CREATE: first user becomes admin (bootstrap), everyone else 'creator'
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when (select count(*) from profiles) = 0 then 'admin'::role_enum else 'creator'::role_enum end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- REALTIME
alter publication supabase_realtime add table transitions, shots, routings, shot_versions, skus;
