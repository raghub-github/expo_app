import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { revokeRiderDeviceSessionsFromDashboard } from "@/lib/db/operations/rider-device-sessions";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email, "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const currentUser = await getSystemUserByEmail(user.email);
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Current user not found" }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const body = (await request.json()) as {
      sessionIds?: number[];
      revokeAll?: boolean;
      reason?: string;
    };

    const revokeAll = body.revokeAll === true;
    const sessionIds = Array.isArray(body.sessionIds)
      ? body.sessionIds.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
      : [];

    if (!revokeAll && sessionIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "sessionIds or revokeAll required" },
        { status: 400 },
      );
    }

    const revokedCount = await revokeRiderDeviceSessionsFromDashboard({
      riderId,
      sessionIds: revokeAll ? undefined : sessionIds,
      revokeAll,
      adminSystemUserId: currentUser.id,
      reason: body.reason,
    });

    await logActionByAuth(
      user.id,
      user.email,
      "RIDER",
      "UPDATE",
      {
        resourceType: "rider_device_session",
        resourceId: String(riderId),
        actionDetails: {
          revokeAll,
          sessionIds: revokeAll ? "all" : sessionIds,
          revokedCount,
          reason: body.reason ?? null,
        },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      },
    );

    return NextResponse.json({ success: true, data: { revokedCount } });
  } catch (error) {
    console.error("[POST /api/riders/[id]/device-sessions/revoke] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
