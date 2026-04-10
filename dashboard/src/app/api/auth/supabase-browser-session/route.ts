/**
 * Returns Supabase access + refresh tokens for the current cookie session so the
 * browser `supabase` singleton (localStorage) can authorize Realtime postgres_changes.
 * Server auth uses httpOnly cookies; without this bridge, `supabase.auth.getSession()`
 * in the client is often empty and ticket room sync stays on polling.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token || !session?.refresh_token) {
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
