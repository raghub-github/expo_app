import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions/engine";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isTimeoutOrAbortError,
  signOutIfSessionDead,
} from "@/lib/auth/session-errors";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    let user: { id: string; email?: string; [key: string]: unknown } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user ? { ...result.data.user, id: result.data.user.id, email: result.data.user.email } : null;
      userError = result.error ?? null;

      if (!userError && user) break;
      if (userError && isRefreshTokenAlreadyUsed(userError) && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 400));
        continue;
      }
      if (userError && isInvalidRefreshToken(userError)) break;
      if (userError && isTimeoutOrAbortError(userError)) break;
      if (userError && isNetworkOrTransientError(userError) && attempt < maxGetUserAttempts) {
        const delay = retryDelaysMs[attempt - 1] ?? 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }

    if (userError || !user) {
      if (userError && isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        if (isRefreshTokenAlreadyUsed(userError)) {
          return NextResponse.json(
            { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
            { status: 503 }
          );
        }
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    // Return user + permissions only. Do not call getSession() here to avoid "Invalid Refresh Token: Already Used"
    // when multiple requests run in parallel (getSession() can refresh the token; only one use is allowed).
    // Auth is cookie-based; the client does not need session tokens in the response.
    const permissions = await getUserPermissions(user.id, user.email || "");
    const mapped = await resolveSystemUserForSupabaseAuth(user.id, user.email);
    const systemUser = mapped
      ? {
          id: mapped.id,
          systemUserId: mapped.system_user_id,
          fullName: mapped.full_name,
          email: mapped.email,
        }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        session: { user },
        permissions,
        systemUser,
      },
    });
  } catch (error) {
    if (isInvalidRefreshToken(error)) {
      try {
        const supabase = await createServerSupabaseClient();
        await signOutIfSessionDead(supabase, error);
      } catch {
        // ignore
      }
      if (isRefreshTokenAlreadyUsed(error)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
