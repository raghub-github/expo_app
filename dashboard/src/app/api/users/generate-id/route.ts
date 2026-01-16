/**
 * API Route to generate system_user_id
 * GET /api/users/generate-id?role=AGENT
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateSystemUserId } from "@/lib/utils/user-id-generator";
import { checkPermission } from "@/lib/permissions/engine";

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check permission
    const hasPermission = await checkPermission(
      session.user.id,
      session.user.email!,
      "USERS",
      "CREATE"
    );

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Get role from query params
    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get("role");

    if (!role) {
      return NextResponse.json(
        { success: false, error: "Role parameter is required" },
        { status: 400 }
      );
    }

    // Generate system_user_id
    const systemUserId = await generateSystemUserId(role);

    return NextResponse.json({
      success: true,
      data: {
        system_user_id: systemUserId,
      },
    });
  } catch (error) {
    console.error("[GET /api/users/generate-id] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
