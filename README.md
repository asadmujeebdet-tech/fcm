# FCM Broadcast

A lightweight Firebase Cloud Messaging dashboard for managing multiple apps,
setting up per-app topics, composing notification campaigns, and tracking
send results from one place.

Built with Next.js 14, TypeScript, Supabase, and Firebase Admin.

## Features

- Supabase email/password authentication with protected dashboard routes
- App management with encrypted Firebase service account storage
- Notification-only composer for title, message, and image URL
- Multi-app targeting and optional scheduled sends
- Delivery tracking and history view
- Responsive layout for desktop and mobile use

## Project structure

```bash
fcm-saas/
├── app/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── apps/
│   │   ├── compose/
│   │   └── history/
│   ├── api/
│   │   ├── apps/
│   │   ├── cron/
│   │   └── messages/
│   ├── login/
│   ├── signup/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── lib/
├── supabase/
├── types/
├── middleware.ts
├── next.config.js
├── package.json
├── tsconfig.json
├── vercel.json
├── .gitignore
├── README.md
└── .env.local
```

## 1. Setup the database

1. Create a Supabase project.
2. Open the SQL editor and run the contents of `supabase/schema.sql`.
3. Make sure your auth provider includes email/password login.

## 2. Local environment variables

Create a `.env.local` file in the project root with values like:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_EMAIL=admin@example.com
NEXT_PUBLIC_PASSWORD=super-secret-password
ENCRYPTION_SECRET_KEY=64-char-hex-string
CRON_SECRET=long-random-string
```

Generate `ENCRYPTION_SECRET_KEY` and `CRON_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> The `NEXT_PUBLIC_EMAIL` and `NEXT_PUBLIC_PASSWORD` values are used only as default login fields on the sign-in page. The actual user still has to exist in your Supabase authentication table.

## 3. Install and start locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

## 4. Deploy to Vercel

```bash
npm install
npm run build
npx vercel
```

Add the same environment variables to your Vercel project settings, then redeploy.

## 5. Deploy to Render

1. Create a new Web Service from this repository.
2. Use the build command:

```bash
npm install && npm run build
```

3. Use the start command:

```bash
npm run start
```

4. Add the same environment variables from `.env.local` in Render's environment section.

## 6. Scheduling

Scheduled messages are processed by `/api/cron/process-scheduled`. If you host on Vercel, the cron job in `vercel.json` will call the route automatically. For other hosts or self-hosting, trigger it with a scheduler using a matching `Authorization: Bearer <CRON_SECRET>` header.

Example:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  http://localhost:3000/api/cron/process-scheduled
```

## Security notes

- Firebase service account JSON is encrypted before it is stored.
- All app and message requests are protected by Supabase auth and row-level security.
- Keep the service role key server-side only.

## Useful commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```
