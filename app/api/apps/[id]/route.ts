import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const updateAppSchema = z.object({
  name: z.string().min(1).optional(),
  defaultTopic: z.string().optional(),
  packageName: z.string().optional(),
  appIconUrl: z.string().url().or(z.literal("")).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = updateAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.defaultTopic !== undefined) update.default_topic = parsed.data.defaultTopic || "";
  if (parsed.data.packageName !== undefined) update.package_name = parsed.data.packageName || null;
  if (parsed.data.appIconUrl !== undefined) update.app_icon_url = parsed.data.appIconUrl || null;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

  const { data, error } = await admin
    .from("firebase_apps")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, user_id, name, project_id, package_name, app_icon_url, default_topic, is_active, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ app: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("firebase_apps")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
