-- Scheduled FCM processing for Supabase Cron + Edge Functions.
-- The Edge Function claims due rows atomically through this function.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.claim_scheduled_messages(p_limit integer default 25)
returns setof public.messages
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Recover jobs that were claimed by a function invocation that died.
  update public.messages
  set status = 'scheduled',
      updated_at = now()
  where status = 'sending'
    and updated_at < now() - interval '10 minutes'
    and scheduled_at <= now();

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
