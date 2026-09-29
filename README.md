# FCM Broadcast

A lightweight Firebase Cloud Messaging dashboard for managing multiple apps, composing notifications, sending immediately, and scheduling FCM sends through Supabase Cron + Edge Functions.

Built with Next.js 14, TypeScript, Supabase/Postgres, Firebase Admin for immediate sends, and the Firebase Cloud Messaging HTTP v1 API inside the scheduled Edge Function.

## Features

- Password-based dashboard login
- Firebase app management with encrypted service-account storage
- Multi-app notification composer
- Dynamic mobile Live Preview
- Send now
- Scheduled FCM sends
- Scheduled delivery status written back to Supabase
- History with per-app delivery results
- Supabase `pg_cron` + `pg_net` scheduler
- Supabase Edge Function processor
- Atomic job claiming to prevent duplicate scheduled sends

## Scheduling architecture

Scheduled messages do **not** depend on the browser, Vercel, Render, Bree.js, Redis, or an in-process timer.

```
/compose
   |
   | POST /api/messages (action=schedule)
   v
Supabase PostgreSQL
messages.status = scheduled
messages.scheduled_at = requested time
   |
   | pg_cron every minute
   v
pg_net
   |
   | POST
   v
Supabase Edge Function
process-scheduled-fcm
   |
   | claim_scheduled_messages()
   | status -> sending
   v
Firebase Cloud Messaging HTTP v1
   |
   +--> target sent
   +--> target failed
   |
   v
messages.status = sent / partial_failure / failed
```

Supabase documents using `pg_cron` with `pg_net` to invoke Edge Functions on a recurring schedule, including an every-minute schedule. See the official documentation: https://supabase.com/docs/guides/functions/schedule-functions

The scheduler uses an atomic Postgres claim function with `FOR UPDATE SKIP LOCKED`, so overlapping cron invocations cannot claim the same scheduled message. Jobs stuck in `sending` for more than 10 minutes are returned to `scheduled` automatically.

## Project structure

```
fcm/
├── app/
│   ├── (dashboard)/
│   │   ├── apps/
│   │   ├── compose/
│   │   ├── dashboard/
│   │   └── history/
│   ├── api/
│   │   ├── apps/
│   │   ├── cron/
│   │   └── messages/
│   ├── login/
│   └── page.tsx
├── components/
├── lib/
├── supabase/
│   ├── functions/
│   │   ├── .env.example
│   │   └── process-scheduled-fcm/
│   │       └── index.ts
│   ├── migrations/
│   │   └── 20260927_fcm_scheduler.sql
│   ├── config.toml
│   ├── cron-setup.sql
│   └── schema.sql
├── types/
├── middleware.ts
├── vercel.json
└── README.md
```

## 1. Database setup

The existing database schema is in:

```
supabase/schema.sql
```

Run it in Supabase SQL Editor if the project has not been initialized yet.

Then run, in order:

```
supabase/migrations/20260927_fcm_scheduler.sql
supabase/migrations/20260929_harden_targets_and_recovery.sql
```

**Run the second migration before deploying this version of the app.** The app now
writes `message_targets.app_name`, which does not exist until the migration is applied.

This migration:

- enables `pg_cron`
- enables `pg_net`
- creates `claim_scheduled_messages()`
- adds atomic scheduled-message claiming
- recovers stale `sending` jobs after 10 minutes

The `20260929_harden_targets_and_recovery.sql` migration additionally:

- changes `message_targets.app_id` from `ON DELETE CASCADE` to `ON DELETE SET NULL` and
  stores an `app_name` snapshot, so deleting an app no longer erases it from past broadcasts
- extends stale-job recovery to "Send now" messages that were killed mid-send

## 2. Required Vercel / Next.js environment variables

Keep the existing application variables:

