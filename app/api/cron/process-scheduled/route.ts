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
    // Use the same atomic claim function as the Supabase Edge scheduler.
    // This prevents two scheduler invocations from processing the same message.
    const result = await query<Message>(
      "SELECT * FROM public.claim_scheduled_messages($1)",
      [25],
    );

    if (!result.rows.length) {
      return NextResponse.json({ dispatched: 0 });
    }

    let processed = 0;
    for (const message of result.rows) {
      try {
        await dispatchMessage(message);
        processed++;
      } catch (error) {
        console.error(
          `[CRON] Failed to process message ${message.id}:`,
          error,
        );
      }
    }

    return NextResponse.json({
      dispatched: processed,
      claimed: result.rows.length,
    });
  } catch (error) {
    console.error("Scheduled FCM processing failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database error" },
      { status: 500 },
    );
  }
}
