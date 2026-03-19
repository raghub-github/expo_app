/**
 * GET /api/area-manager/list?type=MERCHANT|RIDER
 * List all area managers by type. Super admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { listAreaManagersByType } from "@/lib/area-manager/queries";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

    const type = request.nextUrl.searchParams.get("type") as "MERCHANT" | "RIDER" | null;
    if (type !== "MERCHANT" && type !== "RIDER") {
      return NextResponse.json(
        { success: false, error: "Query param type is required: MERCHANT or RIDER" },
        { status: 400 }
      );
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

    const { items, nextCursor } = await listAreaManagersByType({
      managerType: type,
      limit,
      cursor,
    });

    return NextResponse.json({
      success: true,
      data: { items, nextCursor },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/list]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
