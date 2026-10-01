-- Real-time FCM analytics tracking
alter table public.messages
  add column if not exists analytics_label text;

update public.messages
set analytics_label = 'fcm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
where analytics_label is null;

alter table public.messages
  alter column analytics_label set default ('fcm_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

alter table public.messages
  alter column analytics_label set not null;

create unique index if not exists messages_analytics_label_idx
  on public.messages(analytics_label);

create table if not exists public.fcm_analytics_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  message_target_id uuid not null references public.message_targets(id) on delete cascade,
  app_id uuid references public.firebase_apps(id) on delete cascade,
  analytics_label text not null,
  installation_id text not null,
  event_type text not null check (event_type in ('received','shown','opened','dismissed')),
  event_timestamp timestamptz not null default now(),
  app_version text,
  android_version text,
  device_model text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique(message_target_id, installation_id, event_type)
);

create index if not exists fcm_analytics_events_message_id_idx
  on public.fcm_analytics_events(message_id);
create index if not exists fcm_analytics_events_target_id_idx
  on public.fcm_analytics_events(message_target_id);
create index if not exists fcm_analytics_events_label_idx
  on public.fcm_analytics_events(analytics_label);
create index if not exists fcm_analytics_events_created_at_idx
  on public.fcm_analytics_events(created_at desc);

create table if not exists public.fcm_analytics_summary (
  message_target_id uuid primary key references public.message_targets(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  app_id uuid references public.firebase_apps(id) on delete cascade,
  delivered_count bigint not null default 0,
  received_count bigint not null default 0,
  shown_count bigint not null default 0,
  opened_count bigint not null default 0,
  dismissed_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists fcm_analytics_summary_message_id_idx
  on public.fcm_analytics_summary(message_id);

alter table public.fcm_analytics_events enable row level security;
alter table public.fcm_analytics_summary enable row level security;

drop policy if exists "select own analytics events" on public.fcm_analytics_events;
create policy "select own analytics events" on public.fcm_analytics_events
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "select own analytics summary" on public.fcm_analytics_summary;
create policy "select own analytics summary" on public.fcm_analytics_summary
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.user_id = auth.uid()
    )
  );
