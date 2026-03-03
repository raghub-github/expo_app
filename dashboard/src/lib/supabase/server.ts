import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Auth request timeout (ms). Fail fast so UI gets 503 in ~8s instead of 30s+ on network issues. */
const AUTH_FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Server-side Supabase client with service role (for admin operations)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Server-side client for use in Server Components and Server Actions
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
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
