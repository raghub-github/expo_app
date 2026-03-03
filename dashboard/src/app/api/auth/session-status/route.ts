import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
} from "@/lib/auth/session-manager";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { cookies } from "next/headers";

/**
 * GET /api/auth/session-status
 * Returns current session status, time remaining, etc.
 * Uses getUser() to avoid triggering token refresh (prevents "refresh_token_already_used" when called in parallel with other routes).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, authenticated: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
      if (isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, authenticated: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = { user };

    // Get session metadata from cookies
    const cookieStore = await cookies();
    const cookieWrapper = {
      get: (name: string) => cookieStore.get(name),
    };

    const metadata = getSessionMetadata(cookieWrapper);
    const validity = checkSessionValidity(metadata);

    if (!validity.isValid) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        expired: true,
        reason: validity.reason,
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      expired: false,
      session: {
        email: session.user.email,
        userId: session.user.id,
        sessionId: metadata?.sessionId,
        timeRemaining: validity.timeRemaining,
        timeRemainingFormatted: validity.timeRemaining
          ? formatTimeRemaining(validity.timeRemaining)
          : "Expired",
        daysRemaining: validity.daysRemaining,
        sessionStartTime: metadata?.sessionStartTime,
        lastActivityTime: metadata?.lastActivityTime,
      },
    });
  } catch (error) {
    if (isInvalidRefreshToken(error)) {
      try {
        const supabase = await createServerSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      return NextResponse.json(
        { success: false, authenticated: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("[session-status] Error:", error);
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        code: "SESSION_STATUS_ERROR",
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
