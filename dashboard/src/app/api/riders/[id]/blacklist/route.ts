/**
 * POST /api/riders/[id]/blacklist
 * Blacklist or whitelist a rider (per service or all). Reason required. Audit logged.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb, getSql } from "@/lib/db/client";
import { riders, blacklistHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { canPerformRiderServiceAction, canPerformRiderActionAnyService } from "@/lib/permissions/actions";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";

export const runtime = "nodejs";

const SERVICE_TYPES = ["food", "parcel", "person_ride", "all"] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

/** Map API serviceType to DB enum value. PostgreSQL service_type may be FOOD/PARCEL/RIDE (0010) or food/parcel/person_ride/all (0061). Try both. */
function toDbServiceType(serviceType: ServiceType): string {
  switch (serviceType) {
    case "food":
      return "FOOD";
    case "parcel":
      return "PARCEL";
    case "person_ride":
      return "RIDE";
    case "all":
      return "ALL";
    default:
      return serviceType;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email);
    const hasRiderAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email,
      "RIDER"
    );
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. RIDER dashboard access required." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (Number.isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 }
      );
    }

    let body: {
      action: "blacklist" | "whitelist";
      serviceType: string;
      reason: string;
      isPermanent?: boolean;
      expiresAt?: string;
      durationHours?: number;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const action = body.action === "whitelist" ? "whitelist" : "blacklist";
    const serviceType = body.serviceType as ServiceType;
    const reason = String(body.reason ?? "").trim();

    if (!reason) {
      return NextResponse.json(
        { success: false, error: "Reason is required for both blacklist and whitelist." },
        { status: 400 }
      );
    }
    if (!SERVICE_TYPES.includes(serviceType)) {
      return NextResponse.json(
        { success: false, error: "Invalid serviceType. Must be food, parcel, person_ride, or all." },
        { status: 400 }
      );
    }

    const actionType = action === "blacklist" ? "BLOCK" : "UNBLOCK";
    const canAct =
      userIsSuperAdmin ||
      (serviceType === "all"
        ? await canPerformRiderActionAnyService(user.id, user.email, actionType)
        : await canPerformRiderServiceAction(
            user.id,
            user.email,
            serviceType as "food" | "parcel" | "person_ride",
            actionType
          ));
    if (!canAct) {
      return NextResponse.json(
        {
          success: false,
          error:
            action === "blacklist"
              ? "Insufficient permissions. BLOCK (blacklist) access required for this service."
              : "Insufficient permissions. UNBLOCK (whitelist) access required for this service.",
        },
        { status: 403 }
      );
    }

    let isPermanent = false;
    let expiresAt: Date | null = null;

    if (action === "blacklist") {
      if (serviceType === "all") {
        // Permanent blacklist: only "all" is allowed, and it is always permanent
        isPermanent = true;
      } else {
        // Temporary blacklist: food / parcel / person_ride
        isPermanent = Boolean(body.isPermanent);
        if (!isPermanent) {
          if (body.expiresAt) {
            const t = new Date(body.expiresAt);
            if (Number.isNaN(t.getTime())) {
              return NextResponse.json(
                { success: false, error: "Invalid expiresAt date." },
                { status: 400 }
              );
            }
            expiresAt = t;
          } else if (body.durationHours != null && Number(body.durationHours) > 0) {
            expiresAt = new Date(Date.now() + Number(body.durationHours) * 60 * 60 * 1000);
          } else {
            return NextResponse.json(
              { success: false, error: "Temporary blacklist requires expiresAt or durationHours." },
              { status: 400 }
            );
          }
        }
      }
    }

    const db = getDb();
    const [rider] = await db.select().from(riders).where(eq(riders.id, riderId)).limit(1);
    if (!rider) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email);
    const adminUserId = systemUser?.id ?? null;
    const actorEmail = user.email ?? null;

    const dbServiceType = toDbServiceType(serviceType);
    const baseValues = {
      riderId,
      serviceType: dbServiceType as "food" | "parcel" | "person_ride" | "all",
      reason,
      banned: action === "blacklist",
      isPermanent,
      expiresAt,
      adminUserId,
      source: "agent",
    };
    let row: (typeof blacklistHistory.$inferSelect) | undefined;
    try {
      [row] = await db
        .insert(blacklistHistory)
        .values({ ...baseValues, actorEmail })
        .returning();
    } catch (err: unknown) {
      const code = err && typeof err === "object" ? (err as { code?: string; cause?: { code?: string } }).code : undefined;
      const causeCode = err && typeof err === "object" ? (err as { cause?: { code?: string } }).cause?.code : undefined;
      const isMissingColumn = code === "42703" || causeCode === "42703";
      if (isMissingColumn) {
        // actor_email column not yet added (migration 0070 not run); insert without it
        const sql = getSql();
        const expiresAtForSql =
          expiresAt == null ? null : expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt);
        const [rawRow] = await sql`
          INSERT INTO blacklist_history (rider_id, service_type, reason, banned, is_permanent, expires_at, admin_user_id, source)
          VALUES (${riderId}, ${dbServiceType}, ${reason}, ${action === "blacklist"}, ${isPermanent}, ${expiresAtForSql}, ${adminUserId}, 'agent')
          RETURNING id, rider_id, service_type, reason, banned, is_permanent, expires_at, admin_user_id, source, created_at
        `;
        const r = rawRow as { id: number; expires_at: Date | null; source: string; created_at: Date };
        row = { ...r, expiresAt: r.expires_at, createdAt: r.created_at } as unknown as typeof blacklistHistory.$inferSelect;      } else {
        throw err;
      }
    }

    // Update riders.status: BLOCKED when permanently blacklisted for all services
    // When unblocking: only set ACTIVE if onboarding is complete (onboardingStage = ACTIVE), otherwise keep current status or set INACTIVE
    if (action === "blacklist" && isPermanent && serviceType === "all") {
      // Permanent blacklist for all services → status = BLOCKED
      await db.update(riders).set({ status: "BLOCKED" }).where(eq(riders.id, riderId));
    } else if (action === "whitelist") {
      // Unblocking: Only activate if rider has completed onboarding
      // If onboardingStage is ACTIVE, set status to ACTIVE
      // Otherwise, keep INACTIVE (rider must complete onboarding first)
      const newStatus = rider.onboardingStage === "ACTIVE" ? "ACTIVE" : "INACTIVE";
      await db.update(riders).set({ status: newStatus }).where(eq(riders.id, riderId));
    }

    await logActionByAuth(
      user.id,
      user.email,
      "RIDER",
      "CREATE",
      {
        resourceType: "RIDER_BLACKLIST",
        resourceId: String(riderId),
        actionDetails: {
          action,
          serviceType,
          reason,
          isPermanent,
          expiresAt: expiresAt?.toISOString() ?? null,
          source: "agent",
          blacklistHistoryId: row?.id,
        },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: "POST",
        actionStatus: "SUCCESS",
      }
    );

    const toIso = (v: Date | string | null | undefined) =>
      v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();
    return NextResponse.json({
      success: true,
      data: {
        id: row?.id,
        riderId,
        serviceType,
        action,
        reason,
        banned: action === "blacklist",
        isPermanent,
        expiresAt: toIso(row?.expiresAt) ?? null,
        source: row?.source ?? "agent",
        createdAt: toIso(row?.createdAt) ?? undefined,
      },
    });
  } catch (error) {
    console.error("[POST /api/riders/[id]/blacklist] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
