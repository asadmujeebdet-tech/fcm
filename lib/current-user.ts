import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";

export async function getCurrentUserId(): Promise<string | null> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!(await isValidAuthToken(token))) return null;

  const email = process.env.NEXT_PUBLIC_EMAIL;
  if (!email) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserByEmail(email);
  if (error || !data.user) return null;

  return data.user.id;
}
