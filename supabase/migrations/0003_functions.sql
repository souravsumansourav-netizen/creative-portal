-- State-changing RPCs. Each is SECURITY DEFINER, checks the caller's role, and writes `transitions`.

create or replace function log_transition(
  p_type text, p_id uuid, p_from text, p_to text, p_actor uuid, p_note text default null
) returns void language sql security definer set search_path = public as $$
  insert into transitions (entity_type, entity_id, from_state, to_state, actor, note)
  values (p_type, p_id, p_from, p_to, p_actor, p_note);
$$;
revoke all on function log_transition from public, anon, authenticated;

create or replace function require_role(variadic p_roles role_enum[]) returns role_enum
language plpgsql stable security definer set search_path = public as $$
declare r role_enum := auth_role();
begin
  if r is null or not (r = any(p_roles) or r = 'admin') then
    raise exception 'permission denied for role %', coalesce(r::text, 'anonymous') using errcode = '42501';
  end if;
  return r;
end $$;

-- Create a new batch (approver/admin)
create or replace function create_batch(p_name text default null) returns batches
language plpgsql security definer set search_path = public as $$
declare b batches;
begin
  perform require_role('approver');
  perform pg_advisory_xact_lock(hashtext('batches_seq'));
  insert into batches (batch_no, name, created_by)
  values ((select coalesce(max(batch_no), 0) + 1 from batches), p_name, auth.uid())
  returning * into b;
  perform log_transition('batch', b.id, null, 'created', auth.uid());
  return b;
end $$;

-- Triage: p_items = [{ "sku_id", "shot_types": ["mood","model"], "batch_id", "creator_id" }]
create or replace function triage_skus(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; st text; v_sku skus; v_shot_id uuid; n int := 0;
begin
  perform require_role('approver');
  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_sku from skus where id = (it->>'sku_id')::uuid for update;
    if not found then raise exception 'unknown sku %', it->>'sku_id'; end if;
    if v_sku.triaged then raise exception 'SKU % is already triaged', v_sku.sku_code; end if;
    if jsonb_array_length(it->'shot_types') = 0 then
      raise exception 'SKU % needs at least one shot type', v_sku.sku_code;
    end if;
    -- batch + triaged flag set in one UPDATE: the lock trigger only blocks changes once triaged = true
    update skus set batch_id = coalesce((it->>'batch_id')::uuid, batch_id),
                    triaged = true, triaged_by = auth.uid(), triaged_at = now()
     where id = v_sku.id;
    perform log_transition('sku', v_sku.id, 'ingested', 'triaged', auth.uid());
    for st in select jsonb_array_elements_text(it->'shot_types') loop
      insert into shots (sku_id, shot_type, creator_id)
      values (v_sku.id, st::shot_type_enum, nullif(it->>'creator_id','')::uuid)
      on conflict (sku_id, shot_type) do nothing
      returning id into v_shot_id;
      if v_shot_id is not null then
        perform log_transition('shot', v_shot_id, null, 'in_production', auth.uid());
      end if;
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Review: approve or reject the pending version of an in_review shot
create or replace function review_shot(
  p_version_id uuid, p_approve boolean,
  p_reason reject_reason_enum default null, p_comment text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v shot_versions; s shots;
begin
  perform require_role('approver');
  select * into v from shot_versions where id = p_version_id for update;
  if not found then raise exception 'version not found'; end if;
  select * into s from shots where id = v.shot_id for update;
  if s.status <> 'in_review' or v.review_status <> 'pending' or v.version_no <> s.current_version then
    raise exception 'this version is not awaiting review';
  end if;
  if p_approve then
    update shot_versions set review_status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id = v.id;
    update shots set status='approved' where id = s.id;
    perform log_transition('shot', s.id, 'in_review', 'approved', auth.uid(), 'v' || v.version_no);
  else
    if p_reason is null then raise exception 'a reject reason is required'; end if;
    update shot_versions set review_status='rejected', reject_reason=p_reason, reject_comment=p_comment,
           reviewed_by=auth.uid(), reviewed_at=now() where id = v.id;
    update shots set status='in_production' where id = s.id;
    perform log_transition('shot', s.id, 'in_review', 'in_production', auth.uid(),
                           'rejected v' || v.version_no || ': ' || p_reason::text);
  end if;
end $$;

-- Routing: approved shot -> PDP and/or performance (campaign name required for performance)
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
    insert into routings (shot_id, destination, campaign_name, routed_by)
    values (p_shot_id, d, case when d = 'performance' then trim(p_campaign) end, auth.uid())
    on conflict (shot_id, destination) do nothing
    returning id into rid;
    if rid is not null then
      perform log_transition('routing', rid, null, 'pending', auth.uid(), d::text);
    end if;
  end loop;
end $$;

-- Output: PDP / performance marks their routing done; all done => shot done
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
  if r.status = 'done' then return; end if;
  update routings set status='done', completed_by=auth.uid(), completed_at=now() where id = r.id;
  perform log_transition('routing', r.id, 'pending', 'done', auth.uid(), r.destination::text);
  if not exists (select 1 from routings where shot_id = r.shot_id and status <> 'done') then
    update shots set status='done' where id = r.shot_id and status = 'approved';
    if found then perform log_transition('shot', r.shot_id, 'approved', 'done', auth.uid()); end if;
  end if;
end $$;

grant execute on function create_batch, triage_skus, review_shot, route_shot, complete_routing to authenticated;
