import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { importPKCS8, SignJWT } from "npm:jose@4.15.9";

type FirebaseApp = {
  id: string;
  name: string;
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
  total_apps_targeted?: number | null;
};

type Target = {
  id: string;
  app_id: string;
};

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MAX_TOPIC_PAYLOAD_BYTES = 2048;
const MAX_FCM_ATTEMPTS = 3;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/^\/topics\//, "");
}

function getPayloadSizeBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

function retryDelayMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 10_000), 120_000);
  }

  const base = Math.min(10_000 * 2 ** attempt, 60_000);
  return Math.min(base + Math.floor(Math.random() * 5_000), 65_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function getAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}) {
  const privateKey = await importPKCS8(
    serviceAccount.private_key.replace(/\\n/g, "\n"),
    "RS256",
  );

  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    signal: AbortSignal.timeout(20_000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        `Unable to obtain Firebase access token (HTTP ${response.status}).`,
    );
  }

  return data.access_token as string;
}

function buildMessage(message: Message, topic: string) {
  return {
    message: {
      topic,
      android: { priority: "HIGH" },
      notification: {
        title: message.notification_title ?? "",
        body: message.notification_body ?? "",
        ...(message.notification_image
          ? { image: message.notification_image }
          : {}),
      },
    },
  };
}

