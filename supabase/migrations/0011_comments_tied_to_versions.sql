-- A rejection now posts its comment into the shot's thread automatically, tied to the rejected version.
-- A creator's reply that comes with a new image is tied to that new version.
alter table shot_comments
  add column version_id uuid references shot_versions(id) on delete cascade,
  add column tag text check (tag in ('rejected', 'resubmitted'));
create index on shot_comments (version_id);

-- The 'rejected' tag is written only by the review functions below (they bypass RLS); users can't forge it.
drop policy if exists comments_approver_insert on shot_comments;
drop policy if exists comments_creator_insert  on shot_comments;
create policy comments_approver_insert on shot_comments for insert
  with check (auth_role() = 'approver' and author_id = auth.uid() and tag is null);
create policy comments_creator_insert on shot_comments for insert
  with check (auth_role() = 'creator' and author_id = auth.uid() and creator_can_comment(shot_id)
              and (tag is null or tag = 'resubmitted'));

-- Rejections that already exist become thread comments too (reason text stands in when no comment was written)
insert into shot_comments (shot_id, author_id, body, created_at, version_id, tag)
select v.shot_id, v.reviewed_by,
       coalesce(nullif(trim(v.reject_comment), ''), initcap(replace(v.reject_reason::text, '_', ' '))),
       coalesce(v.reviewed_at, now()), v.id, 'rejected'
from shot_versions v
where v.review_status = 'rejected' and v.reviewed_by is not null
  and coalesce(v.reject_comment, '') not like 'Not selected%';

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
    -- the rejection comment goes into the thread, tied to this version
    insert into shot_comments (shot_id, author_id, body, version_id, tag)
    values (s.id, auth.uid(),
            coalesce(nullif(trim(p_comment), ''), initcap(replace(p_reason::text, '_', ' '))),
            v.id, 'rejected');
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
  with u as (
    update shot_versions set review_status='rejected', reject_reason=p_reason, reject_comment=p_comment,
           reviewed_by=auth.uid(), reviewed_at=now()
     where shot_id = s.id and review_status = 'pending'
    returning id
  )
  insert into shot_comments (shot_id, author_id, body, version_id, tag)
  select s.id, auth.uid(), coalesce(nullif(trim(p_comment), ''), initcap(replace(p_reason::text, '_', ' '))), id, 'rejected' from u;
  get diagnostics n = row_count;
  update shots set status='in_production' where id = s.id;
  perform log_transition('shot', s.id, 'in_review', 'in_production', auth.uid(),
                         'rejected ' || n || ' version(s): ' || p_reason::text);
end $$;

grant execute on function review_shot, reject_all_variations to authenticated;
