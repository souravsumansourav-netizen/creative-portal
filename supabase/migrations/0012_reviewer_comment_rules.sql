-- Reviewer comment rules:
--   * The reviewer's FIRST response on a shot must be a decision (approve, or reject with a comment).
--   * Once a decision exists, the reviewer may post free comments (replies / clarifications). Comments never
--     change a shot's status; only approve / reject do.
-- Variation uploads: one comment can accompany several new versions (version_id = the first, version_count = how many).

alter table shot_comments add column version_count int not null default 1;

create or replace function reviewer_can_comment(p_shot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shot_versions v
                 where v.shot_id = p_shot and v.review_status in ('approved', 'rejected'))
$$;

drop policy if exists comments_approver_insert on shot_comments;
create policy comments_approver_insert on shot_comments for insert
  with check (auth_role() = 'approver' and author_id = auth.uid() and tag is null and reviewer_can_comment(shot_id));
