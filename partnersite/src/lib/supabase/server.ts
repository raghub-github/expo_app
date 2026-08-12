import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createFetchWithTimeout } from "@/lib/auth/fetch-with-timeout";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const serverFetch = createFetchWithTimeout(5_000);

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
          const authCookies = cookiesToSet.filter((c) => c.name.startsWith("sb-"));
          if (
            authCookies.length > 0 &&
            authCookies.every((c) => !c.value || c.value.length === 0)
          ) {
            return;
          }
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              httpOnly: options.httpOnly !== false,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            });
          });
        } catch (error) {
          console.error("Error setting cookies in server client:", error);
        }
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
