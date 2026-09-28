-- Remove notification analytics columns that are not collected by the current FCM SaaS client apps.
-- Sent/delivery tracking remains unchanged.

alter table if exists public.messages
  drop column if exists impressions,
  drop column if exists opened,
  drop column if exists open_rate,
  drop column if exists dismissed,
  drop column if exists dismiss_rate;
