import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@4.15.9";

type FirebaseApp = {
  id: string;
  project_id: string;
  topic: string;
  service_account_encrypted: string;
  encryption_iv: string;
  encryption_tag: string;
  is_active: boolean;
};

type Message = {
  id: string;
  topic: string;
  notification_title: string | null;
  notification_body: string | null;
  notification_image: string | null;
};

type Target = {
  id: string;
  app_id: string;
};

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptServiceAccount(app: FirebaseApp) {
  const secretHex = env("ENCRYPTION_SECRET_KEY");
  if (!/^[0-9a-fA-F]{64}$/.test(secretHex)) {
    throw new Error("ENCRYPTION_SECRET_KEY must be a 64-character hex string.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(secretHex),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const ciphertext = base64ToBytes(app.service_account_encrypted);
  const tag = base64ToBytes(app.encryption_tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(app.encryption_iv), tagLength: 128 },
    key,
    combined,
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}) {
  const privateKey = await importPKCS8(
    serviceAccount.private_key.replace(/\\n/g, "\n"),
    "RS256",
  );

  const assertion = await new SignJWT({
    scope: FCM_SCOPE,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    signal: AbortSignal.timeout(20000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Unable to obtain Firebase access token.");
  }

  return data.access_token as string;
}

function buildMessage(message: Message, topic: string) {
  return {
    message: {
      topic,
      notification: {
        title: message.notification_title ?? "",
        body: message.notification_body ?? "",
        ...(message.notification_image ? { image: message.notification_image } : {}),
      },
    },
  };
}

async function sendToFirebase(
  message: Message,
  app: FirebaseApp,
  topic: string,
) {
  const serviceAccount = await decryptServiceAccount(app);
  const accessToken = await getAccessToken(serviceAccount);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(app.project_id)}/messages:send`,
    {
      signal: AbortSignal.timeout(30000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMessage(message, topic)),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.status || "FCM request failed.";
    throw new Error(detail);
  }

  if (!data?.name || typeof data.name !== "string") {
    throw new Error("FCM accepted the request but returned no message ID.");
  }

  return data.name as string;
}

async function processMessage(
  supabaseAdmin: ReturnType<typeof createClient>,
  message: Message,
) {
  const { data: targets, error: targetError } = await supabaseAdmin
    .from("message_targets")
    .select("id,app_id")
    .eq("message_id", message.id)
    .eq("status", "pending");

  if (targetError) throw targetError;

  let sent = 0;
  let failed = 0;

  const appIds = [...new Set((targets ?? []).map((target) => target.app_id))];
  let apps: FirebaseApp[] = [];

  if (appIds.length) {
    const { data, error } = await supabaseAdmin
      .from("firebase_apps")
      .select("id,project_id,topic,service_account_encrypted,encryption_iv,encryption_tag,is_active")
      .in("id", appIds);

    if (error) throw error;
    apps = (data ?? []) as FirebaseApp[];
  }

  const appsById = new Map(apps.map((app) => [app.id, app]));

  for (const target of targets ?? []) {
    const app = appsById.get(target.app_id);

    if (!app) {
      failed++;
      await supabaseAdmin
        .from("message_targets")
        .update({ status: "failed", error_message: "App not found." })
        .eq("id", target.id);
      continue;
    }

    if (!app.is_active) {
      failed++;
      await supabaseAdmin
        .from("message_targets")
        .update({ status: "failed", error_message: "App is inactive." })
        .eq("id", target.id);
      continue;
    }

    try {
      const topic = app.topic?.trim();
      if (!topic) throw new Error(`No topic configured for app ${app.name}.`);
      const fcmMessageId = await sendToFirebase(message, app, topic);

      sent++;
      await supabaseAdmin
        .from("message_targets")
        .update({
          status: "sent",
          fcm_message_id: fcmMessageId,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", target.id);
    } catch (error) {
      failed++;
      await supabaseAdmin
        .from("message_targets")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown FCM error.",
        })
        .eq("id", target.id);
    }
  }

  const status =
    failed === 0 ? "sent" :
    sent === 0 ? "failed" :
    "partial_failure";

  const { error: messageUpdateError } = await supabaseAdmin
    .from("messages")
    .update({
      status,
      sent_at: new Date().toISOString(),
      total_sent: sent,
      total_failed: failed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", message.id);

  if (messageUpdateError) throw messageUpdateError;

  return { id: message.id, sent, failed, status };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const expectedSecret = env("CRON_SECRET");
  const authorization = request.headers.get("authorization") ?? "";

  if (authorization !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: messages, error } = await supabaseAdmin.rpc(
      "claim_scheduled_messages",
      { p_limit: 25 },
    );

    if (error) throw error;

    const results = [];
    for (const message of (messages ?? []) as Message[]) {
      results.push(await processMessage(supabaseAdmin, message));
    }

    return Response.json({
      success: true,
      processed: results.length,
      results,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Scheduled FCM processor failed:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown scheduler error.",
      },
      { status: 500 },
    );
  }
});
