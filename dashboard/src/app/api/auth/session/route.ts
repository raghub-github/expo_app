import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isInvalidRefreshToken, isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";

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
        await supabase.auth.signOut();
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
    const su = user.email ? await getSystemUserByEmail(user.email) : null;
    const systemUser = su
      ? {
          id: su.id,
          systemUserId: su.systemUserId,
          fullName: su.fullName,
          email: su.email,
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
        await supabase.auth.signOut();
      } catch {
        // ignore
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
