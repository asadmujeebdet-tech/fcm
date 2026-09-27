import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { dispatchMessage } from "@/lib/dispatch-message";
import { Message } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json({ error: "Cron is not configured." }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await query<Message>(
      `SELECT *
       FROM public.messages
       WHERE status = 'scheduled'
         AND scheduled_at <= $1
       ORDER BY scheduled_at ASC`,
      [new Date().toISOString()]
    );

    if (!result.rows.length) {
      return NextResponse.json({ dispatched: 0 });
    }

    for (const message of result.rows) {
      await dispatchMessage(message);
    }

    return NextResponse.json({ dispatched: result.rows.length });
  } catch (error) {
    console.error("Scheduled FCM processing failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database error" },
      { status: 500 }
    );
  }
}
