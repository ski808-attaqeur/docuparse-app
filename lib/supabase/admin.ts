import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client for route handlers / server actions.
 *
 * Uses the service-role key when available (bypasses RLS, lets background
 * processing write freely). Falls back to the anon key — which still works for
 * all reads/writes in v1 because the migration ships permissive `using (true)`
 * RLS policies. This keeps the app fully functional before the lock-down sprint
 * even when no service-role key is provisioned.
 */
let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and a key (service role or anon).",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const STORAGE_BUCKET = "documents";
