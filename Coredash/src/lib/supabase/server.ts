import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COREDASH_COOKIE_OPTIONS, isCoredashAuthCookie } from "@/lib/auth/access";

export async function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: COREDASH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll().filter((c) => isCoredashAuthCookie(c.name));
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (!isCoredashAuthCookie(name)) return;
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always set cookies.
        }
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
