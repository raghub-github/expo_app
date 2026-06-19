/**
 * Returns Supabase access + refresh tokens for the current cookie session so the
 * browser `supabase` singleton (localStorage) can authorize Realtime postgres_changes.
 * Server auth uses httpOnly cookies; without this bridge, `supabase.auth.getSession()`
 * in the client is often empty and ticket room sync stays on polling.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      if (userError && isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
      }
      return NextResponse.json({ success: false, code: "NO_SESSION" }, { status: 401 });
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError && isInvalidRefreshToken(sessionError)) {
      await supabase.auth.signOut();
      return NextResponse.json({ success: false, code: "NO_SESSION" }, { status: 401 });
    }

    if (sessionError || !session?.access_token || !session?.refresh_token) {
      return NextResponse.json({ success: false, code: "NO_SESSION" }, { status: 401 });
    }

    return NextResponse.json(
      {
        success: true,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json({ success: false, code: "ERROR" }, { status: 500 });
  }
}
