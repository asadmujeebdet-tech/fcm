import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: message, error } = await admin
    .from("messages")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: targets } = await admin
    .from("message_targets")
    .select("id, app_id, status, fcm_message_id, error_message, sent_at, firebase_apps(name)")
    .eq("message_id", message.id);

  return NextResponse.json({ message, targets: targets ?? [] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("messages")
    .select("id, status")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft", "scheduled"].includes(message.status)) {
    return NextResponse.json(
      { error: "Only draft or scheduled messages can be canceled" },
      { status: 400 }
    );
  }

  const { error } = await admin.from("messages").update({ status: "canceled" }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
