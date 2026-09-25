# Orbit — FCM Workspace

A premium-style, database-free Firebase Cloud Messaging workspace built with Next.js 14, TypeScript, React, Tailwind CSS, and Firebase Admin. Add Firebase projects manually, compose one message for multiple projects, schedule sends, review per-app results, retry failures, and export delivery records.

All app credentials, message history, delivery logs, and settings are stored as authenticated AES-256-GCM encrypted JSON files under the data directory. It is server-only and ignored by Git. There is no database, Supabase, or external persistence service.

## Start locally

1. Install the project dependencies with npm install.
2. Copy .env.example to .env.local.
3. Replace ENCRYPTION_SECRET_KEY with a persistent secret generated using openssl rand -hex 32. Keep the same key when restarting or redeploying; without it, existing encrypted files cannot be decrypted.
4. Start the app using npm run dev and open http://localhost:3000.

The dashboard is at /dashboard. Add apps from the Firebase Apps page by typing app details and pasting or uploading each Firebase service account JSON. The private key is encrypted before it is saved and is never returned to the browser. Use the connection check to validate Firebase access.

## Features

- Manually manage and search Firebase apps, with active/inactive state and credential validation.
- Compose notification and data-only messages; select individual apps, all active apps, or a filtered group. Choose an FCM topic or a registration token as the delivery target.
- Preview notifications while writing and send now, save drafts, or schedule a future send.
- Process multi-app sends with bounded concurrency, per-app status, delivery history, and retries for failed recipients (up to three attempts).
- Review summary analytics, export delivery reports as CSV, and inspect health, scheduler, and encryption status.
- Switch between white/light and dark dashboard themes; the choice is saved in this browser.

## Runtime configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| ENCRYPTION_SECRET_KEY | Server-only key for stored JSON encryption | Required |
| DATA_DIR | Persistent directory for encrypted files | ./data |
| FCM_MAX_CONCURRENCY | Firebase app sends processed at once | 5 |
| FCM_MAX_RETRIES | Maximum retries per failed app delivery | 3 |

The scheduler scans once per minute and runs inside the persistent Next.js Node.js process. Keep that process running for scheduled sends. Local JSON writes are serialized within the process and use atomic file replacement. Run a single application process against a data directory; multiple server instances do not share a cross-process file lock.

## Deployment and security

Deploy on a persistent Node.js server or VPS with a durable volume mounted at DATA_DIR. Serverless or ephemeral filesystems may lose data after restarts or redeploys. Back up the data directory and encryption key together.

This build has no login flow, per-user authorization, or database. Treat it as an internal service: restrict network access to trusted operators, use HTTPS, and do not expose its management API publicly. Never commit .env.local, the encryption key, service account JSON, or the data directory.

## Existing manual sender

The /get-token page remains available for generating a browser device token. The original /api/send and /api/verify routes are still present as standalone endpoints.
