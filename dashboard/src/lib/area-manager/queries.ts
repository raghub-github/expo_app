/**
 * Area manager scoped queries: riders list, metrics, availability, activity logs.
 */

import { getDb } from "@/lib/db/client";
import { riders, activityLogs, stores } from "@/lib/db/schema";
import { eq, and, isNull, or, ilike, desc, sql, type SQL } from "drizzle-orm";

const RIDER_STATUS_ACTIVE = "ACTIVE";
const RIDER_STATUS_INACTIVE = "INACTIVE";
const RIDER_STATUS_BLOCKED = "BLOCKED";

export interface ListRidersParams {
  areaManagerId: number | null;
  status?: "ACTIVE" | "INACTIVE" | "BLOCKED";
  localityCode?: string | null;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface RiderListRow {
  id: number;
  mobile: string;
  name: string | null;
  status: string;
  localityCode: string | null;
  availabilityStatus: string;
  createdAt: Date;
}

/**
 * List riders scoped by area_manager_id (and optional locality_code)
 */
export async function listRidersByAreaManager(
  params: ListRidersParams
): Promise<{ items: RiderListRow[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(params.limit || 20, 100);
  const conditions: SQL[] = [isNull(riders.deletedAt)];

  if (params.areaManagerId !== null) {
    conditions.push(eq(riders.areaManagerId, params.areaManagerId));
  }
  if (params.status) {
    conditions.push(eq(riders.status, params.status));
  }
  if (params.localityCode?.trim()) {
    conditions.push(eq(riders.localityCode, params.localityCode.trim()));
  }
  if (params.search?.trim()) {
    const term = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(riders.name, term),
        ilike(riders.mobile, term),
        sql`${riders.id}::text LIKE ${term}`
      )!
    );
  }

  const baseWhere = and(...conditions);
  let whereClause: SQL | undefined = baseWhere;
  if (params.cursor) {
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      whereClause = and(baseWhere, sql`${riders.id} < ${cursorId}`);
    }
  }

  const items = await db
    .select({
      id: riders.id,
      mobile: riders.mobile,
      name: riders.name,
      status: riders.status,
      localityCode: riders.localityCode,
      availabilityStatus: riders.availabilityStatus,
      createdAt: riders.createdAt,
    })
    .from(riders)
    .where(whereClause)
    .orderBy(desc(riders.id))
    .limit(limit + 1);

  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, limit) : items;
  const last = result[result.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;

  return {
    items: result as RiderListRow[],
    nextCursor,
  };
}

/**
 * Rider counts by status for area manager
 */
export async function countRidersByStatus(
  areaManagerId: number | null
): Promise<{
  total: number;
  active: number;
  inactive: number;
  blocked: number;
}> {
  const db = getDb();
  const baseWhere = isNull(riders.deletedAt);
  const scopeWhere =
    areaManagerId !== null
      ? and(baseWhere, eq(riders.areaManagerId, areaManagerId))
      : baseWhere;

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(scopeWhere);

  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.status, RIDER_STATUS_ACTIVE)));

  const [inactive] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.status, RIDER_STATUS_INACTIVE)));

  const [blocked] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.status, RIDER_STATUS_BLOCKED)));

  return {
    total: total?.count ?? 0,
    active: active?.count ?? 0,
    inactive: inactive?.count ?? 0,
    blocked: blocked?.count ?? 0,
  };
}

/**
 * Availability counts: online, busy, offline (for riders in scope)
 */
