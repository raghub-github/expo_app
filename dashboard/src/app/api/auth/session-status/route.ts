import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
  initializeSession,
  updateActivity,
} from "@/lib/auth/session-manager";
import { isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";
import { cookies } from "next/headers";

/**
 * GET /api/auth/session-status
 * Returns current session status, time remaining, etc.
 * Uses cookie-first auth (getAuthenticatedApiUser) — never signs out on refresh races.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);

    if (!auth.ok) {
      if (auth.status === 503 || auth.status === 499) {
        return NextResponse.json(
          {
            success: false,
            authenticated: false,
            error: auth.body.error,
            code: auth.body.code,
          },
          { status: auth.status, headers: { "Content-Type": "application/json" } }
        );
      }
      // Unauthenticated probe — 200 so login page does not treat as hard failure.
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Not authenticated",
          code: "SESSION_REQUIRED",
        },
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const { user } = auth;

    const cookieStore = await cookies();
    const cookieWrapper = {
      get: (name: string) => cookieStore.get(name),
    };

    let metadata = getSessionMetadata(cookieWrapper);
    let validity = checkSessionValidity(metadata);

    if (!validity.isValid) {
      const cookieManager = {
        get: (name: string) => cookieStore.get(name),
        set: (
          name: string,
          value: string,
          options: {
            maxAge: number;
            path: string;
            httpOnly?: boolean;
            sameSite?: string;
            secure?: boolean;
          }
        ) => {
          cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]);
        },
      };
      metadata = initializeSession(cookieManager);
      updateActivity(cookieManager);
      validity = checkSessionValidity(metadata);
    }

    if (!validity.isValid) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        expired: false,
        session: {
          email: user.email,
          userId: user.id,
          sessionId: metadata?.sessionId,
        },
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
    console.error("[session-status] Error:", error);
    if (isTimeoutOrAbortError(error) || isNetworkOrTransientError(error)) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Service temporarily unavailable",
          code: "SERVICE_UNAVAILABLE",
        },
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
