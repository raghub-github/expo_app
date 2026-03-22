/**
 * GET /api/area-manager/riders/[id] - Get one rider
 * PATCH /api/area-manager/riders/[id] - Update rider (e.g. block/unblock)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import {
  getRiderByIdScoped,
  updateRiderScoped,
  type RiderScopedUpdate,
} from "@/lib/area-manager/queries";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider id" }, { status: 400 });
    }

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;
    const rider = await getRiderByIdScoped(riderId, areaManagerId);
    if (!rider) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rider,
    });
  } catch (error) {
    console.error("[GET /api/area-manager/riders/[id]]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider id" }, { status: 400 });
    }

    const body = await request.json();
    const { status: riderStatus, availabilityStatus, localityCode } = body;

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const RIDER_STATUSES = ["INACTIVE", "ACTIVE", "BLOCKED", "BANNED"] as const;
    const AVAIL_STATUSES = ["ONLINE", "BUSY", "OFFLINE"] as const;

    const updateData: RiderScopedUpdate = { updatedBy: resolved.systemUserId };
    if (riderStatus !== undefined) {
      if (!RIDER_STATUSES.includes(riderStatus)) {
        return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
      }
      updateData.status = riderStatus;
    }
    if (availabilityStatus !== undefined) {
      if (!AVAIL_STATUSES.includes(availabilityStatus)) {
        return NextResponse.json({ success: false, error: "Invalid availability status" }, { status: 400 });
      }
      updateData.availabilityStatus = availabilityStatus;
    }
    if (localityCode !== undefined) updateData.localityCode = localityCode?.trim() ?? null;

    const updated = await updateRiderScoped(riderId, areaManagerId, updateData);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    const action =
      riderStatus === "BLOCKED"
        ? "RIDER_BLOCKED"
        : riderStatus === "ACTIVE"
          ? "RIDER_ACTIVATED"
          : "RIDER_UPDATED";
    await logAreaManagerActivity({
      actorId: resolved.systemUserId,
      action,
      entityType: "rider",
      entityId: riderId,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[PATCH /api/area-manager/riders/[id]]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