export async function countRidersByAvailability(
  areaManagerId: number | null,
  localityCode?: string | null
): Promise<{ online: number; busy: number; offline: number }> {
  const db = getDb();
  const baseWhere = isNull(riders.deletedAt);
  let scopeWhere: SQL = baseWhere;
  if (areaManagerId !== null) {
    scopeWhere = and(scopeWhere, eq(riders.areaManagerId, areaManagerId));
  }
  if (localityCode?.trim()) {
    scopeWhere = and(scopeWhere, eq(riders.localityCode, localityCode.trim()));
  }

  const [online] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.availabilityStatus, "ONLINE")));

  const [busy] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.availabilityStatus, "BUSY")));

  const [offline] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(riders)
    .where(and(scopeWhere, eq(riders.availabilityStatus, "OFFLINE")));

  return {
    online: online?.count ?? 0,
    busy: busy?.count ?? 0,
    offline: offline?.count ?? 0,
  };
}

/**
 * Localities with rider counts and availability (for shortage/zero coverage)
 */
export async function getLocalitiesWithRiderCounts(
  areaManagerId: number | null
): Promise<
  Array<{
    localityCode: string | null;
    totalRiders: number;
    activeRiders: number;
    online: number;
    busy: number;
    offline: number;
  }>
> {
  const db = getDb();
  const baseWhere = isNull(riders.deletedAt);
  const scopeWhere =
    areaManagerId !== null
      ? and(baseWhere, eq(riders.areaManagerId, areaManagerId))
      : baseWhere;

  const rows = await db
    .select({
      localityCode: riders.localityCode,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${riders.status} = 'ACTIVE')::int`,
      online: sql<number>`count(*) filter (where ${riders.availabilityStatus} = 'ONLINE')::int`,
      busy: sql<number>`count(*) filter (where ${riders.availabilityStatus} = 'BUSY')::int`,
      offline: sql<number>`count(*) filter (where ${riders.availabilityStatus} = 'OFFLINE')::int`,
    })
    .from(riders)
    .where(scopeWhere)
    .groupBy(riders.localityCode);

  return rows.map((r) => ({
    localityCode: r.localityCode,
    totalRiders: r.total,
    activeRiders: r.active,
    online: r.online,
    busy: r.busy,
    offline: r.offline,
  }));
}

/**
 * Activity logs for area manager (actor_id = system user or entity in their scope)
 */
export interface ListActivityLogsParams {
  areaManagerId: number | null;
  systemUserId: number;
  entityType?: string;
  limit: number;
  cursor?: string;
}

export async function listActivityLogs(
  params: ListActivityLogsParams
): Promise<{ items: Array<{ id: number; actorId: number | null; action: string; entityType: string; entityId: number; createdAt: Date }>; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(params.limit || 20, 100);
  const conditions = [eq(activityLogs.actorId, params.systemUserId)];
  if (params.entityType?.trim()) {
    conditions.push(eq(activityLogs.entityType, params.entityType.trim()));
  }

  const baseWhere = and(...conditions);
  let whereClause: SQL | undefined = baseWhere;
  if (params.cursor) {
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      whereClause = and(baseWhere, sql`${activityLogs.id} < ${cursorId}`);
    }
  }

  const items = await db
    .select({
      id: activityLogs.id,
      actorId: activityLogs.actorId,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(whereClause)
    .orderBy(desc(activityLogs.id))
    .limit(limit + 1);

  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, limit) : items;
  const last = result[result.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;

  return {
    items: result.map((r) => ({ ...r, entityId: Number(r.entityId) })),
    nextCursor,
  };
}

/**
 * Get single rider by id scoped by area_manager_id (null = no scope)
 */
export async function getRiderByIdScoped(
  riderId: number,
  areaManagerId: number | null
) {
  const db = getDb();
  const conditions = [eq(riders.id, riderId), isNull(riders.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(riders.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .select()
    .from(riders)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/**
 * Update rider (e.g. status) scoped by area_manager_id
 */
export async function updateRiderScoped(
  riderId: number,
  areaManagerId: number | null,
  data: { status?: string; availabilityStatus?: string; localityCode?: string | null; updatedBy?: number }
) {
  const db = getDb();
  const conditions = [eq(riders.id, riderId), isNull(riders.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(riders.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .update(riders)
    .set({ ...data, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  return row ?? null;
}
