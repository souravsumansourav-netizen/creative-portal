-- Dashboard views. Analytics derive from `transitions`; security_invoker => caller's RLS applies.

-- Stage tracker: shots per state per batch (current state = latest shot transition)
create or replace view v_batch_stage_counts with (security_invoker = true) as
with latest as (
  select distinct on (entity_id) entity_id as shot_id, to_state
  from transitions where entity_type = 'shot'
  order by entity_id, created_at desc, id
)
select b.id as batch_id, b.batch_no, l.to_state as stage, count(*)::int as shots
from latest l
join shots s on s.id = l.shot_id
join skus k on k.id = s.sku_id
join batches b on b.id = k.batch_id
group by b.id, b.batch_no, l.to_state;

create or replace view v_batch_sku_counts with (security_invoker = true) as
select b.id as batch_id, b.batch_no, b.name,
       count(k.id)::int as skus,
       count(k.id) filter (where not k.triaged)::int as untriaged
from batches b left join skus k on k.batch_id = b.id
group by b.id, b.batch_no, b.name;

-- Time to complete: first ingest transition of any SKU in batch -> last shot `done`
create or replace view v_batch_time_to_complete with (security_invoker = true) as
select b.id as batch_id, b.batch_no,
  (select min(t.created_at) from transitions t join skus k on k.id = t.entity_id
     where t.entity_type = 'sku' and t.to_state = 'ingested' and k.batch_id = b.id) as started_at,
  (select max(t.created_at) from transitions t
     join shots s on s.id = t.entity_id join skus k on k.id = s.sku_id
     where t.entity_type = 'shot' and t.to_state = 'done' and k.batch_id = b.id) as last_done_at,
  (select count(*)::int from shots s join skus k on k.id = s.sku_id where k.batch_id = b.id) as shots_total,
  (select count(*)::int from shots s join skus k on k.id = s.sku_id
     where k.batch_id = b.id and s.status = 'done') as shots_done
from batches b;

-- Stage aging: average time a shot spends in each state before leaving it
create or replace view v_stage_aging with (security_invoker = true) as
with spans as (
  select to_state as stage,
         lead(created_at) over (partition by entity_id order by created_at, id) - created_at as dwell
  from transitions where entity_type = 'shot'
)
select stage,
       count(*)::int as samples,
       extract(epoch from avg(dwell))::float8 as avg_seconds
from spans where dwell is not null
group by stage;

-- Per-creator rejection rate: rejections (in_review -> in_production) over submissions
create or replace view v_creator_rejection with (security_invoker = true) as
select p.id as creator_id, coalesce(p.full_name, p.email) as creator,
       count(*) filter (where t.to_state = 'submitted')::int as submissions,
       count(*) filter (where t.from_state = 'in_review' and t.to_state = 'in_production')::int as rejections
from transitions t
join shots s on s.id = t.entity_id
join profiles p on p.id = s.creator_id
where t.entity_type = 'shot'
group by p.id, p.full_name, p.email;
