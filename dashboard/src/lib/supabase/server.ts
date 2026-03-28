import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export { fetchWithTimeout, AUTH_FETCH_TIMEOUT_MS } from "@/lib/supabase/fetch-timeout";

function getRequiredSupabaseEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

// Server-side Supabase client with service role (for admin operations)
export const supabaseAdmin = supabaseServiceRoleKey && supabaseUrl
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Server-side client for use in Server Components and Server Actions
export async function createServerSupabaseClient() {
  const { supabaseUrl: requiredUrl, supabaseAnonKey: requiredAnonKey } = getRequiredSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(requiredUrl, requiredAnonKey, {
    global: {
      fetch: fetchWithTimeout,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
    auth: {
      autoRefreshToken: false, // Disable auto-refresh to prevent "refresh token already used" errors
      // Token refresh should be handled explicitly, not automatically, to avoid race conditions
      // when multiple API routes call getSession() simultaneously
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
