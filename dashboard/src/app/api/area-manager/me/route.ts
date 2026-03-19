/**
 * GET /api/area-manager/me
 * Returns current area manager type and id for UI (e.g. sidebar filtering).
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const { resolved } = authResult;
    return NextResponse.json({
      success: true,
      data: {
        managerType: resolved.managerType,
        areaManagerId: resolved.isSuperAdmin ? null : resolved.areaManager.id,
        areaManagerName: resolved?.areaManager?.areaCode ?? null,
        areaManagerPhone: null,
        areaManagerEmail: null,
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/me]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
