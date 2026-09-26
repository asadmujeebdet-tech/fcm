import * as admin from "firebase-admin";
import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/encryption";
import { FirebaseApp, Message } from "@/types/database";

function buildFcmMessage(message: Message, topic: string): admin.messaging.Message {
  if (message.format === "data") {
    return {
      topic,
      data: {
        app_url: message.data_app_url ?? "",
        title: message.data_title ?? "",
        short_desc: message.data_short_desc ?? "",
        long_desc_: message.data_long_desc ?? "",
        icon: message.data_icon ?? "",
        feature: message.data_feature ?? "",
      },
    };
  }

  return {
    topic,
    notification: {
      title: message.notification_title ?? "",
      body: message.notification_body ?? "",
      ...(message.notification_image ? { imageUrl: message.notification_image } : {}),
    },
  };
}

/**
 * Sends `message` to every app in its message_targets rows, one Firebase
 * Admin app instance per target (uniquely named + torn down immediately
 * after), and writes each result back to message_targets and the rollup
 * counts on the message itself. Safe to call from an API route (Send Now)
 * or from the cron route (scheduled dispatch) — both paths converge here.
 */
export async function dispatchMessage(supabase: SupabaseClient, message: Message): Promise<void> {
  await supabase
    .from("messages")
    .update({ status: "sending" })
    .eq("id", message.id);

  const { data: targets, error: targetsError } = await supabase
    .from("message_targets")
    .select("id, app_id")
    .eq("message_id", message.id)
    .eq("status", "pending");

  if (targetsError || !targets) {
    await supabase
      .from("messages")
      .update({ status: "failed" })
      .eq("id", message.id);
    return;
  }

  const appIds = targets.map((t) => t.app_id);
  const { data: apps } = await supabase
    .from("firebase_apps")
    .select("*")
    .in("id", appIds);

  const appsById = new Map<string, FirebaseApp>((apps ?? []).map((a) => [a.id, a as FirebaseApp]));

  let sent = 0;
  let failed = 0;

  for (const target of targets) {
    const app = appsById.get(target.app_id);

    if (!app || !app.is_active) {
      failed += 1;
      await supabase
        .from("message_targets")
        .update({
          status: "failed",
          error_message: !app ? "App not found" : "App is inactive",
        })
        .eq("id", target.id);
      continue;
    }

    const appName = `dispatch-${message.id}-${target.app_id}`;
    let adminApp: admin.app.App | undefined;

    try {
      const serviceAccountJson = decrypt(
        app.service_account_encrypted,
        app.encryption_iv,
        app.encryption_tag
      );
      const serviceAccount = JSON.parse(serviceAccountJson);

      adminApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, appName);

      const topic = message.topic?.trim() ? message.topic.trim() : app.default_topic?.trim() || "all";
      const fcmMessage = buildFcmMessage(message, topic);
      const fcmMessageId = await admin.messaging(adminApp).send(fcmMessage);

      sent += 1;
      await supabase
        .from("message_targets")
        .update({
          status: "sent",
          fcm_message_id: fcmMessageId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", target.id);
    } catch (err: any) {
      failed += 1;
      await supabase
        .from("message_targets")
        .update({
          status: "failed",
          error_message: err?.message ?? "Unknown error",
        })
        .eq("id", target.id);
    } finally {
      if (adminApp) {
        await adminApp.delete().catch(() => {});
      }
    }
  }

  const finalStatus = failed === 0 ? "sent" : sent === 0 ? "failed" : "partial_failure";

  await supabase
    .from("messages")
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      total_sent: sent,
      total_failed: failed,
    })
    .eq("id", message.id);
}
