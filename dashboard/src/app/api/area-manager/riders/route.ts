/**
 * GET /api/area-manager/riders - List riders (Rider AM)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import { listRidersByAreaManager } from "@/lib/area-manager/queries";
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
    const err = requireRiderManager(authResult.resolved);
    if (err) return err;

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as "ACTIVE" | "INACTIVE" | "BLOCKED" | undefined;
    const localityCode = searchParams.get("localityCode") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const { items, nextCursor } = await listRidersByAreaManager({
      areaManagerId,
      status,
      localityCode,
      search,
      limit,
      cursor,
    });

    return NextResponse.json({
      success: true,
      data: { items, nextCursor },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/riders]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
