-- Remove deleted-app target rows from dashboard history without deleting
-- multi-app broadcast records that still have other targets.
--
-- The app DELETE API already performs this cleanup transactionally for new
-- deletions. This migration cleans up targets created under the old
-- ON DELETE SET NULL behavior and changes the FK to CASCADE so direct app
-- deletion cannot leave orphaned dashboard targets.

create temp table _deleted_app_message_ids (
  message_id uuid primary key
) on commit drop;

insert into _deleted_app_message_ids(message_id)
select distinct message_id
from public.message_targets
where app_id is null;

delete from public.message_targets
where app_id is null;

delete from public.messages m
where m.id in (select message_id from _deleted_app_message_ids)
  and not exists (
    select 1
    from public.message_targets mt
    where mt.message_id = m.id
  );

with totals as (
  select
    mt.message_id,
    count(*)::integer as total_apps_targeted,
    count(*) filter (where mt.status = 'sent')::integer as total_sent,
    count(*) filter (where mt.status = 'failed')::integer as total_failed
  from public.message_targets mt
  where mt.message_id in (select message_id from _deleted_app_message_ids)
  group by mt.message_id
)
update public.messages m
set
  total_apps_targeted = t.total_apps_targeted,
  total_sent = t.total_sent,
  total_failed = t.total_failed,
  status = case
    when m.status in ('draft', 'scheduled', 'sending', 'canceled') then m.status
    when t.total_failed = 0 then 'sent'
    when t.total_sent = 0 then 'failed'
    else 'partial_failure'
  end,
  updated_at = now()
from totals t
where m.id = t.message_id;

alter table public.message_targets
  drop constraint if exists message_targets_app_id_fkey;

alter table public.message_targets
  add constraint message_targets_app_id_fkey
  foreign key (app_id) references public.firebase_apps(id) on delete cascade;
