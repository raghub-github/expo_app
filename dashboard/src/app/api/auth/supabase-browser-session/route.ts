/**
 * Returns Supabase access + refresh tokens for the current cookie session so the
 * browser `supabase` singleton (localStorage) can authorize Realtime postgres_changes.
 * Server auth uses httpOnly cookies; without this bridge, `supabase.auth.getSession()`
 * in the client is often empty and ticket room sync stays on polling.
 *
 * Cookie-first read only — never calls getUser()/getSession() (those can refresh and
 * race with parallel requests → "Invalid Refresh Token: Already Used").
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  isCookieAccessTokenUsable,
  readCookieAccessSession,
} from "@/lib/auth/read-cookie-access-session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const cookieSession = readCookieAccessSession({
      get: (name) => cookieStore.get(name),
      getAll: () => cookieStore.getAll(),
    });

    if (!cookieSession || !isCookieAccessTokenUsable(cookieSession)) {
      return NextResponse.json({ success: false, code: "NO_SESSION" }, { status: 401 });
    }

    const refreshToken = cookieSession.refreshToken?.trim() ?? "";
    if (!refreshToken) {
      return NextResponse.json({ success: false, code: "NO_SESSION" }, { status: 401 });
    }

    return NextResponse.json(
      {
        success: true,
        access_token: cookieSession.accessToken,
        refresh_token: refreshToken,
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
