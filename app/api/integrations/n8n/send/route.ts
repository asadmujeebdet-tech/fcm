import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { query, withTransaction } from "@/lib/db";
import { getConfiguredOwnerId } from "@/lib/current-user";
import { dispatchMessage } from "@/lib/dispatch-message";
import type { PoolClient } from "pg";
import type { Message } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  appIds: z.array(z.string().uuid()).min(1, "Select at least one app"),
  title: z.string().min(1, "title is required"),
  body: z.string().min(1, "body is required"),
  imageUrl: z.string().optional().default(""),
  topic: z.string().optional().default(""),
  action: z.enum(["send_now", "schedule"]).default("send_now"),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

function isValidApiKey(request: NextRequest): boolean {
  const configured = process.env.N8N_API_KEY;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!configured || !provided) return false;

  const expected = Buffer.from(configured);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: NextRequest) {
  if (!isValidApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.action === "schedule" && !input.scheduledAt) {
    return NextResponse.json(
      { error: "scheduledAt is required when action is schedule" },
      { status: 400 },
    );
  }

  if (input.scheduledAt && !/[+]05:00$/.test(input.scheduledAt)) {
    return NextResponse.json(
      { error: "scheduledAt must use Pakistan Time (PKT, UTC+05:00)." },
      { status: 400 },
    );
  }

  const userId = await getConfiguredOwnerId();
  if (!userId) {
    return NextResponse.json(
      { error: "FCM dashboard owner is not configured." },
      { status: 500 },
    );
  }

  try {
    const requestedAppIds = [...new Set(input.appIds)];
    const owned = await query<{ id: string }>(
      `SELECT id
       FROM public.firebase_apps
       WHERE user_id=$1 AND id=ANY($2::uuid[])`,
      [userId, requestedAppIds],
    );
    const ownedIds = new Set(owned.rows.map((app) => app.id));

    if (ownedIds.size !== requestedAppIds.length) {
      const missing = requestedAppIds.filter((id) => !ownedIds.has(id));
      return NextResponse.json(
        {
          error: `${missing.length} selected app(s) do not belong to the configured FCM account. Nothing was sent.`,
          missingAppIds: missing,
        },
        { status: 400 },
      );
    }

    const status = input.action === "schedule" ? "scheduled" : "draft";
    const scheduledAt = input.action === "schedule" ? input.scheduledAt! : null;

    const message = await withTransaction(async (client: PoolClient) => {
      const result = await client.query<Message>(
        `INSERT INTO public.messages
          (user_id,topic,notification_title,notification_body,notification_image,status,scheduled_at,total_apps_targeted)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          userId,
          input.topic,
          input.title,
          input.body,
          input.imageUrl || null,
          status,
          scheduledAt,
          requestedAppIds.length,
        ],
      );

      const created = result.rows[0];
      if (!created) throw new Error("Failed to create message");

      const targets = await client.query(
        `INSERT INTO public.message_targets(message_id,app_id,app_name)
         SELECT $1,fa.id,fa.name
         FROM public.firebase_apps fa
         WHERE fa.id=ANY($2::uuid[])`,
        [created.id, requestedAppIds],
      );

      if (targets.rowCount !== requestedAppIds.length) {
        throw new Error("Failed to create all message targets");
      }

      return created;
    });

    if (input.action === "send_now") {
      await dispatchMessage(message);

      const final = await query<Message>(
        "SELECT * FROM public.messages WHERE id=$1",
        [message.id],
      );

      const targets = await query(
        `SELECT mt.id,mt.app_id,mt.status,mt.fcm_message_id,mt.error_message,mt.sent_at,
                COALESCE(fa.name,mt.app_name) AS app_name,fa.app_icon_url
         FROM public.message_targets mt
         LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id
         WHERE mt.message_id=$1
         ORDER BY mt.created_at ASC`,
        [message.id],
      );

      return NextResponse.json(
        {
          success: true,
          messageId: message.id,
          status: final.rows[0]?.status ?? "sent",
          totalApps: requestedAppIds.length,
          message: final.rows[0] ?? message,
          targets: targets.rows,
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        messageId: message.id,
        status: "scheduled",
        totalApps: requestedAppIds.length,
        scheduledAt: message.scheduled_at,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database error" },
      { status: 500 },
    );
  }
}
