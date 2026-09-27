import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await query<{ apps: string; messages: string }>(`
      SELECT
        (SELECT COUNT(*)::text FROM public.firebase_apps) AS apps,
        (SELECT COUNT(*)::text FROM public.messages) AS messages
    `);
    return NextResponse.json({
      ok: true,
      database: "connected",
      apps: Number(result.rows[0]?.apps ?? 0),
      messages: Number(result.rows[0]?.messages ?? 0),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      database: "error",
      error: error instanceof Error ? error.message : "Database connection failed",
    }, { status: 500 });
  }
}
