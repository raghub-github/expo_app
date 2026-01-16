/**
 * User Deactivation API Route
 * POST /api/users/[id]/deactivate - Deactivate user
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserById, deactivateSystemUser, getSystemUserByEmail } from "@/lib/db/operations/users";
import { checkPermission } from "@/lib/permissions/engine";
import { logUserAction } from "@/lib/auth/activity-tracker";
import { logUserDeactivation } from "@/lib/audit/audit-logger";

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Require super admin for deactivation
    const { isSuperAdmin } = await import("@/lib/permissions/engine");
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);

    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required to deactivate users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json(
        { success: false, error: "Invalid user ID" },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await getSystemUserById(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Get system user ID for logging
    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Parse request body for reason
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Deactivated by administrator";

    // Deactivate user
    const deactivatedUser = await deactivateSystemUser(userId, reason);

    if (!deactivatedUser) {
      return NextResponse.json(
        { success: false, error: "Failed to deactivate user" },
        { status: 500 }
      );
    }

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logUserAction(
      systemUser.id,
      "DEACTIVATE",
      "USER",
      userId.toString(),
      true,
      { reason },
      ipAddress
    );

    await logUserDeactivation(
      systemUser.id,
      userId,
      reason,
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: deactivatedUser,
    });
  } catch (error) {
    console.error("[POST /api/users/[id]/deactivate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
