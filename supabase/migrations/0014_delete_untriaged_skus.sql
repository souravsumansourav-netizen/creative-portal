-- Delete SKUs from Triage (approver / admin). Permanent. Only SKUs that are still in Triage (triaged = false)
-- can be deleted, so nothing that has already been assigned to a creator can be removed from here.
create or replace function delete_skus(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform require_role('approver');
  with gone as (
    delete from skus where id = any(p_ids) and triaged = false returning id
  )
  select count(*) into n from gone;
  return n;
end $$;
