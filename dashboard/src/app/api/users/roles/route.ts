/**
 * User Roles API Route
 * GET /api/users/roles - Get unique roles from system users
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";

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

    // Fetch available roles from system_roles (data-driven)
    const db = getDb();
    const result = await db.execute<{ role_name: string }>(
      sql`SELECT DISTINCT trim(role_name) AS role_name
          FROM public.system_roles
          WHERE (is_active IS NULL OR is_active = TRUE)
          ORDER BY role_name ASC`
    );

    const rows = Array.isArray((result as any).rows)
      ? (result as any).rows
      : (result as any);

    const roles = rows
      .map((r: any) => r.role_name)
      .filter((r: any) => typeof r === "string" && r.length > 0);

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
