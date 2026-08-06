/**
 * GET /api/area-manager/availability/geo
 * Riders within radiusKm of lat/lng (live GPS + fallback), with KPIs and insights.
 * Open to any authenticated dashboard agent (same bar as Home) — no AREA_MANAGER grant required.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  getUserDashboardAccess,
  isSuperAdmin,
} from "@/lib/permissions/engine";
import {
  GEO_AVAILABILITY_RADIUS_KM,
  searchRidersNearPoint,
} from "@/lib/area-manager/queries";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const email = auth.user.email;
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const superAdmin = await isSuperAdmin(auth.user.id, email);
    if (!superAdmin) {
      const systemUser = await getSystemUserByEmail(email);
      if (!systemUser) {
        return NextResponse.json(
          { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
          { status: 401 }
        );
      }
      const dashboards = await getUserDashboardAccess(systemUser.id);
      if (dashboards.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Dashboard access required",
            code: "DASHBOARD_ACCESS_REQUIRED",
          },
          { status: 403 }
        );
      }
    }

    // Fleet-wide search for all agents (no AM locality scope).
    const areaManagerId: number | null = null;

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
