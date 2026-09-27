-- Run this AFTER deploying the Edge Function and setting the secrets described
-- in README.md. Replace the two placeholders before running.
--
-- Required Vault secrets:
--   fcm_scheduler_project_url
--   fcm_scheduler_cron_secret
--
-- pg_cron and pg_net are enabled by the migration.

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'fcm_scheduler_project_url'
);

select vault.create_secret(
  'REPLACE_WITH_YOUR_FCM_CRON_SECRET',
  'fcm_scheduler_cron_secret'
);

select cron.unschedule('process-scheduled-fcm')
where exists (
  select 1 from cron.job where jobname = 'process-scheduled-fcm'
);

select cron.schedule(
  'process-scheduled-fcm',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'fcm_scheduler_project_url'
      ) || '/functions/v1/process-scheduled-fcm',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'fcm_scheduler_cron_secret'
        )
      ),
      body := jsonb_build_object('triggered_at', now())
    ) as request_id;
  $$
);