```bash
# Dashboard login. Server-side only: never prefix the password with NEXT_PUBLIC_.
EMAIL=admin@example.com
PASSWORD=your-login-password

# Optional: prefill the email field on /login (the email is not secret).
NEXT_PUBLIC_EMAIL=admin@example.com

DATABASE_URL=your-supabase-postgres-connection-string

ENCRYPTION_SECRET_KEY=64-character-hex-string
```

> **Security:** `NEXT_PUBLIC_*` variables are compiled into the browser bundle and are
> readable by anyone who opens the site. Do **not** set `NEXT_PUBLIC_PASSWORD`. If you
> ever did in production, remove it, redeploy, and change `PASSWORD` (it is also the
> key that signs login sessions, so changing it signs everyone out).

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do **not** put Firebase service-account JSON into Vercel environment variables. The existing app encrypts the service-account JSON before storing it in the database.

## 3. Supabase Edge Function secrets

The scheduled processor runs inside Supabase, so these values must also exist as **Supabase Edge Function secrets**.

Set:

```text
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_SECRET_KEY
FCM_CRON_SECRET
```

### SUPABASE_SERVICE_ROLE_KEY

Use the Supabase server-side service-role key for the Edge Function only.

Do not put this key in browser/client code or GitHub.

### ENCRYPTION_SECRET_KEY

This must be the **same 64-character hex value used by the Next.js application**.

The Edge Function needs the same key because it decrypts the Firebase service-account JSON stored by the existing app.

### FCM_CRON_SECRET

The Edge Function accepts the secret under either name, `CRON_SECRET` or `FCM_CRON_SECRET`.
Use one, and store the same value in the Vault entry `fcm_scheduler_cron_secret`.

Generate a separate random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example:

```text
FCM_CRON_SECRET=replace-with-your-generated-secret
```

Never commit the real value.

Supabase Edge Function secrets can be configured from the Dashboard or with the Supabase CLI. See: https://supabase.com/docs/guides/functions/secrets

## 4. Deploy the Edge Function

Install/login to the Supabase CLI and link the repository to your Supabase project.

Then:

```bash
supabase functions deploy process-scheduled-fcm --project-ref YOUR_PROJECT_REF
```

Set the production secrets:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set ENCRYPTION_SECRET_KEY="YOUR_64_CHAR_HEX_KEY"
supabase secrets set FCM_CRON_SECRET="YOUR_CRON_SECRET"
```

You can verify the configured secret names with:

```bash
supabase secrets list
```

The values themselves should never be committed to this repository.

## 5. Configure Supabase Cron

Before running `supabase/cron-setup.sql`, replace:

```text
YOUR_PROJECT_REF
REPLACE_WITH_YOUR_FCM_CRON_SECRET
```

with your real values.

The script stores the project URL and cron secret in Supabase Vault and creates:

```text
process-scheduled-fcm
```

with:

```text
* * * * *
```

That means Supabase Cron invokes the Edge Function every minute.

Run the completed SQL in:

**Supabase Dashboard → SQL Editor**

File:

```text
supabase/cron-setup.sql
```

Supabase recommends Vault for credentials used by scheduled Edge Function calls: https://supabase.com/docs/guides/functions/schedule-functions

## 6. Important: Firebase Cloud Messaging API

The scheduled Edge Function sends through the Firebase Cloud Messaging HTTP v1 API.

Each Firebase app already has an encrypted service-account JSON stored in `firebase_apps`.

The service account must have permission to send FCM messages, and the Firebase Cloud Messaging API must be enabled for the target Firebase project.

Firebase's HTTP v1 API uses a short-lived OAuth 2.0 access token derived from the service account and sends to:

```text
POST https://fcm.googleapis.com/v1/projects/PROJECT_ID/messages:send
```

See the official Firebase documentation:

https://firebase.google.com/docs/cloud-messaging/send/v1-api

## 7. How scheduling works

When the user clicks **Schedule** in `/compose`:

```text
POST /api/messages
action = schedule
scheduledAt = selected ISO timestamp(s)
```

The Next.js API creates the message and target rows:

```text
messages.status = scheduled
message_targets.status = pending
```

The browser can then close. No timer remains in the browser.

Every minute:

```text
pg_cron
  -> pg_net
  -> process-scheduled-fcm
  -> claim due messages
  -> Firebase FCM
  -> update target status
  -> update message status
