/**
 * GET /api/area-manager/metrics
 * Role-based dashboard counts: Merchant AM = stores; Rider AM = riders + availability
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import { countMerchantStoresByStatus, countMerchantParents, countMerchantParentsWithFilters, countChildStores } from "@/lib/db/operations/merchant-stores";
import {
  countRidersByStatus,
  countRidersByAvailability,
  getLocalitiesWithRiderCounts,
} from "@/lib/area-manager/queries";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const LOW_AVAILABILITY_THRESHOLD = 2;
const ZERO_COVERAGE = 0;

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
    // Super admin: null = overall counts. Area manager: use real area_managers.id only.
    const areaManagerId = resolved.isSuperAdmin
      ? null
      : resolved.areaManager.id > 0
        ? resolved.areaManager.id
        : null;

    if (resolved.managerType === "MERCHANT") {
      const counts = await countMerchantStoresByStatus(areaManagerId);
      // Superadmin: complete parent count (all merchant_parents). Area manager: parents that have at least one child under them.
      const parentCount = resolved.isSuperAdmin
        ? await countMerchantParentsWithFilters({ areaManagerId: null })
        : await countMerchantParents(areaManagerId);
      const childCount = await countChildStores(areaManagerId);
      return NextResponse.json({
        success: true,
        data: {
          managerType: "MERCHANT",
          isSuperAdmin: !!resolved.isSuperAdmin,
          stores: {
            total: counts.total,
            verified: counts.verified,
            pending: counts.pending,
            rejected: counts.rejected,
            active: counts.active,
          },
          parents: {
            total: parentCount,
          },
          children: {
            total: childCount,
          },
        },
      });
    }

    const riderCounts = await countRidersByStatus(areaManagerId);
    const availability = await countRidersByAvailability(areaManagerId);
    const localities = await getLocalitiesWithRiderCounts(areaManagerId);
    const shortageAlerts = localities
      .filter(
        (l) =>
          (l.online + l.busy) <= LOW_AVAILABILITY_THRESHOLD ||
          l.totalRiders === ZERO_COVERAGE
      )
      .map((l) => ({
        localityCode: l.localityCode,
        totalRiders: l.totalRiders,
        activeRiders: l.activeRiders,
        online: l.online,
        busy: l.busy,
        offline: l.offline,
        isZeroCoverage: l.totalRiders === ZERO_COVERAGE,
        isLowAvailability: (l.online + l.busy) <= LOW_AVAILABILITY_THRESHOLD,
      }));

    return NextResponse.json({
      success: true,
      data: {
        managerType: "RIDER",
        isSuperAdmin: !!resolved.isSuperAdmin,
        riders: {
          total: riderCounts.total,
          active: riderCounts.active,
          inactive: riderCounts.inactive,
          blocked: riderCounts.blocked,
        },
        availability: {
          online: availability.online,
          busy: availability.busy,
          offline: availability.offline,
        },
        riderShortageAlerts: shortageAlerts,
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/metrics]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
