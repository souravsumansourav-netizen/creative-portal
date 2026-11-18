-- Fix "infinite recursion detected in policy for relation shots".
-- skus <-> shots policies referenced each other. Cross-table ownership checks now live in
-- SECURITY DEFINER helpers (they read the tables without re-entering RLS).

create or replace function uploader_owns_sku(p_sku uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from skus k join uploads u on u.id = k.upload_id
                 where k.id = p_sku and u.uploaded_by = auth.uid())
$$;

create or replace function creator_owns_sku(p_sku uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shots s where s.sku_id = p_sku and s.creator_id = auth.uid())
$$;

create or replace function creator_owns_shot(p_shot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shots s where s.id = p_shot and s.creator_id = auth.uid())
$$;

-- does the signed-in pdp_uploader / performance user have this shot routed to them?
create or replace function output_sees_shot(p_shot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from routings r
    where r.shot_id = p_shot
      and r.destination = case auth_role()
            when 'pdp_uploader' then 'pdp'::destination_enum
            when 'performance'  then 'performance'::destination_enum end)
$$;

create or replace function output_sees_sku(p_sku uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shots s join routings r on r.shot_id = s.id
    where s.sku_id = p_sku
      and r.destination = case auth_role()
            when 'pdp_uploader' then 'pdp'::destination_enum
            when 'performance'  then 'performance'::destination_enum end)
$$;

-- skus
drop policy if exists skus_uploader_select on skus;
drop policy if exists skus_creator_select  on skus;
drop policy if exists skus_output_select   on skus;
create policy skus_uploader_select on skus for select
  using (auth_role() = 'uploader' and upload_id is not null and uploader_owns_sku(id));
create policy skus_creator_select on skus for select
  using (auth_role() = 'creator' and creator_owns_sku(id));
create policy skus_output_select on skus for select
  using (auth_role() in ('pdp_uploader','performance') and output_sees_sku(id));

-- shots
drop policy if exists shots_uploader_select on shots;
drop policy if exists shots_output_select   on shots;
create policy shots_uploader_select on shots for select
  using (auth_role() = 'uploader' and uploader_owns_sku(sku_id));
create policy shots_output_select on shots for select
  using (auth_role() in ('pdp_uploader','performance') and output_sees_shot(id));

-- shot_versions
drop policy if exists versions_creator_select on shot_versions;
drop policy if exists versions_creator_insert on shot_versions;
drop policy if exists versions_output_select  on shot_versions;
create policy versions_creator_select on shot_versions for select
  using (auth_role() = 'creator' and creator_owns_shot(shot_id));
create policy versions_creator_insert on shot_versions for insert
  with check (auth_role() = 'creator' and uploaded_by = auth.uid() and creator_owns_shot(shot_id));
create policy versions_output_select on shot_versions for select
  using (auth_role() in ('pdp_uploader','performance') and output_sees_shot(shot_id));

-- assets: visible if the caller may see ANY version that points at it. Use a helper so this
-- does not re-enter shot_versions -> shots -> skus policy chains.
create or replace function can_see_asset(p_asset uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case auth_role()
    when 'admin'    then true
    when 'approver' then true
    when 'creator'  then exists (select 1 from shot_versions v
                                  where v.asset_id = p_asset and creator_owns_shot(v.shot_id))
    when 'pdp_uploader' then exists (select 1 from shot_versions v
                                  where v.asset_id = p_asset and output_sees_shot(v.shot_id))
    when 'performance'  then exists (select 1 from shot_versions v
                                  where v.asset_id = p_asset and output_sees_shot(v.shot_id))
    else false end
$$;
drop policy if exists assets_via_versions on assets;
create policy assets_via_versions on assets for select using (can_see_asset(id));
