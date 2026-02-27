/**
 * User Roles API Route
 * GET /api/users/roles - Get unique roles from system users
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUniqueRoles } from "@/lib/db/operations/users";
import { checkPermission } from "@/lib/permissions/engine";

export const runtime = 'nodejs';

/**
 * GET /api/users/roles
 * Get unique roles from system users
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(
      user.id,
      user.email ?? "",
      "USERS",
      "VIEW"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Fetch unique roles
    const roles = await getUniqueRoles();

    return NextResponse.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    console.error("[GET /api/users/roles] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
