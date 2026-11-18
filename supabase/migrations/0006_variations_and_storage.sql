-- Variations: a shot in review may hold several pending versions (variations).
--  * approve one  -> it is approved, every other pending variation is auto-rejected ("not selected"), shot -> approved
--  * reject one   -> only that variation is rejected; the shot goes back to production once none are pending
--  * reject all   -> every pending variation is rejected with one reason/comment, shot -> in_production

create or replace function review_shot(
  p_version_id uuid, p_approve boolean,
  p_reason reject_reason_enum default null, p_comment text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v shot_versions; s shots; pending_left int;
begin
  perform require_role('approver');
  select * into v from shot_versions where id = p_version_id for update;
  if not found then raise exception 'version not found'; end if;
  select * into s from shots where id = v.shot_id for update;
  if s.status <> 'in_review' or v.review_status <> 'pending' then
    raise exception 'this version is not awaiting review';
  end if;

  if p_approve then
    update shot_versions set review_status='approved', reviewed_by=auth.uid(), reviewed_at=now() where id = v.id;
    update shot_versions
       set review_status='rejected', reject_reason='other',
           reject_comment='Not selected: another variation was approved',
           reviewed_by=auth.uid(), reviewed_at=now()
     where shot_id = s.id and review_status = 'pending' and id <> v.id;
    update shots set status='approved' where id = s.id;
    perform log_transition('shot', s.id, 'in_review', 'approved', auth.uid(), 'v' || v.version_no);
  else
    if p_reason is null then raise exception 'a reject reason is required'; end if;
    update shot_versions set review_status='rejected', reject_reason=p_reason, reject_comment=p_comment,
           reviewed_by=auth.uid(), reviewed_at=now() where id = v.id;
    select count(*) into pending_left from shot_versions where shot_id = s.id and review_status = 'pending';
    if pending_left = 0 then
      update shots set status='in_production' where id = s.id;
      perform log_transition('shot', s.id, 'in_review', 'in_production', auth.uid(),
                             'rejected v' || v.version_no || ': ' || p_reason::text);
    end if;
  end if;
end $$;

create or replace function reject_all_variations(
  p_shot_id uuid, p_reason reject_reason_enum, p_comment text default null
) returns void language plpgsql security definer set search_path = public as $$
declare s shots; n int;
begin
  perform require_role('approver');
  if p_reason is null then raise exception 'a reject reason is required'; end if;
  select * into s from shots where id = p_shot_id for update;
  if not found or s.status <> 'in_review' then raise exception 'shot is not in review'; end if;
  update shot_versions set review_status='rejected', reject_reason=p_reason, reject_comment=p_comment,
         reviewed_by=auth.uid(), reviewed_at=now()
   where shot_id = s.id and review_status = 'pending';
  get diagnostics n = row_count;
  update shots set status='in_production' where id = s.id;
  perform log_transition('shot', s.id, 'in_review', 'in_production', auth.uid(),
                         'rejected ' || n || ' version(s): ' || p_reason::text);
end $$;

grant execute on function review_shot, reject_all_variations to authenticated;

-- Storage: total bytes of stored images (assets). Excludes temporary staging uploads and source Excel files.
create or replace function storage_used_bytes() returns bigint
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('approver');
  return (select coalesce(sum(size_bytes), 0)::bigint from assets);
end $$;
grant execute on function storage_used_bytes to authenticated;

create or replace view v_batch_storage with (security_invoker = true) as
select k.batch_id,
       coalesce(sum(a.size_bytes), 0)::bigint as bytes,
       count(a.id)::int as images
from skus k
join shots s on s.sku_id = k.id
join shot_versions v on v.shot_id = s.id
join assets a on a.id = v.asset_id
group by k.batch_id;
