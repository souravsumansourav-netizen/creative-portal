-- PDP routings are released automatically when a shot is approved. Only performance routings wait for the
-- admin/approver to release them from the Routing page.

-- anything already planned for PDP goes out now
with u as (
  update routings set released = true, released_by = coalesce(released_by, routed_by), released_at = now()
   where destination = 'pdp' and not released
  returning id
)
insert into transitions (entity_type, entity_id, from_state, to_state, actor, note)
select 'routing', id, 'planned', 'pending', null, 'pdp (auto-release migration)' from u;

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
    insert into routings (shot_id, destination, campaign_name, routed_by, released, released_by, released_at)
    values (v_shot, d, case when d = 'performance' then trim(p_campaign) end, auth.uid(),
            d = 'pdp', case when d = 'pdp' then auth.uid() end, case when d = 'pdp' then now() end)
    on conflict (shot_id, destination) do nothing
    returning id into rid;
    if rid is not null then
      perform log_transition('routing', rid, null, case when d = 'pdp' then 'pending' else 'planned' end, auth.uid(), d::text);
    end if;
  end loop;
end $$;

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
    insert into routings (shot_id, destination, campaign_name, routed_by, released, released_by, released_at)
    values (p_shot_id, d, case when d = 'performance' then trim(p_campaign) end, auth.uid(),
            d = 'pdp', case when d = 'pdp' then auth.uid() end, case when d = 'pdp' then now() end)
    on conflict (shot_id, destination) do nothing
    returning id into rid;
    if rid is not null then
      perform log_transition('routing', rid, null, case when d = 'pdp' then 'pending' else 'planned' end, auth.uid(), d::text);
    end if;
  end loop;
end $$;

grant execute on function approve_shot, route_shot to authenticated;
