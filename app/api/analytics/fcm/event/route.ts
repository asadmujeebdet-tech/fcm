import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/lib/db";

export const runtime = "nodejs";

const eventSchema = z.object({
  analyticsLabel: z.string().regex(/^[A-Za-z0-9\-_.~%]{1,50}$/),
  targetId: z.string().uuid(),
  installationId: z.string().min(8).max(128),
  event: z.enum(["received", "shown", "opened", "dismissed"]),
  eventTimestamp: z.string().datetime({ offset: true }).optional(),
  appVersion: z.string().max(100).optional(),
  androidVersion: z.string().max(100).optional(),
  deviceModel: z.string().max(150).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Android FCM data keys are snake_case. Normalize them at the API boundary,
// while continuing to support the existing camelCase client contract.
const normalizedEventSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  return {
    ...body,
    analyticsLabel: body.analyticsLabel ?? body.analytics_label,
    targetId: body.targetId ?? body.target_id ?? body.analytics_target_id,
    installationId: body.installationId ?? body.installation_id,
    eventTimestamp: body.eventTimestamp ?? body.event_timestamp,
    appVersion: body.appVersion ?? body.app_version,
    androidVersion: body.androidVersion ?? body.android_version,
    deviceModel: body.deviceModel ?? body.device_model,
  };
}, eventSchema);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = normalizedEventSchema.safeParse(body);
  if (!parsed.success) {
    const reason = parsed.error.issues[0]?.message ?? "Invalid analytics event.";
    console.warn("[FCM_ANALYTICS] REJECTED reason=invalid_payload", {
      reason,
      issueCount: parsed.error.issues.length,
    });
    return NextResponse.json({ success: false, error: reason }, { status: 400 });
  }

  const input = parsed.data;
  try {
    const result = await withTransaction(async (client) => {
      // Bind both identifiers to the same real target/message before accepting
      // any device-reported event. The label is message-scoped.
      const target = await client.query<{
        id: string;
        message_id: string;
        app_id: string | null;
      }>(
        `SELECT mt.id, mt.message_id, mt.app_id
         FROM public.message_targets mt
         JOIN public.messages m ON m.id = mt.message_id
         WHERE mt.id = $1 AND m.analytics_label = $2
         LIMIT 1`,
        [input.targetId, input.analyticsLabel],
      );

      if (!target.rows[0]) {
        throw new Error("Analytics target not found or analytics label does not match target.");
      }
      const t = target.rows[0];

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.fcm_analytics_events
          (message_id, message_target_id, app_id, analytics_label, installation_id,
           event_type, event_timestamp, app_version, android_version, device_model, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (message_target_id, installation_id, event_type) DO NOTHING
         RETURNING id`,
        [
          t.message_id,
          t.id,
          t.app_id,
          input.analyticsLabel,
          input.installationId,
          input.event,
          input.eventTimestamp ?? new Date().toISOString(),
          input.appVersion ?? null,
          input.androidVersion ?? null,
          input.deviceModel ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );

      // A duplicate must not increment a summary counter a second time.
      if (!inserted.rows[0]) return { duplicate: true, event: input.event, targetId: t.id };

      await client.query(
        `INSERT INTO public.fcm_analytics_summary (message_target_id, message_id, app_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (message_target_id) DO NOTHING`,
        [t.id, t.message_id, t.app_id],
      );

      if (input.event === "received") {
        await client.query(
          `UPDATE public.fcm_analytics_summary
           SET received_count = received_count + 1,
               delivered_count = delivered_count + 1,
               updated_at = now()
           WHERE message_target_id = $1`,
          [t.id],
        );
      } else {
        const column = ({
          shown: "shown_count",
          opened: "opened_count",
          dismissed: "dismissed_count",
        } as const)[input.event];
        await client.query(
          `UPDATE public.fcm_analytics_summary
           SET ${column} = ${column} + 1, updated_at = now()
           WHERE message_target_id = $1`,
          [t.id],
        );
      }

      return { duplicate: false, event: input.event, targetId: t.id };
    });

    console.info("[FCM_ANALYTICS] ACCEPTED", {
      event: result.event,
      duplicate: result.duplicate,
      targetId: result.targetId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record analytics event.";
    const targetRejected = message.startsWith("Analytics target not found");
    if (targetRejected) {
      console.warn("[FCM_ANALYTICS] REJECTED reason=target_label_mismatch", {
        targetId: input.targetId,
        event: input.event,
      });
    } else {
      console.error("[FCM_ANALYTICS] FAILED", {
        targetId: input.targetId,
        event: input.event,
        reason: message,
      });
    }
    return NextResponse.json(
      { success: false, error: targetRejected ? "Target not found or analytics label mismatch." : "Unable to record analytics event." },
      { status: targetRejected ? 404 : 500 },
    );
  }
}
