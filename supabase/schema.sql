-- ============================================================================
-- FCM Broadcast — database schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. firebase_apps — one row per Firebase project you can broadcast to
-- ----------------------------------------------------------------------------
create table if not exists firebase_apps (
  id                        uuid primary key default gen_random_uuid(),
  -- Custom app login is used; user_id is an internal owner UUID, not Supabase Auth.
  name                      text not null,
  project_id                text not null,
  app_icon_url              text,
  default_topic             text not null default '',
  service_account_encrypted text not null,
  encryption_iv             text not null,
  encryption_tag            text not null,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists firebase_apps_user_id_idx on firebase_apps(user_id);

-- ----------------------------------------------------------------------------
-- 2. messages — one row per broadcast (draft, scheduled, or sent)
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id                    uuid primary key default gen_random_uuid(),
  -- Custom app login is used; user_id is an internal owner UUID, not Supabase Auth.
  topic                 text not null default '',

  notification_title    text,
  notification_body     text,
  notification_image    text,

  status                text not null default 'draft'
                          check (status in ('draft', 'scheduled', 'sending', 'sent', 'partial_failure', 'failed', 'canceled')),
  scheduled_at          timestamptz,
  sent_at               timestamptz,

  total_apps_targeted   integer not null default 0,
  total_sent            integer not null default 0,
  total_failed          integer not null default 0,
  sent_count            integer not null default 0,
  delivered             integer not null default 0,
  delivery_rate         numeric(5,2) not null default 0,
  delivery_failed       integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists messages_user_id_idx on messages(user_id);
create index if not exists messages_status_idx on messages(status);
create index if not exists messages_scheduled_at_idx on messages(scheduled_at);

-- ----------------------------------------------------------------------------
-- 3. message_targets — one row per (message, app) pair, tracks delivery
-- ----------------------------------------------------------------------------
create table if not exists message_targets (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages(id) on delete cascade,
  app_id          uuid not null references firebase_apps(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  fcm_message_id  text,
  error_message   text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists message_targets_message_id_idx on message_targets(message_id);
create index if not exists message_targets_app_id_idx on message_targets(app_id);
create unique index if not exists message_targets_unique_pair on message_targets(message_id, app_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists firebase_apps_set_updated_at on firebase_apps;
create trigger firebase_apps_set_updated_at
  before update on firebase_apps
  for each row execute function set_updated_at();

drop trigger if exists messages_set_updated_at on messages;
create trigger messages_set_updated_at
  before update on messages
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security — every table is owner-scoped
-- ----------------------------------------------------------------------------
alter table firebase_apps enable row level security;
alter table messages enable row level security;
alter table message_targets enable row level security;

drop policy if exists "select own apps" on firebase_apps;
create policy "select own apps" on firebase_apps
  for select using (auth.uid() = user_id);

drop policy if exists "insert own apps" on firebase_apps;
create policy "insert own apps" on firebase_apps
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own apps" on firebase_apps;
create policy "update own apps" on firebase_apps
  for update using (auth.uid() = user_id);

drop policy if exists "delete own apps" on firebase_apps;
create policy "delete own apps" on firebase_apps
  for delete using (auth.uid() = user_id);

drop policy if exists "select own messages" on messages;
create policy "select own messages" on messages
  for select using (auth.uid() = user_id);

drop policy if exists "insert own messages" on messages;
create policy "insert own messages" on messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own messages" on messages;
create policy "update own messages" on messages
  for update using (auth.uid() = user_id);

drop policy if exists "delete own messages" on messages;
create policy "delete own messages" on messages
  for delete using (auth.uid() = user_id);

drop policy if exists "select own message targets" on message_targets;
create policy "select own message targets" on message_targets
  for select using (
    exists (select 1 from messages m where m.id = message_id and m.user_id = auth.uid())
  );

drop policy if exists "insert own message targets" on message_targets;
create policy "insert own message targets" on message_targets
  for insert with check (
    exists (select 1 from messages m where m.id = message_id and m.user_id = auth.uid())
  );

drop policy if exists "update own message targets" on message_targets;
create policy "update own message targets" on message_targets
  for update using (
    exists (select 1 from messages m where m.id = message_id and m.user_id = auth.uid())
  );

-- Note: the app's write paths for messages/targets go through API routes
-- using the Supabase SERVICE ROLE key (server-side only), which bypasses RLS
-- by design — these policies are what protect direct client-side/API access
-- using the anon key, e.g. if you later add client-side reads.
