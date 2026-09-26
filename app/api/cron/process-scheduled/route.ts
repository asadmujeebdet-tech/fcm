import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchMessage } from "@/lib/dispatch-message";
import { Message } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron sends this exact header; also accept a manual Bearer token
  // so you can trigger this by hand while testing.
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: dueMessages, error } = await admin
    .from("messages")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ dispatched: 0 });
  }

  for (const message of dueMessages) {
    await dispatchMessage(admin, message as Message);
  }

  return NextResponse.json({ dispatched: dueMessages.length });
}
