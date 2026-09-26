import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";

export const runtime = "nodejs";

const createAppSchema = z.object({
  name: z.string().min(1),
  defaultTopic: z.string().default(""),
  packageName: z.string().optional(),
  appIconUrl: z.string().url().or(z.literal("")).optional(),
  serviceAccount: z.string().min(1),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("firebase_apps")
    .select(
      "id, user_id, name, project_id, package_name, app_icon_url, default_topic, is_active, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ apps: data });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  let serviceAccountObj: any;
  try {
    serviceAccountObj = JSON.parse(parsed.data.serviceAccount);
  } catch {
    return NextResponse.json({ error: "serviceAccount is not valid JSON" }, { status: 400 });
  }

  const projectId = serviceAccountObj.project_id;
  if (!projectId || !serviceAccountObj.private_key || !serviceAccountObj.client_email) {
    return NextResponse.json(
      { error: "serviceAccount JSON is missing required fields (project_id, private_key, client_email)" },
      { status: 400 }
    );
  }

  const { ciphertext, iv, tag } = encrypt(parsed.data.serviceAccount);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("firebase_apps")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      project_id: projectId,
      package_name: parsed.data.packageName || null,
      app_icon_url: parsed.data.appIconUrl || null,
      default_topic: parsed.data.defaultTopic || "",
      is_active: parsed.data.isActive,
      service_account_encrypted: ciphertext,
      encryption_iv: iv,
      encryption_tag: tag,
    })
    .select("id, user_id, name, project_id, package_name, app_icon_url, default_topic, is_active, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ app: data }, { status: 201 });
}
