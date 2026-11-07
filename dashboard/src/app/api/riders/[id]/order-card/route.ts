/**
 * GET /api/riders/[id]/order-card
 * Lean rider card for order detail Summary Info (vehicle, duty, GMitra Max).
 * Avoids the heavy /summary aggregates so the sidebar paints instantly.
 */

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getDb, getSql } from "@/lib/db/client";
import { dutyLogs, riders, riderVehicles } from "@/lib/db/schema";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getCached, setCached } from "@/lib/server-cache";

export const runtime = "nodejs";

function parseRiderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;
    const email = user.email ?? "";

    const allowed =
      (await isSuperAdmin(user.id, email)) ||
      (await hasDashboardAccessByAuth(user.id, email, "RIDER")) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_PARCEL")) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const riderId = parseRiderId(id);
    if (riderId == null) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 }
      );
    }

    const cacheKey = `rider_order_card_v1:${riderId}`;
    const cached = getCached<{
      rider: Record<string, unknown>;
      vehicle: Record<string, unknown> | null;
      gmitraMaxActive: boolean;
    }>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const db = getDb();
    const [riderRow, vehicleRow, latestDuty, gmitraMaxActive] = await Promise.all([
      db
        .select({
          id: riders.id,
          name: riders.name,
          city: riders.city,
          state: riders.state,
        })
        .from(riders)
        .where(eq(riders.id, riderId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          make: riderVehicles.make,
          model: riderVehicles.model,
          registrationNumber: riderVehicles.registrationNumber,
          vehicleType: riderVehicles.vehicleType,
          seatingCapacity: riderVehicles.seatingCapacity,
          serviceTypes: riderVehicles.serviceTypes,
        })
        .from(riderVehicles)
        .where(
          and(eq(riderVehicles.riderId, riderId), eq(riderVehicles.isActive, true))
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          status: dutyLogs.status,
          serviceTypes: dutyLogs.serviceTypes,
          timestamp: dutyLogs.timestamp,
        })
        .from(dutyLogs)
        .where(eq(dutyLogs.riderId, riderId))
        .orderBy(desc(dutyLogs.timestamp))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      (async () => {
        try {
          const sqlClient = getSql();
          const rows = await sqlClient`
            SELECT 1
            FROM rider_subscriptions s
            JOIN subscription_plans p ON p.id = s.plan_id
            WHERE s.rider_id = ${riderId}
              AND s.status = 'active'
              AND p.code = 'GMITRA_MAX'
              AND (
                s.end_date > NOW()
                OR COALESCE(s.auto_wallet_deduction, FALSE) = TRUE
              )
            LIMIT 1
          `;
          return Array.isArray(rows) && rows.length > 0;
        } catch {
          return false;
        }
      })(),
    ]);

    if (!riderRow) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const dutyStatus = String(latestDuty?.status ?? "OFF").toUpperCase();
    const isOnline = dutyStatus === "ON";
    const dutyServicesRaw = latestDuty?.serviceTypes;
    const vehicleServicesRaw = vehicleRow?.serviceTypes;
    const currentDutyServiceTypes = (() => {
      if (!isOnline || dutyServicesRaw == null) return [] as string[];
      if (Array.isArray(dutyServicesRaw)) {
        return dutyServicesRaw.map((s) => String(s ?? "").trim()).filter(Boolean);
      }
      if (typeof dutyServicesRaw === "string") {
        try {
          const parsed = JSON.parse(dutyServicesRaw) as unknown;
          return Array.isArray(parsed)
            ? parsed.map((s) => String(s ?? "").trim()).filter(Boolean)
            : [];
        } catch {
          return [];
        }
      }
      return [];
    })();
    const vehicleServiceTypes = (() => {
      if (Array.isArray(vehicleServicesRaw)) {
        return vehicleServicesRaw.map((s) => String(s ?? "").trim()).filter(Boolean);
      }
      return [] as string[];
    })();

    const data = {
      rider: {
        id: riderRow.id,
        name: riderRow.name,
        city: riderRow.city,
        state: riderRow.state,
        isOnline,
        lastDutyStatus: dutyStatus,
        currentDutyServiceTypes,
      },
      vehicle: vehicleRow
        ? {
            make: vehicleRow.make,
            model: vehicleRow.model,
            registrationNumber: vehicleRow.registrationNumber,
            vehicleType: vehicleRow.vehicleType,
            seatingCapacity: vehicleRow.seatingCapacity,
            serviceTypes: vehicleServiceTypes,
          }
        : null,
      gmitraMaxActive: gmitraMaxActive === true,
    };

    setCached(cacheKey, data, 30_000);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/riders/[id]/order-card] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load rider card" },
      { status: 500 }
    );
  }
}
