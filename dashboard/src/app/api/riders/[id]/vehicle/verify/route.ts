/**
 * POST /api/riders/[id]/vehicle/verify — mark active rider vehicle as verified
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riderVehicles } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { triggerRiderVehicleVerifiedNotify } from "@/lib/triggerRiderVehicleVerifiedNotify";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const email = user.email ?? "";
    const userIsSuperAdmin = await isSuperAdmin(user.id, email);
    const canApprove = await canPerformActionByAuth(
      user.id,
      email,
      "RIDER",
      "APPROVE",
      "RIDER_DOCUMENT",
    );

    if (!userIsSuperAdmin && !canApprove) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to verify vehicle" },
        { status: 403 },
      );
    }

    const agent = await getSystemUserByEmail(email);
    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent account not found" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 },
      );
    }

    const db = getDb();

    let [vehicle] = await db
      .select()
      .from(riderVehicles)
      .where(and(eq(riderVehicles.riderId, riderId), eq(riderVehicles.isActive, true)))
      .orderBy(desc(riderVehicles.updatedAt))
      .limit(1);

    if (!vehicle) {
      [vehicle] = await db
        .select()
        .from(riderVehicles)
        .where(eq(riderVehicles.riderId, riderId))
        .orderBy(desc(riderVehicles.updatedAt))
        .limit(1);
    }

    if (!vehicle) {
      return NextResponse.json(
        { success: false, error: "No vehicle found for this rider" },
        { status: 404 },
      );
    }

    if (vehicle.verified) {
      return NextResponse.json({
        success: true,
        data: { vehicleId: vehicle.id, alreadyVerified: true },
      });
    }

    const now = new Date();
    await db
      .update(riderVehicles)
      .set({
        verified: true,
        verifiedAt: now,
        verifiedBy: agent.id,
        updatedAt: now,
      })
      .where(eq(riderVehicles.id, vehicle.id));

    void triggerRiderVehicleVerifiedNotify(riderId);

    return NextResponse.json({
      success: true,
      data: { vehicleId: vehicle.id, verified: true, verifiedAt: now.toISOString() },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/vehicle/verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify vehicle" },
      { status: 500 },
    );
  }
}
