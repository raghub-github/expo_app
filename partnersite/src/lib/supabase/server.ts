import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createFetchWithTimeout } from "@/lib/auth/fetch-with-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const serverFetch = createFetchWithTimeout(12_000);

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: serverFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set cookies with proper options for SSR
            cookieStore.set(name, value, {
              ...options,
              // Don't override httpOnly if it's explicitly set
              httpOnly: options.httpOnly !== false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
            });
          });
        } catch (error) {
          console.error('Error setting cookies in server client:', error);
        }
      },
    },
  });
}
