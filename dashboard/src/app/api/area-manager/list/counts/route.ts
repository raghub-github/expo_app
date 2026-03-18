/**
 * GET /api/area-manager/list/counts
 * Overall count of area managers per type (Merchant, Rider). Super admin only.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { countAreaManagersByType } from "@/lib/area-manager/queries";
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

    if (!resolved.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin access required" },
        { status: 403 }
      );
    }

    const counts = await countAreaManagersByType();
    return NextResponse.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    console.error("[GET /api/area-manager/list/counts]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
