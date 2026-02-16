import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { expireSession } from "@/lib/auth/session-manager";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const response = NextResponse.json({ success: true });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, "", { ...options, maxAge: 0, expires: new Date(0) });
              response.cookies.set(name, "", { ...options, maxAge: 0, expires: new Date(0) });
            });
          },
        },
      }
    );
    await supabase.auth.signOut();
  } catch {
    // ignore
  }

  const cookieManager = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieStore.set(name, value, options as any);
      response.cookies.set(name, value, options as any);
    },
  };
  expireSession(cookieManager);

  const allCookies = cookieStore.getAll();
  const authCookieNames = allCookies
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => c.name);
  const sessionNames = ["session_start_time", "last_activity_time", "session_id"];
  [...authCookieNames, ...sessionNames].forEach((name) => {
    cookieStore.set(name, "", { maxAge: 0, expires: new Date(0), path: "/", httpOnly: false, sameSite: "lax" });
    response.cookies.set(name, "", { maxAge: 0, expires: new Date(0), path: "/", httpOnly: false, sameSite: "lax" });
  });

  return response;
}
