import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { expireSession } from "@/lib/auth/session-manager";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const response = NextResponse.json({ success: true });

  try {
    // Create Supabase client with cookie handling
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            // Clear all auth cookies
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, "", {
                ...options,
                maxAge: 0,
                expires: new Date(0),
              });
              response.cookies.set(name, "", {
                ...options,
                maxAge: 0,
                expires: new Date(0),
              });
            });
          },
        },
      }
    );

    // Try to sign out from Supabase
    // If session is already gone, that's okay - we'll still clear cookies
    const { error } = await supabase.auth.signOut();

    if (error && !error.message.includes("session missing") && !error.message.includes("Auth session missing")) {
      // Only log non-critical errors (session already gone is expected sometimes)
      console.warn("[logout] Supabase signOut warning:", error.message);
    }
  } catch (error) {
    // Ignore errors - we'll still clear cookies
    console.log("[logout] Supabase signOut error (non-critical):", error instanceof Error ? error.message : "Unknown");
  }

  // ALWAYS clear cookies regardless of Supabase signOut result
  // This ensures logout works even if session is already gone

  // Expire custom session management cookies immediately
  const cookieManager = {
    set: (name: string, value: string, options: any) => {
      cookieStore.set(name, value, options);
      response.cookies.set(name, value, options);
    },
  };
  expireSession(cookieManager);

  // Clear all Supabase auth cookies explicitly
  const allCookies = cookieStore.getAll();
  const authCookieNames = allCookies
    .filter(cookie => cookie.name.startsWith("sb-"))
    .map(cookie => cookie.name);

  // Also clear session management cookies
  const sessionCookieNames = [
    "session_start_time",
    "last_activity_time",
    "session_id",
  ];

  const allCookiesToClear = [...authCookieNames, ...sessionCookieNames];

  allCookiesToClear.forEach(name => {
    cookieStore.set(name, "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });
    response.cookies.set(name, "", {
      maxAge: 0,
      expires: new Date(0),
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });
  });

  console.log("[logout] All cookies cleared, session expired");
  return response;
}
