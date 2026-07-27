/**
 * GET /api/area-manager/availability/geo
 * Riders within radiusKm of lat/lng (live GPS + fallback), with KPIs and insights.
 * Any area-manager session (or super admin) may access — Rider AM role not required.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth } from "@/lib/area-manager/auth";
import {
  GEO_AVAILABILITY_RADIUS_KM,
  searchRidersNearPoint,
} from "@/lib/area-manager/queries";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function riderScopeAreaManagerId(resolved: {
  isSuperAdmin?: boolean;
  managerType: string;
  areaManager: { id: number };
}): number | null {
  if (resolved.isSuperAdmin) return null;
  if (resolved.managerType === "RIDER" && resolved.areaManager.id > 0) {
    return resolved.areaManager.id;
  }
  // Merchant AM / other: unscoped fleet view for availability checks
  return null;
}

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
    const areaManagerId = riderScopeAreaManagerId(resolved);

    const sp = request.nextUrl.searchParams;
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    const radiusRaw = Number(sp.get("radiusKm") ?? "3");

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        { success: false, error: "Valid lat is required (-90..90)", code: "INVALID_LAT" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return NextResponse.json(
        { success: false, error: "Valid lng is required (-180..180)", code: "INVALID_LNG" },
        { status: 400 }
      );
    }
    const radiusKm = (GEO_AVAILABILITY_RADIUS_KM as readonly number[]).includes(radiusRaw)
      ? radiusRaw
      : 3;

    const data = await searchRidersNearPoint({
      lat,
      lng,
      radiusKm,
      areaManagerId,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/area-manager/availability/geo]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
