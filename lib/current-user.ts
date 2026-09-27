import { cookies } from "next/headers";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { query } from "@/lib/db";

export async function getCurrentUserId(): Promise<string | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!(await isValidAuthToken(token))) return null;
  const email = process.env.NEXT_PUBLIC_EMAIL?.trim();
  if (!email) return null;
  try {
    const result = await query<{ id: string }>("SELECT id FROM auth.users WHERE lower(email)=lower($1) LIMIT 1",[email]);
    return result.rows[0]?.id ?? null;
  } catch { return null; }
}