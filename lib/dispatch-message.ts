import { importPKCS8, SignJWT } from "jose";
import { query } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { FirebaseApp, Message } from "@/types/database";

const MAX_TOPIC_PAYLOAD_BYTES = 2048;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function getPayloadSizeBytes(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function buildFcmPayload(message: Message, topic: string) {
  return {
    message: {
      topic,
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
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Unable to obtain Firebase access token.",
    );
  }

  return data.access_token as string;
}

async function sendToFirebase(message: Message, app: FirebaseApp, topic: string) {
  const payload = buildFcmPayload(message, topic);
  const payloadBytes = getPayloadSizeBytes(payload);

  if (payloadBytes > MAX_TOPIC_PAYLOAD_BYTES) {
    throw new Error(
      `FCM payload is too large: ${payloadBytes} bytes. Maximum for topic messages is ${MAX_TOPIC_PAYLOAD_BYTES} bytes.`,
    );
  }

  const serviceAccount = JSON.parse(
    decrypt(
      app.service_account_encrypted,
      app.encryption_iv,
      app.encryption_tag,
    ),
  ) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };

  const accessToken = await getAccessToken(serviceAccount);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      app.project_id || serviceAccount.project_id,
    )}/messages:send`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.error?.status ||
        "FCM request failed.",
    );
  }

  if (!data?.name || typeof data.name !== "string") {
    throw new Error("FCM accepted the request but returned no message ID.");
  }

  return data.name as string;
}

export async function dispatchMessage(message: Message): Promise<void> {
  await query(
    "UPDATE public.messages SET status='sending',updated_at=now() WHERE id=$1",
    [message.id],
  );

  const targetsResult = await query<{ id: string; app_id: string }>(
    `SELECT id,app_id FROM public.message_targets
     WHERE message_id=$1 AND status='pending'`,
    [message.id],
  );

  if (!targetsResult.rows.length) {
    await query(
      "UPDATE public.messages SET status='failed',updated_at=now() WHERE id=$1",
      [message.id],
    );
    return;
  }

  const appIds = targetsResult.rows.map((target) => target.app_id);
  const appsResult = await query<FirebaseApp>(
    "SELECT * FROM public.firebase_apps WHERE id=ANY($1::uuid[])",
    [appIds],
  );
  const appsById = new Map(appsResult.rows.map((app) => [app.id, app]));

  let sent = 0;
  let failed = 0;

  for (const target of targetsResult.rows) {
    const app = appsById.get(target.app_id);

    if (!app || !app.is_active) {
      failed++;
      await query(
        "UPDATE public.message_targets SET status='failed',error_message=$2 WHERE id=$1",
        [target.id, !app ? "App not found" : "App is inactive"],
      );
      continue;
    }

    try {
      const topic = app.topic?.trim();
      if (!topic) {
        throw new Error(`No topic configured for app ${app.name}.`);
      }

      const fcmMessageId = await sendToFirebase(message, app, topic);
      sent++;

      await query(
        "UPDATE public.message_targets SET status='sent',fcm_message_id=$2,sent_at=$3,error_message=null WHERE id=$1",
        [target.id, fcmMessageId, new Date().toISOString()],
      );
    } catch (err: any) {
      failed++;
      await query(
        "UPDATE public.message_targets SET status='failed',error_message=$2 WHERE id=$1",
        [target.id, err?.message ?? "Unknown error"],
      );
    }
  }

  const finalStatus =
    failed === 0 ? "sent" : sent === 0 ? "failed" : "partial_failure";

  await query(
    "UPDATE public.messages SET status=$2,sent_at=$3,total_sent=$4,total_failed=$5,updated_at=now() WHERE id=$1",
    [
      message.id,
      finalStatus,
      new Date().toISOString(),
      sent,
      failed,
    ],
  );
}
