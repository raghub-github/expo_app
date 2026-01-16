import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserPermissions, canAccessPage } from "@/lib/permissions/engine";

/**
 * GET /api/auth/permissions
 * Returns user permissions for the authenticated user
 * This runs in Node.js runtime (not Edge), so it can use postgres-js
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    
    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = session.user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "No email in session" },
        { status: 400 }
      );
    }

    // Get user permissions
    const userPerms = await getUserPermissions(session.user.id, email);

    if (!userPerms) {
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          message: "User not found in system_users table",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        systemUserId: userPerms.systemUserId,
        isSuperAdmin: userPerms.isSuperAdmin,
        roles: userPerms.roles,
        permissions: userPerms.permissions,
      },
    });
  } catch (error) {
    console.error("[permissions API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/permissions/check
 * Check if user can access a specific page
 */
export async function POST(request: NextRequest) {
  try {
    const { pagePath } = await request.json();

    if (!pagePath || typeof pagePath !== "string") {
      return NextResponse.json(
        { success: false, error: "pagePath is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    
    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const email = session.user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "No email in session" },
        { status: 400 }
      );
    }

    // Check page access
    const canAccess = await canAccessPage(session.user.id, email, pagePath);

    return NextResponse.json({
      success: true,
      data: {
        canAccess,
        pagePath,
      },
    });
  } catch (error) {
    console.error("[permissions API] Error checking page access:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
