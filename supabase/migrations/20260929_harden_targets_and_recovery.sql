-- Hardening for multi-app broadcasting.
--
-- 1. Deleting a Firebase app must not rewrite the history of past broadcasts.
--    message_targets.app_id used ON DELETE CASCADE, which silently removed the
--    target row (messages.total_apps_targeted still counted it). Keep the row,
--    null the link, and snapshot the app name so History can still show it.
-- 2. Stale-job recovery now also covers "send now" messages (scheduled_at IS
--    NULL), which previously stayed in `sending` forever if the request that
--    was dispatching them was killed by a platform timeout.

alter table public.message_targets
  add column if not exists app_name text;

update public.message_targets mt
set app_name = fa.name
from public.firebase_apps fa
where fa.id = mt.app_id
  and mt.app_name is null;

alter table public.message_targets
  alter column app_id drop not null;

alter table public.message_targets
  drop constraint if exists message_targets_app_id_fkey;

alter table public.message_targets
  add constraint message_targets_app_id_fkey
  foreign key (app_id) references public.firebase_apps(id) on delete set null;

create or replace function public.claim_scheduled_messages(p_limit integer default 25)
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recover jobs whose worker died mid-run. The processors touch updated_at
  -- before every target, so 10 quiet minutes means the worker is gone.
  -- "Send now" rows have no scheduled_at; make them immediately due.
  update public.messages
  set status = 'scheduled',
      scheduled_at = coalesce(scheduled_at, now()),
      updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '10 minutes';

  return query
  with due as (
    select id
    from public.messages
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now()
    order by scheduled_at asc, created_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.messages m
  set status = 'sending',
      updated_at = now()
  from due
  where m.id = due.id
  returning m.*;
end;
$$;

revoke all on function public.claim_scheduled_messages(integer) from public;
revoke all on function public.claim_scheduled_messages(integer) from anon;
revoke all on function public.claim_scheduled_messages(integer) from authenticated;
grant execute on function public.claim_scheduled_messages(integer) to service_role;
