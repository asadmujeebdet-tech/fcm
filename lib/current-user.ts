import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { query } from "@/lib/db";

/**
 * This is a single-account FCM dashboard.
 *
 * The application does not maintain a users table. Existing application
 * records already contain the owner UUID in firebase_apps.user_id/messages.user_id,
 * so resolve the dashboard owner directly from those tables instead of
 * querying Supabase Auth (auth.users).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!(await isValidAuthToken(token))) return null;

  try {
    const result = await query<{ user_id: string }>(`
      SELECT user_id
      FROM (
        SELECT user_id, created_at FROM public.firebase_apps
        UNION ALL
        SELECT user_id, created_at FROM public.messages
      ) owners
      WHERE user_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1
    `);

    return result.rows[0]?.user_id ?? null;
  } catch {
    return null;
  }
}
