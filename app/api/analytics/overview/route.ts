import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { toTotals, emptyTotals, type AppRow, type Totals } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cumulative analytics across every broadcast, plus a per-app breakdown. */
export async function GET() {
  try {
    const perApp = await query<Record<string, unknown>>(`
      SELECT mt.app_id, COALESCE(fa.name, MAX(mt.app_name), 'Deleted app') AS name, fa.app_icon_url AS icon,
             COUNT(*) FILTER (WHERE mt.status='sent') AS sent,
             COUNT(*) FILTER (WHERE mt.status='failed') AS failed,
             COALESCE(SUM(s.delivered_count),0) AS delivered, COALESCE(SUM(s.shown_count),0) AS shown,
             COALESCE(SUM(s.opened_count),0) AS opened, COALESCE(SUM(s.dismissed_count),0) AS dismissed,
             MAX(s.updated_at) AS updated_at
      FROM public.message_targets mt
      LEFT JOIN public.firebase_apps fa ON fa.id=mt.app_id
      LEFT JOIN public.fcm_analytics_summary s ON s.message_target_id=mt.id
      GROUP BY mt.app_id, fa.name, fa.app_icon_url
      ORDER BY sent DESC, name ASC`);
    const apps: AppRow[] = perApp.rows.map((row) => ({ id: String(row.app_id ?? row.name), name: String(row.name), icon: (row.icon as string | null) ?? null, ...toTotals(row as never) }));
    const totals = apps.reduce<Totals>((acc, a) => ({
      sent: acc.sent + a.sent, failed: acc.failed + a.failed, delivered: acc.delivered + a.delivered,
      shown: acc.shown + a.shown, opened: acc.opened + a.opened, dismissed: acc.dismissed + a.dismissed,
    }), { ...emptyTotals });
    const counts = await query<{ campaigns: string; apps: string }>(
      `SELECT (SELECT COUNT(*) FROM public.messages) AS campaigns, (SELECT COUNT(*) FROM public.firebase_apps) AS apps`);
    const updatedAt = perApp.rows.reduce<string | null>((latest, row) => {
      const v = row.updated_at ? new Date(row.updated_at as string).toISOString() : null;
      return v && (!latest || v > latest) ? v : latest;
    }, null);
    return NextResponse.json({
      totals, apps, updatedAt,
      campaigns: Number(counts.rows[0]?.campaigns ?? 0), appCount: Number(counts.rows[0]?.apps ?? 0),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}
