import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/current-user";
import { dispatchMessage } from "@/lib/dispatch-message";
import { Message } from "@/types/database";

export const runtime = "nodejs";

const baseSchema = z.object({
  appIds: z.array(z.string().uuid()).min(1, "Select at least one app"),
  topic: z.string().default(""),
  format: z.enum(["notification", "data"]),
  action: z.enum(["draft", "send_now", "schedule"]),
  scheduledAt: z.union([z.string().datetime(), z.array(z.string().datetime())]).optional(),

  notificationTitle: z.string().optional(),
  notificationBody: z.string().optional(),
  notificationImage: z.string().optional(),

  dataAppUrl: z.string().optional(),
  dataTitle: z.string().optional(),
  dataShortDesc: z.string().optional(),
  dataLongDesc: z.string().optional(),
  dataIcon: z.string().optional(),
  dataFeature: z.string().optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = baseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  if (input.format === "notification" && (!input.notificationTitle || !input.notificationBody)) {
    return NextResponse.json(
      { error: "notificationTitle and notificationBody are required for the notification format" },
      { status: 400 }
    );
  }
  if (input.format === "data" && (!input.dataAppUrl || !input.dataTitle || !input.dataShortDesc)) {
    return NextResponse.json(
      { error: "dataAppUrl, dataTitle and dataShortDesc are required for the data format" },
      { status: 400 }
    );
  }
  const scheduleTimes = Array.isArray(input.scheduledAt)
    ? input.scheduledAt
    : input.scheduledAt
      ? [input.scheduledAt]
      : [];

  if (input.action === "schedule" && scheduleTimes.length === 0) {
    return NextResponse.json({ error: "At least one scheduledAt value is required to schedule a message" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confirm every appId actually belongs to this user before targeting it.
  const { data: ownedApps, error: ownedAppsError } = await admin
    .from("firebase_apps")
    .select("id")
    .eq("user_id", userId)
    .in("id", input.appIds);

  if (ownedAppsError) return NextResponse.json({ error: ownedAppsError.message }, { status: 500 });
  const ownedIds = new Set((ownedApps ?? []).map((a) => a.id));
  const validAppIds = input.appIds.filter((id) => ownedIds.has(id));
  if (validAppIds.length === 0) {
    return NextResponse.json({ error: "None of the selected apps are valid" }, { status: 400 });
  }

  if (input.action === "send_now") {
    const initialStatus = "draft";

    const { data: message, error: insertError } = await admin
      .from("messages")
      .insert({
        user_id: userId,
        format: input.format,
        topic: input.topic || "",
        notification_title: input.notificationTitle || null,
        notification_body: input.notificationBody || null,
        notification_image: input.notificationImage || null,
        data_app_url: input.dataAppUrl || null,
        data_title: input.dataTitle || null,
        data_short_desc: input.dataShortDesc || null,
        data_long_desc: input.dataLongDesc || null,
        data_icon: input.dataIcon || null,
        data_feature: input.dataFeature || null,
        status: initialStatus,
        scheduled_at: null,
        total_apps_targeted: validAppIds.length,
      })
      .select("*")
      .single();

    if (insertError || !message) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create message" }, { status: 500 });
    }

    const { error: targetsError } = await admin.from("message_targets").insert(
      validAppIds.map((appId) => ({ message_id: message.id, app_id: appId }))
    );

    if (targetsError) {
      return NextResponse.json({ error: targetsError.message }, { status: 500 });
    }

    await dispatchMessage(admin, message as Message);
    const { data: finalMessage } = await admin.from("messages").select("*").eq("id", message.id).single();
    return NextResponse.json({ message: finalMessage }, { status: 201 });
  }

  const insertedMessages = [] as Message[];

  for (const scheduledIso of scheduleTimes) {
    const { data: message, error: insertError } = await admin
      .from("messages")
      .insert({
        user_id: userId,
        format: input.format,
        topic: input.topic || "",
        notification_title: input.notificationTitle || null,
        notification_body: input.notificationBody || null,
        notification_image: input.notificationImage || null,
        data_app_url: input.dataAppUrl || null,
        data_title: input.dataTitle || null,
        data_short_desc: input.dataShortDesc || null,
        data_long_desc: input.dataLongDesc || null,
        data_icon: input.dataIcon || null,
        data_feature: input.dataFeature || null,
        status: "scheduled",
        scheduled_at: scheduledIso,
        total_apps_targeted: validAppIds.length,
      })
      .select("*")
      .single();

    if (insertError || !message) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create scheduled message" }, { status: 500 });
    }

    const { error: targetsError } = await admin.from("message_targets").insert(
      validAppIds.map((appId) => ({ message_id: message.id, app_id: appId }))
    );

    if (targetsError) {
      return NextResponse.json({ error: targetsError.message }, { status: 500 });
    }

    insertedMessages.push(message as Message);
  }

  return NextResponse.json({ messages: insertedMessages }, { status: 201 });
}
