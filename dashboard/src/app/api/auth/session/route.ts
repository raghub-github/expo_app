import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";

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

    // Get session (for tokens); refresh if needed so session stays valid
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError && isInvalidRefreshToken(sessionError)) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    
    // Only return session if it exists and is valid
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No active session", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    // Get user permissions
    const permissions = await getUserPermissions(user.id, user.email || "");

    return NextResponse.json({
      success: true,
      data: {
        session,
        permissions,
      },
    });
  } catch (error) {
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
