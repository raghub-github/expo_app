/**
 * User Activation API Route
 * POST /api/users/[id]/activate - Activate user
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserById, activateSystemUser, getSystemUserByEmail } from "@/lib/db/operations/users";
import { checkPermission } from "@/lib/permissions/engine";
import { logUserAction } from "@/lib/auth/activity-tracker";
import { logUserActivation } from "@/lib/audit/audit-logger";

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

    // Require super admin for activation
    const { isSuperAdmin } = await import("@/lib/permissions/engine");
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);

    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required to activate users" },
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

    // Activate user
    const activatedUser = await activateSystemUser(userId, systemUser.id, systemUser.fullName);

    if (!activatedUser) {
      return NextResponse.json(
        { success: false, error: "Failed to activate user" },
        { status: 500 }
      );
    }

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logUserAction(
      systemUser.id,
      "ACTIVATE",
      "USER",
      userId.toString(),
      true,
      {},
      ipAddress
    );

    await logUserActivation(
      systemUser.id,
      userId,
      ipAddress
    );

    return NextResponse.json({
      success: true,
      data: activatedUser,
    });
  } catch (error) {
    console.error("[POST /api/users/[id]/activate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