```

A successful message becomes:

```text
sent
```

Mixed target results become:

```text
partial_failure
```

If every target fails:

```text
failed
```

Individual target rows contain:

```text
pending
sent
failed
```

with the FCM message ID or error message where available.

## 8. Timezone

The database stores scheduled timestamps as `timestamptz`.

The browser converts the selected `datetime-local` value to an ISO timestamp before sending it to the API.

For example, Pakistan time (UTC+05:00):

```text
2026-09-27T20:30:00+05:00
```

The database compares the timestamp using its absolute instant, so the cron does not need to know the user's local timezone.

## 9. Vercel

Vercel is only responsible for the Next.js web application.

The old Vercel cron is no longer used for scheduled FCM processing. Scheduling is owned by Supabase Cron.

Deploy normally:

```bash
npm install
npm run build
npx vercel
```

Add the normal Next.js environment variables to Vercel.

Do not add the Supabase Edge Function's service-role key to browser-exposed variables.

## 10. Render

Render can still host the same Next.js application if needed. It is not responsible for scheduled FCM processing.

The Supabase Cron + Edge Function pipeline works independently of whether the web application is currently running.

## 11. Local development

```bash
npm install
npm run dev
```

For Edge Function local development, copy:

```text
supabase/functions/.env.example
```

to:

```text
supabase/functions/.env
```

and fill in real values.

Never commit:

```text
.env
.env.local
supabase/functions/.env
```

## 12. Test the scheduler

First create a notification from `/compose` scheduled for a time a few minutes in the future.

Then check:

**Supabase Dashboard → Cron → process-scheduled-fcm**

You should see a successful cron execution.

Then check:

**Supabase Dashboard → Table Editor → messages**

The message should progress:

```text
scheduled
  -> sending
  -> sent / partial_failure / failed
```

Open the message in the FCM dashboard History page to see per-app target results.

For debugging, also check:

**Supabase Dashboard → Edge Functions → process-scheduled-fcm → Logs**

## 13. Troubleshooting: "some apps did not get the notification"

The History page shows one row per app. `accepted` means **Google's FCM API accepted the
request**. It does not mean a device received it. FCM accepts a topic message even when
nobody is subscribed to that topic, so an app can be `accepted` and still deliver nothing.

If an app shows `accepted` but users get nothing:

1. The app's stored **topic** must match, exactly and case-sensitively, the topic that
   the mobile app passes to `subscribeToTopic(...)`.
2. Send a test from **Firebase Console -> Messaging** to the same topic. If that also
   fails, the problem is on the device or app side (not subscribed, notification
   permission denied on Android 13+, or a missing APNs key for iOS), not in this dashboard.
3. Confirm the app's service account belongs to the same Firebase project as the
   mobile app (`project_id` on the Apps page).

If an app shows `failed`, the reason is stored on the target and shown in History.
Inactive apps are hidden from Compose; Compose tells you how many are hidden.

## 14. Security

- Never commit Firebase service-account JSON.
- Never commit `SUPABASE_SERVICE_ROLE_KEY`.
- Never commit `FCM_CRON_SECRET`.
- Never commit `ENCRYPTION_SECRET_KEY`.
- The scheduled Edge Function is not public; it requires the private cron secret.
- The Edge Function uses the server-side Supabase service-role key to process jobs and bypass RLS.
- Cron credentials are stored in Supabase Vault rather than source control.

## Useful commands

```bash
npm run dev
npm run build
npm run start

supabase functions deploy process-scheduled-fcm --project-ref YOUR_PROJECT_REF
supabase secrets list
```
