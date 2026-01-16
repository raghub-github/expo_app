import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
} from "@/lib/auth/session-manager";
import { cookies } from "next/headers";

/**
 * GET /api/auth/session-status
 * Returns current session status, time remaining, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: "Not authenticated",
      });
    }

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
    console.error("[session-status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
