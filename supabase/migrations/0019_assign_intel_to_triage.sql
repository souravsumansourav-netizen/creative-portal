-- Assign selected SKUs from /intelligence directly into Batch 1 Triage (approver / uploader / admin).
-- Skips any SKU already present in Triage (triaged = false) so duplicates are never created.
create or replace function assign_intel_to_triage(p_codes text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  clean text[];
  to_insert text[];
  given int;
  inserted_count int := 0;
  skipped_count int := 0;
  b1 uuid;
  up uuid;
begin
  perform require_role('approver', 'uploader');

  select array_agg(code order by ord) into clean from (
    select distinct on (upper(c)) upper(c) as code, ord
    from (select trim(c) as c, ord from unnest(p_codes) with ordinality as t(c, ord)) x
    where c <> ''
    order by upper(c), ord
  ) y;

  given := coalesce(cardinality(clean), 0);
  if given = 0 then raise exception 'no SKU codes provided'; end if;

  select array_agg(c order by o) into to_insert
  from unnest(clean) with ordinality as t(c, o)
  where not exists (
    select 1 from skus s where upper(s.sku_code) = c and s.triaged = false
  );

  inserted_count := coalesce(cardinality(to_insert), 0);
  skipped_count := given - inserted_count;

  if inserted_count = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', skipped_count);
  end if;

  perform pg_advisory_xact_lock(hashtext('batches_seq'));
  select id into b1 from batches where batch_no = 1;
  if b1 is null then
    insert into batches (batch_no, created_by) values (1, auth.uid()) returning id into b1;
    perform log_transition('batch', b1, null, 'created', auth.uid());
  end if;

  insert into uploads (uploaded_by, file_name, sku_count)
  values (auth.uid(), 'Intelligence Discovery', inserted_count)
  returning id into up;

  with ins as (
    insert into skus (sku_code, upload_id, batch_id, triaged)
    select c, up, b1, false from unnest(to_insert) with ordinality as t(c, o) order by o
    returning id
  )
  insert into transitions (entity_type, entity_id, from_state, to_state, actor, note)
  select 'sku', id, null, 'ingested', auth.uid(), 'intelligence ' || up from ins;

  return jsonb_build_object('upload_id', up, 'inserted', inserted_count, 'skipped', skipped_count);
end $$;

grant execute on function assign_intel_to_triage to authenticated;

