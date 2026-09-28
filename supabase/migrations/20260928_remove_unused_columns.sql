-- Remove columns that are no longer part of the FCM SaaS data model.
-- Keep messages.status because the scheduler and History use it to track
-- scheduled/sending/sent/failed/canceled lifecycle states.

alter table if exists public.firebase_apps
  drop column if exists package_name;

alter table if exists public.messages
  drop column if exists format,
  drop column if exists data_app_url,
  drop column if exists data_title,
  drop column if exists data_short_desc,
  drop column if exists data_long_desc,
  drop column if exists data_icon,
  drop column if exists data_feature;
