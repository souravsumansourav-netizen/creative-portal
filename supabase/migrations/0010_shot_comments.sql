-- Comment thread per shot (Jira-style). Rejections stay on shot_versions; this table holds the conversation.
create table shot_comments (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references shots(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index on shot_comments (shot_id, created_at);

alter table shot_comments enable row level security;

create policy admin_all on shot_comments for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- a creator may comment on her own shots until they are done
create or replace function creator_can_comment(p_shot uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shots s
                 where s.id = p_shot and s.creator_id = auth.uid() and s.status <> 'done')
$$;

create policy comments_approver_select on shot_comments for select using (auth_role() = 'approver');
create policy comments_approver_insert on shot_comments for insert
  with check (auth_role() = 'approver' and author_id = auth.uid());
create policy comments_creator_select on shot_comments for select
  using (auth_role() = 'creator' and creator_owns_shot(shot_id));
create policy comments_creator_insert on shot_comments for insert
  with check (auth_role() = 'creator' and author_id = auth.uid() and creator_can_comment(shot_id));

alter publication supabase_realtime add table shot_comments;
