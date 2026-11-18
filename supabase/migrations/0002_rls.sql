-- Row Level Security. Role lookup is a SECURITY DEFINER helper to avoid recursive policies.
create or replace function auth_role() returns role_enum
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

alter table profiles      enable row level security;
alter table uploads       enable row level security;
alter table batches       enable row level security;
alter table skus          enable row level security;
alter table assets        enable row level security;
alter table shots         enable row level security;
alter table shot_versions enable row level security;
alter table routings      enable row level security;
alter table transitions   enable row level security;

-- ADMIN: full access everywhere (incl. delete). No other role gets delete on anything.
do $$
declare t text;
begin
  foreach t in array array['profiles','uploads','batches','skus','assets','shots','shot_versions','routings','transitions'] loop
    execute format($f$create policy admin_all on %I for all
      using (auth_role() = 'admin') with check (auth_role() = 'admin')$f$, t);
  end loop;
end $$;

-- PROFILES: any signed-in user can read names/roles; only admin writes (policy above)
create policy profiles_read on profiles for select using (auth.uid() is not null);

-- UPLOADS
create policy uploads_uploader_insert on uploads for insert
  with check (auth_role() = 'uploader' and uploaded_by = auth.uid());
create policy uploads_uploader_select on uploads for select
  using (auth_role() = 'uploader' and uploaded_by = auth.uid());
create policy uploads_approver_select on uploads for select using (auth_role() = 'approver');

-- BATCHES: labels are readable by every signed-in user; approver may create
create policy batches_read on batches for select using (auth.uid() is not null);
create policy batches_approver_insert on batches for insert with check (auth_role() = 'approver');

-- SKUS
create policy skus_uploader_select on skus for select using (
  auth_role() = 'uploader' and exists (select 1 from uploads u where u.id = skus.upload_id and u.uploaded_by = auth.uid()));
create policy skus_approver_select on skus for select using (auth_role() = 'approver');
create policy skus_approver_update on skus for update
  using (auth_role() = 'approver') with check (auth_role() = 'approver');
create policy skus_creator_select on skus for select using (
  auth_role() = 'creator' and exists (select 1 from shots s where s.sku_id = skus.id and s.creator_id = auth.uid()));
create policy skus_output_select on skus for select using (
  auth_role() in ('pdp_uploader','performance') and exists (
    select 1 from shots s join routings r on r.shot_id = s.id
    where s.sku_id = skus.id
      and r.destination = case auth_role() when 'pdp_uploader' then 'pdp'::destination_enum else 'performance'::destination_enum end));

-- SHOTS
create policy shots_approver_select on shots for select using (auth_role() = 'approver');
create policy shots_approver_insert on shots for insert with check (auth_role() = 'approver');
create policy shots_uploader_select on shots for select using (
  auth_role() = 'uploader' and exists (
    select 1 from skus k join uploads u on u.id = k.upload_id
    where k.id = shots.sku_id and u.uploaded_by = auth.uid()));
create policy shots_creator_select on shots for select
  using (auth_role() = 'creator' and creator_id = auth.uid());
create policy shots_output_select on shots for select using (
  auth_role() in ('pdp_uploader','performance') and exists (
    select 1 from routings r where r.shot_id = shots.id
      and r.destination = case auth_role() when 'pdp_uploader' then 'pdp'::destination_enum else 'performance'::destination_enum end));

-- SHOT VERSIONS
create policy versions_approver_select on shot_versions for select using (auth_role() = 'approver');
create policy versions_approver_update on shot_versions for update
  using (auth_role() = 'approver') with check (auth_role() = 'approver');
create policy versions_creator_select on shot_versions for select using (
  auth_role() = 'creator' and exists (select 1 from shots s where s.id = shot_versions.shot_id and s.creator_id = auth.uid()));
create policy versions_creator_insert on shot_versions for insert with check (
  auth_role() = 'creator' and uploaded_by = auth.uid() and
  exists (select 1 from shots s where s.id = shot_versions.shot_id and s.creator_id = auth.uid()));
create policy versions_output_select on shot_versions for select using (
  auth_role() in ('pdp_uploader','performance') and exists (
    select 1 from routings r where r.shot_id = shot_versions.shot_id
      and r.destination = case auth_role() when 'pdp_uploader' then 'pdp'::destination_enum else 'performance'::destination_enum end));

-- ASSETS: visible iff the caller can see a version that references it (inherits version RLS)
create policy assets_via_versions on assets for select using (
  exists (select 1 from shot_versions v where v.asset_id = assets.id));
create policy assets_creator_insert on assets for insert with check (auth_role() = 'creator');

-- ROUTINGS
create policy routings_approver_select on routings for select using (auth_role() = 'approver');
create policy routings_approver_insert on routings for insert with check (auth_role() = 'approver');
create policy routings_approver_update on routings for update
  using (auth_role() = 'approver') with check (auth_role() = 'approver');
create policy routings_pdp_select on routings for select
  using (auth_role() = 'pdp_uploader' and destination = 'pdp');
create policy routings_pdp_update on routings for update
  using (auth_role() = 'pdp_uploader' and destination = 'pdp')
  with check (auth_role() = 'pdp_uploader' and destination = 'pdp');
create policy routings_perf_select on routings for select
  using (auth_role() = 'performance' and destination = 'performance');
create policy routings_perf_update on routings for update
  using (auth_role() = 'performance' and destination = 'performance')
  with check (auth_role() = 'performance' and destination = 'performance');

-- TRANSITIONS: dashboard roles read; writes happen via SECURITY DEFINER RPCs / edge functions
create policy transitions_approver_select on transitions for select using (auth_role() = 'approver');
create policy transitions_approver_insert on transitions for insert
  with check (auth_role() = 'approver' and actor = auth.uid());
