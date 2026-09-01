import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { COREDASH_COOKIE_OPTIONS, isCoredashAuthCookie } from "@/lib/auth/access";
import { expireCoredashCookies } from "@/lib/auth/clear";
import { logAuthEvent } from "@/lib/auth/log";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const response = NextResponse.json({ success: true });
  response.headers.set("Cache-Control", "no-store, private");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient(url, anon, {
    cookieOptions: COREDASH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll().filter((c) => isCoredashAuthCookie(c.name));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options }) => {
          if (!isCoredashAuthCookie(name)) return;
          cookieStore.set(name, "", { ...options, maxAge: 0 });
          response.cookies.set(name, "", { ...options, maxAge: 0 });
        });
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let previousUserId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    previousUserId = data.user?.id ?? null;
  } catch {
    /* still sign out */
  }

  try {
    await supabase.auth.signOut();
  } catch {
    // still clear cookies below
  }

  expireCoredashCookies(
    response,
    cookieStore.getAll().map((c) => c.name)
  );
  logAuthEvent("LOGOUT", { userId: previousUserId, reason: "sign_out" });
  return response;
}
