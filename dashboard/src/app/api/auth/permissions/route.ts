import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { isNetworkOrTransientError, isTimeoutOrAbortError } from "@/lib/auth/session-errors";
import { getUserPermissions, canAccessPage } from "@/lib/permissions/engine";
import { toPermissionKeys } from "@/lib/permissions/constants";
import { apiErrorResponse } from "@/lib/api-errors";

/**
 * GET /api/auth/permissions
 * Returns user permissions for the authenticated user.
 * Uses getUser() with retry so transient/Supabase errors return 503 (client retries) instead of 401.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

    const userPerms = await getUserPermissions(user.id, user.email ?? "");

    if (!userPerms) {
      const response = NextResponse.json({
        success: true,
        data: {
          exists: false,
          message: "User not found in system_users table",
        },
      });
      response.cookies.set("gm_portal_toggle_access", "0", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

    const permissionStrings = toPermissionKeys(userPerms.permissions);

    const response = NextResponse.json({
      success: true,
      data: {
        exists: true,
        systemUserId: userPerms.systemUserId,
        isSuperAdmin: userPerms.isSuperAdmin,
        canTogglePortal: userPerms.canTogglePortal,
        roles: userPerms.roles,
        permissions: userPerms.permissions,
        permissionStrings,
      },
    });
    response.cookies.set("gm_portal_toggle_access", userPerms.canTogglePortal ? "1" : "0", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    if (isTimeoutOrAbortError(error) || isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    console.error("[permissions API] Error:", error);
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

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }
    const { user } = auth;

    const canAccess = await canAccessPage(user.id, user.email ?? "", pagePath);

    return NextResponse.json({
      success: true,
      data: {
        canAccess,
        pagePath,
      },
    });
  } catch (error) {
    if (isTimeoutOrAbortError(error) || isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    console.error("[permissions API] Error checking page access:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
