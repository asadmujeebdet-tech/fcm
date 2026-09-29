import { cookies } from "next/headers";
import { createHash } from "crypto";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { query } from "@/lib/db";

/**
 * Single-account dashboard.
 *
 * Existing app/message rows carry the owner UUID. For a brand-new database,
 * there may be no row yet, so derive one stable UUID from the configured
 * login email. This allows the first app to be created instead of returning
 * Unauthorized.
 */
export async function getConfiguredOwnerId(): Promise<string | null> {
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

    if (result.rows[0]?.user_id) return result.rows[0].user_id;

    const email = process.env.EMAIL?.trim();
    if (!email) return null;

    const hash = createHash("sha256").update(`fcm-owner:${email}`).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!(await isValidAuthToken(token))) return null;

  return getConfiguredOwnerId();
}
