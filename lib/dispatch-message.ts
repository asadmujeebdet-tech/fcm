import { importPKCS8, SignJWT } from "jose";
import { query } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { FirebaseApp, Message } from "@/types/database";
import {
  getPayloadSizeBytes,
  getRetryDelayMs,
  isRetryableFcmStatus,
  isValidTopic,
  MAX_FCM_ATTEMPTS,
  MAX_TOPIC_PAYLOAD_BYTES,
  normalizeTopic,
  parseRetryAfterMs,
  resolveMessageStatus,
  sleep,
} from "@/lib/fcm-utils";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function buildFcmPayload(message: Message, topic: string) {
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

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
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
    signal: AbortSignal.timeout(20_000),
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

async function sendToFirebase(
  message: Message,
  app: FirebaseApp,
  topic: string,
): Promise<string> {
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
  ) as ServiceAccount;

  if (serviceAccount.project_id !== app.project_id) {
    throw new Error(
      `Firebase project mismatch for app ${app.name}: configured project does not match the service-account project.`,
    );
  }

  const accessToken = await getAccessToken(serviceAccount);
  const endpoint =
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      app.project_id,
    )}/messages:send`;

  for (let attempt = 0; attempt < MAX_FCM_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
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
          `[BROADCAST] FCM accepted appId=${app.id} appName=${JSON.stringify(app.name)} projectId=${app.project_id} topic=${JSON.stringify(topic)} messageId=${data.name}`,
        );
        return data.name;
      }

      const retryable = isRetryableFcmStatus(response.status);
      const errorMessage =
        data?.error?.message ||
        data?.error?.status ||
        `FCM request failed with HTTP ${response.status}.`;

      if (!retryable || attempt === MAX_FCM_ATTEMPTS - 1) {
        throw new Error(
          `FCM HTTP ${response.status}: ${errorMessage}`,
        );
      }

      const retryAfterMs = parseRetryAfterMs(
        response.headers.get("retry-after"),
      );
      const delayMs = getRetryDelayMs(attempt, retryAfterMs);

      console.warn(
        `[BROADCAST] RETRY appId=${app.id} attempt=${attempt + 1}/${MAX_FCM_ATTEMPTS} status=${response.status} delayMs=${delayMs}`,
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

      const delayMs = getRetryDelayMs(attempt, null);
      console.warn(
        `[BROADCAST] RETRY appId=${app.id} attempt=${attempt + 1}/${MAX_FCM_ATTEMPTS} transportError=true delayMs=${delayMs}`,
      );
      await sleep(delayMs);
    }
  }

  throw new Error("FCM send failed after all retry attempts.");
}

async function markTarget(
  targetId: string,
  status: "sent" | "failed",
  values: { fcmMessageId?: string; errorMessage?: string },
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await query(
        `UPDATE public.message_targets
         SET status=$2,
             fcm_message_id=$3,
             error_message=$4,
             sent_at=$5
         WHERE id=$1`,
        [
          targetId,
          status,
          values.fcmMessageId ?? null,
          values.errorMessage ?? null,
          status === "sent" ? new Date().toISOString() : null,
        ],
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to persist message target status.");
}

type TargetRow = {
  id: string;
  app_id: string | null;
  app_name: string | null;
  status: "pending" | "sent" | "failed";
};

async function failTarget(
  message: Message,
  target: TargetRow,
  app: FirebaseApp | undefined,
  errorMessage: string,
) {
  console.error(
    `[BROADCAST] FAILED messageId=${message.id} appId=${target.app_id} appName=${JSON.stringify(app?.name ?? target.app_name)} reason=${JSON.stringify(errorMessage)}`,
  );
  try {
    await markTarget(target.id, "failed", { errorMessage });
  } catch (databaseError) {
    console.error(
      `[BROADCAST] TARGET_STATUS_UPDATE_FAILED messageId=${message.id} appId=${target.app_id} error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
    );
  }
}

