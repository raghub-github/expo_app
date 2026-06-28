import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { getDb, getSql } from "../client";
import { riderLogoutEvents } from "../schema";
import { riderLogoutReasonLabel } from "@/lib/rider-logout-reasons";
import { countActiveRiderDeviceSessionsForDashboard } from "@/lib/db/operations/rider-device-sessions";
import type {
  RiderLogoutEventRow,
  RiderLogoutSessionSnapshot,
} from "@/lib/rider-logout-types";

function mapEvent(row: typeof riderLogoutEvents.$inferSelect): RiderLogoutEventRow {
  const createdAt =
    row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  return {
    id: row.id,
    riderId: row.riderId,
    userId: row.userId,
    deviceId: row.deviceId ?? null,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText ?? null,
    createdAt,
    reasonLabel: riderLogoutReasonLabel(row.reasonCode, row.reasonText),
  };
}

export async function getRiderLogoutEvents(
  riderId: number,
  limit = 100,
): Promise<RiderLogoutEventRow[]> {
  const db = getDb();
  try {
    const rows = await db
      .select()
      .from(riderLogoutEvents)
      .where(eq(riderLogoutEvents.riderId, riderId))
      .orderBy(desc(riderLogoutEvents.createdAt))
      .limit(limit);
    return rows.map(mapEvent);
  } catch {
    return [];
  }
}

async function hasActiveRiderAppSession(riderId: number): Promise<boolean> {
  const sqlClient = getSql();
  const userId = `usr_${riderId}`;
  try {
    const rows = await sqlClient`
      SELECT 1 AS ok
      FROM user_device_sessions
      WHERE (user_id = ${userId} OR rider_id = ${riderId}) AND is_active = TRUE
      LIMIT 1
    `;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function getRiderLogoutSessionSnapshot(
  riderId: number,
): Promise<RiderLogoutSessionSnapshot> {
  const db = getDb();
  const fallback: RiderLogoutSessionSnapshot = {
    status: "logged_in",
    totalLogoutCount: 0,
    activeDeviceCount: 0,
    latest: null,
  };

  try {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(riderLogoutEvents)
      .where(eq(riderLogoutEvents.riderId, riderId));

    const totalLogoutCount = Number(countRow?.count ?? 0);

    const [latestRow] =
      totalLogoutCount > 0
        ? await db
            .select()
            .from(riderLogoutEvents)
            .where(eq(riderLogoutEvents.riderId, riderId))
            .orderBy(desc(riderLogoutEvents.createdAt))
            .limit(1)
        : [undefined];

    const latest = latestRow ? mapEvent(latestRow) : null;
    const hasActiveSession = await hasActiveRiderAppSession(riderId);
    const activeDeviceCount = await countActiveRiderDeviceSessionsForDashboard(riderId);
    const isLoggedIn = hasActiveSession || totalLogoutCount === 0;

    return {
      status: isLoggedIn ? "logged_in" : "logged_out",
      totalLogoutCount,
      activeDeviceCount,
      latest: latest
        ? {
            id: latest.id,
            reasonCode: latest.reasonCode,
            reasonText: latest.reasonText,
            reasonLabel: latest.reasonLabel,
            createdAt: latest.createdAt,
          }
        : null,
    };
  } catch {
    return fallback;
  }
}
