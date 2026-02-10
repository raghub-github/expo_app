/**
 * GET /api/area-manager/activity-logs - List activity for current area manager
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { listActivityLogs } from "@/lib/area-manager/queries";
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
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const searchParams = request.nextUrl.searchParams;
    const entityType = searchParams.get("entityType") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const { items, nextCursor } = await listActivityLogs({
      areaManagerId,
      systemUserId: resolved.systemUserId,
      entityType,
      limit,
      cursor,
    });

    return NextResponse.json({
      success: true,
      data: { items, nextCursor },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/activity-logs]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