async function finalizeMessage(messageId: string, sent: number, failed: number) {
  const finalStatus = resolveMessageStatus(sent, failed);
  try {
    await query(
      "UPDATE public.messages SET status=$2,sent_at=$3,total_sent=$4,total_failed=$5,updated_at=now() WHERE id=$1",
      [messageId, finalStatus, new Date().toISOString(), sent, failed],
    );
  } catch (databaseError) {
    console.error(
      `[BROADCAST] MESSAGE_STATUS_UPDATE_FAILED messageId=${messageId} fcmProcessingComplete=true error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
    );
  }
  return finalStatus;
}

export async function dispatchMessage(message: Message): Promise<void> {
  await query(
    "UPDATE public.messages SET status='sending',updated_at=now() WHERE id=$1",
    [message.id],
  );

  const targetsResult = await query<TargetRow>(
    `SELECT id,app_id,app_name,status
     FROM public.message_targets
     WHERE message_id=$1
     ORDER BY created_at ASC, id ASC`,
    [message.id],
  );

  // Totals include targets resolved by an earlier run (e.g. after a stale-job
  // recovery), so a resumed message never reports only its second half.
  const priorSent = targetsResult.rows.filter((t) => t.status === "sent").length;
  const priorFailed = targetsResult.rows.filter((t) => t.status === "failed").length;
  const pendingTargets = targetsResult.rows.filter((t) => t.status === "pending");

  if (!pendingTargets.length) {
    const status = await finalizeMessage(message.id, priorSent, priorFailed);
    console.warn(
      `[BROADCAST] NOTHING_PENDING messageId=${message.id} priorSent=${priorSent} priorFailed=${priorFailed} status=${status}`,
    );
    return;
  }

  const appIds = [
    ...new Set(
      pendingTargets
        .map((target) => target.app_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const appsResult = appIds.length
    ? await query<FirebaseApp>(
        "SELECT * FROM public.firebase_apps WHERE id=ANY($1::uuid[])",
        [appIds],
      )
    : { rows: [] as FirebaseApp[] };
  const appsById = new Map(appsResult.rows.map((app) => [app.id, app]));

  let sent = 0;
  let failed = 0;

  console.info(
    `[BROADCAST] START messageId=${message.id} selectedApps=${pendingTargets.length} alreadySent=${priorSent} alreadyFailed=${priorFailed}`,
  );

  for (const target of pendingTargets) {
    // Heartbeat: tells stale-job recovery this run is still alive.
    try {
      await query("UPDATE public.messages SET updated_at=now() WHERE id=$1", [message.id]);
    } catch (databaseError) {
      console.error(
        `[BROADCAST] HEARTBEAT_FAILED messageId=${message.id} error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
      );
    }

    const app = target.app_id ? appsById.get(target.app_id) : undefined;

    if (!app) {
      failed++;
      await failTarget(
        message,
        target,
        app,
        target.app_name
          ? `App "${target.app_name}" no longer exists.`
          : "App not found.",
      );
      continue;
    }

    if (!app.is_active) {
      failed++;
      await failTarget(message, target, app, "App is inactive.");
      continue;
    }

    const topic = normalizeTopic(app.topic);
    if (!topic) {
      failed++;
      await failTarget(message, target, app, `No topic configured for app ${app.name}.`);
      continue;
    }

    if (!isValidTopic(topic)) {
      failed++;
      await failTarget(
        message,
        target,
        app,
        `Invalid topic ${JSON.stringify(topic)} for app ${app.name}. Topics may only contain letters, numbers and - _ . ~ %`,
      );
      continue;
    }

    console.info(
      `[BROADCAST] APP_START messageId=${message.id} appId=${app.id} appName=${JSON.stringify(app.name)} projectId=${app.project_id} topic=${JSON.stringify(topic)}`,
    );

    let fcmMessageId: string;
    try {
      fcmMessageId = await sendToFirebase(message, app, topic);
    } catch (error) {
      failed++;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown FCM error.";

      console.error(
        `[BROADCAST] APP_COMPLETE messageId=${message.id} appId=${app.id} result=failed error=${JSON.stringify(errorMessage)}`,
      );
      try {
        await markTarget(target.id, "failed", { errorMessage });
      } catch (databaseError) {
        console.error(
          `[BROADCAST] TARGET_STATUS_UPDATE_FAILED messageId=${message.id} appId=${app.id} error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
        );
      }

      // A failed app never stops the next selected app.
      continue;
    }

    // FCM has already accepted this app's fanout. Persist that fact separately
    // from the send operation so a database write failure is not misreported
    // as an FCM failure and accidentally retried as a new send.
    sent++;
    try {
      await markTarget(target.id, "sent", { fcmMessageId });
    } catch (databaseError) {
      console.error(
        `[BROADCAST] TARGET_STATUS_UPDATE_FAILED messageId=${message.id} appId=${app.id} fcmAccepted=true error=${JSON.stringify(databaseError instanceof Error ? databaseError.message : databaseError)}`,
      );
    }

    console.info(
      `[BROADCAST] APP_COMPLETE messageId=${message.id} appId=${app.id} result=accepted fcmAccepted=true`,
    );
  }

  const finalStatus = await finalizeMessage(
    message.id,
    priorSent + sent,
    priorFailed + failed,
  );

  console.info(
    `[BROADCAST] COMPLETE messageId=${message.id} apps=${pendingTargets.length} successfulApps=${sent} failedApps=${failed} status=${finalStatus}`,
  );
}
