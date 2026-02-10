/**
 * GET /api/area-manager/availability/by-store - Store to assigned locality and rider availability
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import { getStoreByIdForAvailability } from "@/lib/db/operations/stores";
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

    const storeId = request.nextUrl.searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json(
        { success: false, error: "storeId is required" },
        { status: 400 }
      );
    }

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;
    const store = await getStoreByIdForAvailability(parseInt(storeId, 10));
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const localityCode = store.localityCode ?? undefined;
    const availability = await countRidersByAvailability(
      areaManagerId,
      localityCode || null
    );

    return NextResponse.json({
      success: true,
      data: {
        storeId: store.id,
        storeExternalId: store.storeId,
        storeName: store.name,
        localityCode: store.localityCode,
        areaCode: store.areaCode,
        availability: {
          online: availability.online,
          busy: availability.busy,
          offline: availability.offline,
        },
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/availability/by-store]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
