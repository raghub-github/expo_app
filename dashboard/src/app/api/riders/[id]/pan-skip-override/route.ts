import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { riders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { logActionFromRequest } from "@/lib/utils/action-audit";
import { getSystemUserByAuthId, getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

/**
 * PATCH /api/riders/[id]/pan-skip-override
 * Enable/disable rider-specific PAN skip. Requires RIDER UPDATE permission + reason when enabling.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 },
        );
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email!, "RIDER");
    const canUpdate =
      userIsSuperAdmin ||
      (await canPerformActionByAuth(user.id, user.email!, "RIDER", "UPDATE", "RIDER"));

    if (!userIsSuperAdmin && (!hasRiderAccess || !canUpdate)) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to modify PAN skip override." },
        { status: 403 },
      );
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (!Number.isFinite(riderId) || riderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
      reason?: string;
    };
    const enabled = Boolean(body.enabled);
    const reason = String(body.reason || "").trim();

    if (enabled && reason.length < 3) {
      return NextResponse.json(
        { success: false, error: "Reason is required to enable PAN skip." },
        { status: 400 },
      );
    }

    const db = getDb();
    const existing = await db
      .select({
        id: riders.id,
        panSkipOverride: riders.panSkipOverride,
        panSkipReason: riders.panSkipReason,
        panSkipEnabledBy: riders.panSkipEnabledBy,
        panSkipEnabledByEmail: riders.panSkipEnabledByEmail,
        panSkipEnabledByName: riders.panSkipEnabledByName,
        panSkipEnabledAt: riders.panSkipEnabledAt,
      })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ success: false, error: "Rider not found" }, { status: 404 });
    }

    let systemUser = await getSystemUserByAuthId(user.id);
    if (!systemUser) systemUser = await getSystemUserByEmail(user.email!);

    const adminId = systemUser?.id ?? null;
    const adminEmail = user.email ?? systemUser?.email ?? null;
    const adminName =
      systemUser?.full_name?.trim() ||
      systemUser?.email ||
      user.email ||
      "Admin";

    const previous = {
      panSkipOverride: existing[0].panSkipOverride,
      panSkipReason: existing[0].panSkipReason,
      panSkipEnabledBy: existing[0].panSkipEnabledBy,
      panSkipEnabledByEmail: existing[0].panSkipEnabledByEmail,
      panSkipEnabledByName: existing[0].panSkipEnabledByName,
      panSkipEnabledAt: existing[0].panSkipEnabledAt,
    };

    const nextValues = enabled
      ? {
          panSkipOverride: true,
          panSkipReason: reason,
          panSkipEnabledBy: adminId,
          panSkipEnabledByEmail: adminEmail,
          panSkipEnabledByName: adminName,
          panSkipEnabledAt: new Date(),
          updatedAt: new Date(),
        }
      : {
          panSkipOverride: false,
          panSkipReason: null,
          panSkipEnabledBy: null,
          panSkipEnabledByEmail: null,
          panSkipEnabledByName: null,
          panSkipEnabledAt: null,
          updatedAt: new Date(),
        };

    await db.update(riders).set(nextValues).where(eq(riders.id, riderId));

    await logActionFromRequest(user.email ?? "", "RIDER", "UPDATE", {
      resourceType: "RIDER",
      resourceId: String(riderId),
      previousValues: previous,
      newValues: {
        panSkipOverride: enabled,
        panSkipReason: enabled ? reason : null,
        panSkipEnabledBy: enabled ? adminId : null,
        panSkipEnabledByEmail: enabled ? adminEmail : null,
        panSkipEnabledByName: enabled ? adminName : null,
      },
      actionDetails: {
        action: enabled ? "PAN_SKIP_ENABLED" : "PAN_SKIP_DISABLED",
        reason: enabled ? reason : previous.panSkipReason,
        riderId,
        adminUserId: adminId,
        adminEmail,
        adminName,
      },
    });

    return NextResponse.json({
      success: true,
      panSkipOverride: enabled,
      panSkipReason: enabled ? reason : null,
      panSkipEnabledBy: enabled ? adminId : null,
      panSkipEnabledByEmail: enabled ? adminEmail : null,
      panSkipEnabledByName: enabled ? adminName : null,
      panSkipEnabledAt: enabled ? new Date().toISOString() : null,
    });
  } catch (error) {
    console.error("[pan-skip-override] PATCH failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update PAN skip override" },
      { status: 500 },
    );
  }
}
