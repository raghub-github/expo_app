import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions, canAccessPage } from "@/lib/permissions/engine";
import { toPermissionKeys } from "@/lib/permissions/constants";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { apiErrorResponse } from "@/lib/api-errors";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600]; // after attempt 1 and 2

/**
 * GET /api/auth/permissions
 * Returns user permissions for the authenticated user.
 * Uses getUser() with retry so transient/Supabase errors return 503 (client retries) instead of 401.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    let user: { id: string; email?: string } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user ?? null;
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

    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "No email in session" },
        { status: 400 }
      );
    }

    // Get user permissions
    const userPerms = await getUserPermissions(user.id, email);

    if (!userPerms) {
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          message: "User not found in system_users table",
        },
      });
    }

    const permissionStrings = toPermissionKeys(userPerms.permissions);

    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        systemUserId: userPerms.systemUserId,
        isSuperAdmin: userPerms.isSuperAdmin,
        roles: userPerms.roles,
        permissions: userPerms.permissions,
        permissionStrings,
      },
    });
  } catch (error) {
    console.error("[permissions API] Error:", error);
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/auth/permissions/check
 * Check if user can access a specific page
 */
export async function POST(request: NextRequest) {
  try {
    let body: { pagePath?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }
    const { pagePath } = body;

    if (!pagePath || typeof pagePath !== "string") {
      return NextResponse.json(
        { success: false, error: "pagePath is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    let user: { id: string; email?: string } | null = null;
    let userError: unknown = null;
    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user ?? null;
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

    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "No email in session" },
        { status: 400 }
      );
    }

    // Check page access
    const canAccess = await canAccessPage(user.id, email, pagePath);

    return NextResponse.json({
      success: true,
      data: {
        canAccess,
        pagePath,
      },
    });
  } catch (error) {
    console.error("[permissions API] Error checking page access:", error);
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
