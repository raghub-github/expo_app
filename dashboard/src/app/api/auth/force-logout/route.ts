import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { forceLogoutUser } from "@/lib/auth/user-management";
import { getUserPermissions } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";

/**
 * Force logout a user from all devices
 * Requires SUPER_ADMIN or ADMIN role with USER management permission
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check permissions
    const email = session.user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    const userPerms = await getUserPermissions(session.user.id, email);
    if (!userPerms) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 403 }
      );
    }

    // Check if user has permission to force logout
    const canForceLogout =
      userPerms.isSuperAdmin ||
      userPerms.permissions.some(
        (p) => p.module === "USERS" && p.action === "UPDATE"
      );

    if (!canForceLogout) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get target user
    const { targetUserId } = await request.json();
    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: "targetUserId required" },
        { status: 400 }
      );
    }

    // Get current user's system ID
    const currentUser = await getSystemUserByEmail(email);
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: "Current user not found" },
        { status: 403 }
      );
    }

    // Force logout
    const result = await forceLogoutUser(
      targetUserId,
      currentUser.id
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
