-- Realtime FCM analytics
-- Client apps report received/shown/opened/dismissed events to the SaaS API.

alter table public.messages
  add column if not exists analytics_label text;

update public.messages
set analytics_label = 'msg-' || replace(id::text, '-', '')
where analytics_label is null or analytics_label = '';

alter table public.messages
  alter column analytics_label set not null;

alter table public.messages
  add constraint messages_analytics_label_format
  check (analytics_label ~ '^[A-Za-z0-9_.~%-]{1,50}$');

create table if not exists public.fcm_analytics_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  message_target_id uuid not null references public.message_targets(id) on delete cascade,
  app_id uuid null references public.firebase_apps(id) on delete set null,
  analytics_label text not null,
  installation_id text not null,
  event_type text not null check (event_type in ('received','shown','opened','dismissed')),
  event_timestamp timestamptz not null default now(),
  app_version text null,
  android_version text null,
  device_model text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  unique (message_target_id, installation_id, event_type)
);

create index if not exists fcm_analytics_events_message_id_idx
  on public.fcm_analytics_events(message_id);

create index if not exists fcm_analytics_events_target_id_idx
  on public.fcm_analytics_events(message_target_id);

create table if not exists public.fcm_analytics_summary (
  message_target_id uuid primary key references public.message_targets(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  app_id uuid null references public.firebase_apps(id) on delete set null,
  received_count integer not null default 0,
  delivered_count integer not null default 0,
  shown_count integer not null default 0,
  opened_count integer not null default 0,
  dismissed_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists fcm_analytics_summary_message_id_idx
  on public.fcm_analytics_summary(message_id);

alter table public.message_targets
  add column if not exists analytics_label text;

update public.message_targets mt
set analytics_label = m.analytics_label
from public.messages m
where m.id = mt.message_id
  and (mt.analytics_label is null or mt.analytics_label = '');

create index if not exists message_targets_analytics_label_idx
  on public.message_targets(analytics_label);
