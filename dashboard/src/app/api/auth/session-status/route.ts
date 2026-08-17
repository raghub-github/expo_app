import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import {
  getSessionMetadata,
  checkSessionValidity,
  formatTimeRemaining,
  initializeSession,
  updateActivity,
  expireSession,
  isMeaningfulActivityRequest,
} from "@/lib/auth/session-manager";
import { isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";
import { cookies } from "next/headers";

/**
 * GET /api/auth/session-status
 * Returns current unified session status (48h rolling / 24h idle / 7d absolute).
 * Uses cookie-first auth — never signs out on refresh races.
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

    let metadata = getSessionMetadata(cookieWrapper);
    let validity = checkSessionValidity(metadata);

    // First authenticated hit without partner cookies → create unified session once.
    if (!metadata || validity.reason === "no_session") {
      metadata = initializeSession(cookieManager);
      validity = checkSessionValidity(metadata);
    } else if (!validity.isValid) {
      // Idle / rolling / absolute expiry — do NOT re-init; require fresh login.
      expireSession(cookieManager);
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          expired: true,
          error: "Session expired",
          code:
            validity.reason === "expired_inactivity"
              ? "SESSION_IDLE_EXPIRED"
              : validity.reason === "expired_max_duration"
                ? "SESSION_ABSOLUTE_EXPIRED"
                : "SESSION_EXPIRED",
          reason: validity.reason,
        },
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else if (
      isMeaningfulActivityRequest(
        request.nextUrl.pathname,
        request.method,
        request.nextUrl.search
      )
    ) {
      // session-status itself is a background poll — isBackgroundPollRequest covers it,
      // so this branch normally no-ops. Kept for consistency if the path list changes.
      updateActivity(cookieManager);
      metadata = getSessionMetadata(cookieWrapper) ?? metadata;
      validity = checkSessionValidity(metadata);
    }

    if (!validity.isValid || !metadata) {
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
        sessionId: metadata.sessionId,
        timeRemaining: validity.timeRemaining,
        timeRemainingFormatted: validity.timeRemaining
          ? formatTimeRemaining(validity.timeRemaining)
          : "Expired",
        daysRemaining: validity.daysRemaining,
        sessionStartTime: metadata.sessionStartTime,
        lastActivityTime: metadata.lastActivityTime,
        idleExpiresAt: validity.idleExpiresAt,
        rollingExpiresAt: validity.rollingExpiresAt,
        absoluteExpiresAt: validity.absoluteExpiresAt,
        effectiveExpiresAt: validity.effectiveExpiresAt,
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
