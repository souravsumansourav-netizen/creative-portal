-- 1) Rename batches: one or many at once (approver / admin). A blank name goes back to the plain "Batch N" label.
create or replace function rename_batches(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; b batches; new_name text; n int := 0;
begin
  perform require_role('approver');
  for it in select * from jsonb_array_elements(p_items) loop
    select * into b from batches where id = (it->>'id')::uuid for update;
    if not found then continue; end if;
    new_name := nullif(left(trim(coalesce(it->>'name', '')), 60), '');
    if new_name is distinct from b.name then
      update batches set name = new_name where id = b.id;
      perform log_transition('batch', b.id, 'named', 'renamed', auth.uid(),
                             coalesce(b.name, 'Batch ' || b.batch_no) || ' -> ' || coalesce(new_name, 'Batch ' || b.batch_no));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- 2) Paste SKUs (one or many) instead of an Excel file. Same result as the Excel ingest: an upload + one SKU per code,
--    all in Batch 1 and untriaged, so they show up in Triage.
create or replace function ingest_skus(p_codes text[], p_label text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare clean text[]; given int; n int; b1 uuid; up uuid; existing int;
begin
  perform require_role('uploader');
  given := coalesce(cardinality(p_codes), 0);

  -- trim, drop blanks, drop repeats (case-insensitive), keep the order they were pasted in
  select array_agg(code order by ord) into clean from (
    select distinct on (lower(c)) c as code, ord
    from (select trim(c) as c, ord from unnest(p_codes) with ordinality as t(c, ord)) x
    where c <> ''
    order by lower(c), ord
  ) y;
  n := coalesce(cardinality(clean), 0);
  if n = 0 then raise exception 'no SKU codes found'; end if;
  if n > 5000 then raise exception 'too many SKUs at once (max 5000)'; end if;

  perform pg_advisory_xact_lock(hashtext('batches_seq'));
  select id into b1 from batches where batch_no = 1;
  if b1 is null then
    insert into batches (batch_no, created_by) values (1, auth.uid()) returning id into b1;
    perform log_transition('batch', b1, null, 'created', auth.uid());
  end if;

  select count(*) into existing from skus where lower(sku_code) in (select lower(x) from unnest(clean) x);

  insert into uploads (uploaded_by, file_name, sku_count)
  values (auth.uid(), coalesce(nullif(left(trim(coalesce(p_label, '')), 80), ''), 'Pasted SKUs'), n)
  returning id into up;

  with ins as (
    insert into skus (sku_code, upload_id, batch_id, triaged)
    select c, up, b1, false from unnest(clean) with ordinality as t(c, o) order by o
    returning id
  )
  insert into transitions (entity_type, entity_id, from_state, to_state, actor, note)
  select 'sku', id, null, 'ingested', auth.uid(), 'upload ' || up from ins;

  return jsonb_build_object('upload_id', up, 'sku_count', n, 'duplicates_skipped', given - n, 'already_in_portal', existing);
end $$;

grant execute on function rename_batches, ingest_skus to authenticated;
