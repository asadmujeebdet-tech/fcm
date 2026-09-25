"use client";

import { useState } from "react";
import Link from "next/link";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const EMPTY_CONFIG: FirebaseWebConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export default function GetToken() {
  const [config, setConfig] = useState<FirebaseWebConfig>(EMPTY_CONFIG);
  const [vapidKey, setVapidKey] = useState("");
  const [status, setStatus] = useState<
    | { state: "idle" }
    | { state: "requesting" }
    | { state: "granted"; token: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const configComplete = Object.values(config).every((v) => v.trim().length > 0);
  const canGenerate = configComplete && vapidKey.trim().length > 0;

  async function handleGenerate() {
    setStatus({ state: "requesting" });
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        throw new Error("This browser doesn't support web push notifications.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(`Notification permission was ${permission}. Allow notifications and try again.`);
      }

      // Register the service worker with the app's config passed as query
      // params, since service workers can't read this page's React state.
      const swParams = new URLSearchParams(config as unknown as Record<string, string>);
      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${swParams.toString()}`
      );

      const { initializeApp } = await import("firebase/app");
      const { getMessaging, getToken } = await import("firebase/messaging");

      const app = initializeApp(config, `get-token-${Date.now()}`);
      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        throw new Error("No token was returned. Check your config and VAPID key.");
      }

      setStatus({ state: "granted", token });
    } catch (err: any) {
      setStatus({ state: "error", message: err?.message ?? "Failed to get a token" });
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-1">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← back to sender
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Get a test device token</h1>
          <p className="text-sm text-slate-400">
            This runs entirely in your browser and registers{" "}
            <code className="text-slate-300">this browser tab</code> as a
            device with Firebase Cloud Messaging, so you have a real token to
            paste into the sender. This uses your Firebase{" "}
            <strong>web app config</strong> (public, safe to expose in the
            browser) — not the service account JSON.
          </p>
        </header>

        <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-5 text-sm">
          <p className="text-slate-400">
            Firebase Console → Project settings → General → scroll to{" "}
            <em>Your apps</em> → add or select a Web app → copy the config
            object shown there.
          </p>
          {(Object.keys(EMPTY_CONFIG) as (keyof FirebaseWebConfig)[]).map((key) => (
            <input
              key={key}
              value={config[key]}
              onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
              placeholder={key}
              className="w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
            />
          ))}

          <div className="pt-2">
            <label className="block text-xs text-slate-400 mb-1">
              VAPID key (Project settings → Cloud Messaging → Web configuration
              → Web Push certificates)
            </label>
            <input
              value={vapidKey}
              onChange={(e) => setVapidKey(e.target.value)}
              placeholder="BN4G..."
              className="w-full rounded-md border border-slate-700 bg-slate-950 p-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || status.state === "requesting"}
            className="w-full rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.state === "requesting" ? "Requesting permission..." : "Generate token"}
          </button>

          {status.state === "granted" && (
            <div className="space-y-2 rounded-md border border-emerald-700 bg-emerald-950/40 p-3">
              <p className="text-xs text-emerald-300">
                Token generated. Copy it into the sender&apos;s &quot;Device
                token&quot; field.
              </p>
              <textarea
                readOnly
                value={status.token}
                rows={4}
                className="w-full rounded-md border border-emerald-800 bg-slate-950 p-2 font-mono text-[11px] text-emerald-200"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
          )}

          {status.state === "error" && (
            <p className="text-xs text-red-400">{status.message}</p>
          )}
        </section>

        <p className="text-xs text-slate-600">
          Note: this browser tab is now &quot;the device.&quot; Keep the tab
          (or at least the browser) open to receive the test push — closing
          it doesn&apos;t invalidate the token immediately, but the
          notification won&apos;t show if the browser isn&apos;t running.
        </p>
      </div>
    </main>
  );
}
