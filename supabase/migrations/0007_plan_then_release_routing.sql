-- Two-step routing:
--   1) At review, approving a shot PLANS its destination(s) (PDP / performance / both + campaign). released = false.
--   2) On the Routing page, the admin/approver RELEASES chosen routings; only then do the PDP / performance
--      people see them (released = true).

alter table routings
  add column released boolean not null default false,
  add column released_by uuid references profiles(id),
  add column released_at timestamptz;

-- routings that existed before this change were already visible to their destination
update routings set released = true, released_at = coalesce(routed_at, now());

-- PDP / performance users only see released routings
drop policy if exists routings_pdp_select  on routings;
drop policy if exists routings_pdp_update  on routings;
drop policy if exists routings_perf_select on routings;
drop policy if exists routings_perf_update on routings;
create policy routings_pdp_select on routings for select
  using (auth_role() = 'pdp_uploader' and destination = 'pdp' and released);
create policy routings_pdp_update on routings for update
  using (auth_role() = 'pdp_uploader' and destination = 'pdp' and released)
  with check (auth_role() = 'pdp_uploader' and destination = 'pdp' and released);
create policy routings_perf_select on routings for select
  using (auth_role() = 'performance' and destination = 'performance' and released);
create policy routings_perf_update on routings for update
  using (auth_role() = 'performance' and destination = 'performance' and released)
  with check (auth_role() = 'performance' and destination = 'performance' and released);

-- helpers behind the shot / sku / version / asset policies: only released routings count
create or replace function output_sees_shot(p_shot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from routings r
    where r.shot_id = p_shot and r.released
      and r.destination = case auth_role()
            when 'pdp_uploader' then 'pdp'::destination_enum
            when 'performance'  then 'performance'::destination_enum end)
$$;

create or replace function output_sees_sku(p_sku uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shots s join routings r on r.shot_id = s.id
    where s.sku_id = p_sku and r.released
      and r.destination = case auth_role()
            when 'pdp_uploader' then 'pdp'::destination_enum
            when 'performance'  then 'performance'::destination_enum end)
$$;

-- Approve + plan destinations in one atomic step (used by the Review screen)
create or replace function approve_shot(
  p_version_id uuid, p_destinations destination_enum[], p_campaign text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_shot uuid; d destination_enum; rid uuid;
begin
  perform require_role('approver');
  if p_destinations is null or cardinality(p_destinations) = 0 then
    raise exception 'choose PDP, performance or both';
  end if;
  if 'performance' = any(p_destinations) and coalesce(trim(p_campaign), '') = '' then
    raise exception 'campaign name is required for performance';
  end if;
  select shot_id into v_shot from shot_versions where id = p_version_id;
  if not found then raise exception 'version not found'; end if;

  perform review_shot(p_version_id, true);

  foreach d in array p_destinations loop
    rid := null;
    insert into routings (shot_id, destination, campaign_name, routed_by, released)
    values (v_shot, d, case when d = 'performance' then trim(p_campaign) end, auth.uid(), false)
    on conflict (shot_id, destination) do nothing
    returning id into rid;
    if rid is not null then
      perform log_transition('routing', rid, null, 'planned', auth.uid(), d::text);
    end if;
  end loop;
end $$;

-- Plan destinations for an already-approved shot that has none (e.g. approved before this change)
create or replace function route_shot(
  p_shot_id uuid, p_destinations destination_enum[], p_campaign text default null
) returns void language plpgsql security definer set search_path = public as $$
declare s shots; d destination_enum; rid uuid;
begin
  perform require_role('approver');
  select * into s from shots where id = p_shot_id for update;
  if not found or s.status <> 'approved' then raise exception 'shot is not approved'; end if;
  if 'performance' = any(p_destinations) and coalesce(trim(p_campaign), '') = '' then
    raise exception 'campaign name is required for performance';
  end if;
  foreach d in array p_destinations loop
    rid := null;
    insert into routings (shot_id, destination, campaign_name, routed_by, released)
    values (p_shot_id, d, case when d = 'performance' then trim(p_campaign) end, auth.uid(), false)
    on conflict (shot_id, destination) do nothing
    returning id into rid;
    if rid is not null then
      perform log_transition('routing', rid, null, 'planned', auth.uid(), d::text);
    end if;
  end loop;
end $$;

-- Release chosen routings to the PDP / performance people
create or replace function release_routings(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform require_role('approver');
  for r in
    with u as (
      update routings set released = true, released_by = auth.uid(), released_at = now()
       where id = any(p_ids) and not released
      returning id, destination
    ) select id, destination from u
  loop
    perform log_transition('routing', r.id, 'planned', 'pending', auth.uid(), r.destination::text);
    n := n + 1;
  end loop;
  return n;
end $$;

-- completing requires the routing to have been released
create or replace function complete_routing(p_routing_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r routings; role_ role_enum := auth_role();
begin
  select * into r from routings where id = p_routing_id for update;
  if not found then raise exception 'routing not found'; end if;
  if not (role_ = 'admin'
       or (role_ = 'pdp_uploader' and r.destination = 'pdp')
       or (role_ = 'performance' and r.destination = 'performance')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not r.released then raise exception 'this routing has not been released yet'; end if;
  if r.status = 'done' then return; end if;
  update routings set status='done', completed_by=auth.uid(), completed_at=now() where id = r.id;
  perform log_transition('routing', r.id, 'pending', 'done', auth.uid(), r.destination::text);
  if not exists (select 1 from routings where shot_id = r.shot_id and status <> 'done') then
    update shots set status='done' where id = r.shot_id and status = 'approved';
    if found then perform log_transition('shot', r.shot_id, 'approved', 'done', auth.uid()); end if;
  end if;
end $$;

grant execute on function approve_shot, route_shot, release_routings, complete_routing to authenticated;
