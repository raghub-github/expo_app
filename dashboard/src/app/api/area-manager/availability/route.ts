/**
 * GET /api/area-manager/availability - Aggregated counts: online, busy, offline
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import { countRidersByAvailability } from "@/lib/area-manager/queries";
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
    const localityCode = request.nextUrl.searchParams.get("localityCode") ?? undefined;

    const counts = await countRidersByAvailability(
      areaManagerId,
      localityCode || null
    );

    return NextResponse.json({
      success: true,
      data: {
        online: counts.online,
        busy: counts.busy,
        offline: counts.offline,
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/availability]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
