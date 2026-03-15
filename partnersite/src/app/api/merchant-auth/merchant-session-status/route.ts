import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
} from "@/lib/auth/session-manager";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { cookies } from "next/headers";

/** GET /api/merchant-auth/merchant-session-status */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, authenticated: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { success: false, authenticated: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200 }
      );
    }

    const cookieStore = await cookies();
    const metadata = getSessionMetadata({
      get: (name: string) => cookieStore.get(name),
    });
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
        email: user.email,
        userId: user.id,
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
    console.error("[merchant-session-status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        code: "SESSION_STATUS_ERROR",
      },
      { status: 500 }
    );
  }
}