async function sendToFirebase(
  message: Message,
  app: FirebaseApp,
  topic: string,
): Promise<string> {
  const payload = buildMessage(message, topic);
  const payloadBytes = getPayloadSizeBytes(payload);

  if (payloadBytes > MAX_TOPIC_PAYLOAD_BYTES) {
    throw new Error(
      `FCM payload is too large: ${payloadBytes} bytes. Maximum for topic messages is ${MAX_TOPIC_PAYLOAD_BYTES} bytes.`,
    );
  }

  const serviceAccount = await decryptServiceAccount(app);

  if (serviceAccount.project_id !== app.project_id) {
    throw new Error(
      `Firebase project mismatch for app ${app.name}: configured project does not match the service-account project.`,
    );
  }

  const accessToken = await getAccessToken(serviceAccount);
  const endpoint =
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(app.project_id)}/messages:send`;

  for (let attempt = 0; attempt < MAX_FCM_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(30_000),
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        if (!data?.name || typeof data.name !== "string") {
          throw new Error("FCM accepted the request but returned no message ID.");
        }

        console.info(
          `[SCHEDULER] FCM_ACCEPTED appId=${app.id} appName=${JSON.stringify(app.name)} projectId=${app.project_id} topic=${JSON.stringify(topic)} messageId=${data.name}`,
        );
        return data.name;
      }

      const detail =
        data?.error?.message ||
        data?.error?.status ||
        `FCM request failed with HTTP ${response.status}.`;

      if (!isRetryableStatus(response.status) || attempt === MAX_FCM_ATTEMPTS - 1) {
        throw new Error(`FCM HTTP ${response.status}: ${detail}`);
      }

      const delayMs = retryDelayMs(
        attempt,
        parseRetryAfterMs(response.headers.get("retry-after")),
      );

      console.warn(
        `[SCHEDULER] RETRY appId=${app.id} attempt=${attempt + 1}/${MAX_FCM_ATTEMPTS} status=${response.status} delayMs=${delayMs}`,
      );
      await sleep(delayMs);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("FCM HTTP ")) {
        throw error;
      }

      if (attempt === MAX_FCM_ATTEMPTS - 1) {
        throw error instanceof Error
          ? new Error(`FCM transport error: ${error.message}`)
          : new Error("FCM transport error.");
      }

      const delayMs = retryDelayMs(attempt, null);
      console.warn(
        `[SCHEDULER] RETRY appId=${app.id} attempt=${attempt + 1}/${MAX_FCM_ATTEMPTS} transportError=true delayMs=${delayMs}`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error("FCM send failed after all retry attempts.");
}

async function updateTarget(
  supabaseAdmin: ReturnType<typeof createClient>,
  targetId: string,
  values: Record<string, unknown>,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabaseAdmin
      .from("message_targets")
      .update(values)
      .eq("id", targetId);

    if (!error) return;

    lastError = error;
    if (attempt < 2) await sleep(250 * 2 ** attempt);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to persist message target status.");
}

async function processMessage(
  supabaseAdmin: ReturnType<typeof createClient>,
  message: Message,
) {
  const { data: targets, error: targetError } = await supabaseAdmin
    .from("message_targets")
    .select("id,app_id")
    .eq("message_id", message.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (targetError) throw targetError;

  const selectedTargets = (targets ?? []) as Target[];
  const appIds = [...new Set(selectedTargets.map((target) => target.app_id))];

  let apps: FirebaseApp[] = [];
  if (appIds.length) {
    const { data, error } = await supabaseAdmin
      .from("firebase_apps")
      .select(
        "id,name,project_id,topic,service_account_encrypted,encryption_iv,encryption_tag,is_active",
      )
      .in("id", appIds);

    if (error) throw error;
    apps = (data ?? []) as FirebaseApp[];
  }

  const appsById = new Map(apps.map((app) => [app.id, app]));
  let sent = 0;
  let failed = 0;

  console.info(
    `[SCHEDULER] START messageId=${message.id} selectedApps=${selectedTargets.length}`,
  );

  for (const target of selectedTargets) {
    await supabaseAdmin
      .from("messages")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", message.id);

    const app = appsById.get(target.app_id);

    if (!app) {
      failed++;
      const errorMessage = "App not found.";
      console.error(
        `[SCHEDULER] APP_FAILED messageId=${message.id} appId=${target.app_id} reason=${errorMessage}`,
      );
      try {
        await updateTarget(supabaseAdmin, target.id, {
          status: "failed",
          error_message: errorMessage,
        });
      } catch (error) {
        console.error("[SCHEDULER] TARGET_STATUS_UPDATE_FAILED", error);
      }
      continue;
    }

    if (!app.is_active) {
      failed++;
      const errorMessage = "App is inactive.";
      console.error(
        `[SCHEDULER] APP_FAILED messageId=${message.id} appId=${app.id} appName=${JSON.stringify(app.name)} reason=${errorMessage}`,
      );
      try {
        await updateTarget(supabaseAdmin, target.id, {
          status: "failed",
          error_message: errorMessage,
        });
      } catch (error) {
        console.error("[SCHEDULER] TARGET_STATUS_UPDATE_FAILED", error);
      }
      continue;
    }

    const topic = normalizeTopic(app.topic);
    if (!topic) {
      failed++;
      const errorMessage = `No topic configured for app ${app.name}.`;
      console.error(
        `[SCHEDULER] APP_FAILED messageId=${message.id} appId=${app.id} reason=${errorMessage}`,
      );
      try {
        await updateTarget(supabaseAdmin, target.id, {
          status: "failed",
          error_message: errorMessage,
        });
      } catch (error) {
        console.error("[SCHEDULER] TARGET_STATUS_UPDATE_FAILED", error);
      }
      continue;
    }

    console.info(
      `[SCHEDULER] APP_START messageId=${message.id} appId=${app.id} appName=${JSON.stringify(app.name)} projectId=${app.project_id} topic=${JSON.stringify(topic)}`,
    );

    let fcmMessageId: string;
    try {
      fcmMessageId = await sendToFirebase(message, app, topic);
    } catch (error) {
      failed++;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown FCM error.";

      console.error(
        `[SCHEDULER] APP_COMPLETE messageId=${message.id} appId=${app.id} result=failed error=${JSON.stringify(errorMessage)}`,
      );

      try {
        await updateTarget(supabaseAdmin, target.id, {
          status: "failed",
          error_message: errorMessage,
        });
      } catch (databaseError) {
        console.error("[SCHEDULER] TARGET_STATUS_UPDATE_FAILED", databaseError);
      }

      continue;
    }

    sent++;

    try {
      await updateTarget(supabaseAdmin, target.id, {
        status: "sent",
        fcm_message_id: fcmMessageId,
        sent_at: new Date().toISOString(),
        error_message: null,
      });
    } catch (databaseError) {
      console.error(
        `[SCHEDULER] TARGET_STATUS_UPDATE_FAILED messageId=${message.id} appId=${app.id} fcmAccepted=true error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
      );
    }

    console.info(
      `[SCHEDULER] APP_COMPLETE messageId=${message.id} appId=${app.id} result=accepted fcmAccepted=true`,
    );
  }

  const status =
    failed === 0 ? "sent" : sent === 0 ? "failed" : "partial_failure";

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

  if (messageUpdateError) {
    console.error(
      `[SCHEDULER] MESSAGE_STATUS_UPDATE_FAILED messageId=${message.id} status=${status} error=${JSON.stringify(messageUpdateError.message)}`,
    );
  }

  console.info(
    `[SCHEDULER] COMPLETE messageId=${message.id} apps=${selectedTargets.length} successfulApps=${sent} failedApps=${failed} status=${status}`,
  );

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
      try {
        results.push(await processMessage(supabaseAdmin, message));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown scheduler error.";

        console.error(
          `[SCHEDULER] MESSAGE_FAILED messageId=${message.id} error=${JSON.stringify(errorMessage)}`,
        );

        const { error: updateError } = await supabaseAdmin
          .from("messages")
          .update({
            status: "failed",
            sent_at: new Date().toISOString(),
            total_sent: 0,
            total_failed: message.total_apps_targeted ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", message.id);

        if (updateError) {
          console.error("[SCHEDULER] MESSAGE_STATUS_UPDATE_FAILED", updateError);
        }

        results.push({
          id: message.id,
          sent: 0,
          failed: message.total_apps_targeted ?? 0,
          status: "failed",
          error: errorMessage,
        });
      }
    }

    return Response.json({
      success: true,
      processed: results.length,
      results,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SCHEDULER] PROCESSOR_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown scheduler error.",
      },
      { status: 500 },
    );
  }
});
