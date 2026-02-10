/**
 * GET /api/area-manager/availability/localities - Localities with rider counts and shortage flags
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import { getLocalitiesWithRiderCounts } from "@/lib/area-manager/queries";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const LOW_AVAILABILITY_THRESHOLD = 2;

export async function GET() {
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

    const localities = await getLocalitiesWithRiderCounts(areaManagerId);
    const withFlags = localities.map((l) => ({
      ...l,
      isZeroCoverage: l.totalRiders === 0,
      isLowAvailability: (l.online + l.busy) <= LOW_AVAILABILITY_THRESHOLD,
    }));

    return NextResponse.json({
      success: true,
      data: withFlags,
    });
  } catch (error) {
    console.error("[GET /api/area-manager/availability/localities]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
