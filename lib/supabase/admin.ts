import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only. Never import this from a Client Component or expose the
// service role key to the browser. Route handlers use this so a single
// server-side write (e.g. creating a message plus its per-app target rows)
// isn't constrained by per-table RLS checks written for the anon key.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
