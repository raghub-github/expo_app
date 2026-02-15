import { NextResponse } from "next/server";

/**
 * GET /api/auth/env-check
 * Returns which auth-related env vars are set (names only, no values).
 * Use in dev to confirm NEXTAUTH_URL, NEXTAUTH_SECRET, and Google are configured.
 * In production you may want to disable or protect this route.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Env check is disabled in production" },
      { status: 404 }
    );
  }
  const nextAuthUrl = !!process.env.NEXTAUTH_URL;
  const nextAuthSecret = !!process.env.NEXTAUTH_SECRET;
  const googleClientId = !!process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  const supabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    ok: true,
    auth: {
      NEXTAUTH_URL: nextAuthUrl,
      NEXTAUTH_SECRET: nextAuthSecret,
      GOOGLE_CLIENT_ID: googleClientId,
      GOOGLE_CLIENT_SECRET: googleClientSecret,
      "Google login available": googleClientId && googleClientSecret,
      "NextAuth session (no CLIENT_FETCH_ERROR)": nextAuthUrl && nextAuthSecret,
    },
    supabase: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon,
      "Merchant login (email/password)": supabaseUrl && supabaseAnon,
    },
  });
}
