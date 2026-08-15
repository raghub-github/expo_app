/**
 * Area manager scoped queries: riders list, metrics, availability, activity logs.
 */

import { getDb } from "@/lib/db/client";
import { riders, activityLogs, stores, areaManagers, systemUsers } from "@/lib/db/schema";
import {
  eq,
  and,
  lt,
  isNull,
  or,
  ilike,
  desc,
  sql,
  type SQL,
  type InferInsertModel,
} from "drizzle-orm";

export type RiderScopedUpdate = Partial<
  Pick<InferInsertModel<typeof riders>, "status" | "availabilityStatus" | "localityCode" | "updatedBy">
>;

export interface AreaManagerListRow {
  id: number;
  userId: number;
  managerType: string;
  areaCode: string | null;
  localityCode: string | null;
  city: string | null;
  status: string;
  fullName: string | null;
  email: string | null;
}

/**
 * Get overall count of area managers per type (MERCHANT, RIDER). For super admin only.
 */
export async function countAreaManagersByType(): Promise<{ merchant: number; rider: number }> {
  const db = getDb();
  const rows = await db
    .select({
      managerType: areaManagers.managerType,
      count: sql<number>`count(*)::int`,
    })
    .from(areaManagers)
    .groupBy(areaManagers.managerType);

  let merchant = 0;
  let rider = 0;
  for (const r of rows) {
    if (r.managerType === "MERCHANT") merchant = Number(r.count ?? 0);
    if (r.managerType === "RIDER") rider = Number(r.count ?? 0);
  }
  return { merchant, rider };
}

/**
 * List all area managers by manager_type (MERCHANT | RIDER). For super admin only.
 */
export async function listAreaManagersByType(params: {
  managerType: "MERCHANT" | "RIDER";
  limit?: number;
  cursor?: string;
}): Promise<{ items: AreaManagerListRow[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(params.limit ?? 50, 100);
  const limitVal = limit + 1;

  const cursorId = params.cursor ? parseInt(params.cursor, 10) : undefined;
  const whereConditions =
    cursorId != null && !isNaN(cursorId)
      ? and(eq(areaManagers.managerType, params.managerType), lt(areaManagers.id, cursorId))
      : eq(areaManagers.managerType, params.managerType);

  const rows = await db
    .select({
      id: areaManagers.id,
      userId: areaManagers.userId,
      managerType: areaManagers.managerType,
      areaCode: areaManagers.areaCode,
      localityCode: areaManagers.localityCode,
      city: areaManagers.city,
      status: areaManagers.status,
      fullName: systemUsers.fullName,
      email: systemUsers.email,
    })
    .from(areaManagers)
    .innerJoin(systemUsers, eq(areaManagers.userId, systemUsers.id))
    .where(whereConditions)
    .orderBy(desc(areaManagers.id))
    .limit(limitVal);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;
  return {
    items: items.map((r) => ({
      id: r.id,
      userId: r.userId,
      managerType: r.managerType,
      areaCode: r.areaCode,
      localityCode: r.localityCode,
      city: r.city,
      status: r.status,
      fullName: r.fullName ?? null,
      email: r.email ?? null,
    })),
    nextCursor,
  };
}

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
    scopeWhere = and(scopeWhere, eq(riders.areaManagerId, areaManagerId))!;
  }
  if (localityCode?.trim()) {
    scopeWhere = and(scopeWhere, eq(riders.localityCode, localityCode.trim()))!;  }

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
  data: RiderScopedUpdate
) {
  const db = getDb();
  const conditions = [eq(riders.id, riderId), isNull(riders.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(riders.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .update(riders)
    .set({ ...data, updatedAt: new Date() } as Partial<typeof riders.$inferInsert>)
    .where(and(...conditions))
    .returning();
  return row ?? null;
}

export const GEO_AVAILABILITY_RADIUS_KM = [1, 2, 3, 5, 10] as const;
export type GeoAvailabilityRadiusKm = (typeof GEO_AVAILABILITY_RADIUS_KM)[number];

export interface GeoRiderNearPoint {
  id: number;
  mobile: string;
  name: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  /** ONLINE | BUSY | STALE | OFFLINE. STALE = duty ON but GPS ping older than the
   *  freshness threshold — same threshold the customer-facing serviceability check
   *  enforces, so a STALE rider here is exactly a rider the customer app would NOT
   *  count as available (this is what previously showed as ONLINE unconditionally). */
  status: string;
  localityCode: string | null;
  storeName: string | null;
  lastUpdatedAt: string | null;
  /** Whether lastUpdatedAt is within the dispatch freshness window right now. */
  locationFresh: boolean;
  /** Active duty services from latest duty_logs (food / parcel / person_ride). */
  activeServices: string[];
  currentAssignedOrderId: string | null;
  totalDeliveredOrders: number;
  totalCancelledOrders: number;
  city: string | null;
}

export interface GeoRiderSearchResult {
  center: { lat: number; lng: number };
  radiusKm: number;
  kpis: {
    total: number;
    available: number;
    busy: number;
    /** Duty ON but GPS stale — not counted in `available`, shown separately so an
     *  admin can tell "no rider exists" apart from "rider exists but invisible". */
    stale: number;
    offline: number;
    coveragePct: number;
  };
  riders: GeoRiderNearPoint[];
  insights: {
    nearest: GeoRiderNearPoint | null;
    farthest: GeoRiderNearPoint | null;
    avgDistanceKm: number | null;
    recommendedRadiusKm: number;
  };
}

function isAllowedRadiusKm(n: number): n is GeoAvailabilityRadiusKm {
  return (GEO_AVAILABILITY_RADIUS_KM as readonly number[]).includes(n);
}

function parseServiceTypes(raw: unknown): string[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  }
  const out: string[] = [];
  for (const item of arr) {
    const s = String(item ?? "")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");
    if (!s) continue;
    if (s === "food" || s === "parcel" || s === "person_ride" || s === "person") {
      out.push(s === "person" ? "person_ride" : s);
    }
  }
  return Array.from(new Set(out));
}

/**
 * Search riders currently located within radiusKm of (lat, lng).
 * Uses live GPS only (rider_current_locations) — never onboarding/profile lat/lon.
 *
 * Status is derived from duty_logs (source of truth for online/offline) + active
 * orders_core assignment (BUSY). Do NOT use riders.availability_status — it is stale.
 *
 * KPIs / insights / rider list are computed only from riders inside the selected radius.
 */
export async function searchRidersNearPoint(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  areaManagerId: number | null;
}): Promise<GeoRiderSearchResult> {
  const { getSql } = await import("@/lib/db/client");
  const { DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES } = await import("@gatimitra/rider-availability");
  const sql = getSql();
  const freshnessMinutes = DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES;
  const lat = params.lat;
  const lng = params.lng;
  const radiusKm = isAllowedRadiusKm(params.radiusKm) ? params.radiusKm : 3;
  const areaManagerId = params.areaManagerId;
  const maxRadius = GEO_AVAILABILITY_RADIUS_KM[GEO_AVAILABILITY_RADIUS_KM.length - 1]!;
  // Rough degree pad for bbox prefilter (~111 km per degree lat).
  const padDeg = (maxRadius / 111) * 1.2;

  const rows = await sql`
    WITH positioned AS (
      SELECT
        r.id,
        r.mobile,
        r.name,
        r.locality_code,
        r.city,
        rcl.lat AS lat,
        rcl.lng AS lng,
        rcl.updated_at AS last_updated_at,
        ld.duty_status,
        ld.service_types AS duty_service_types,
        ao.order_display_id AS current_assigned_order_id,
        ao.store_name AS store_name,
        COALESCE(stats.delivered_count, 0) AS total_delivered,
        COALESCE(stats.cancelled_count, 0) AS total_cancelled
      FROM public.rider_current_locations rcl
      INNER JOIN public.riders r ON r.id = rcl.rider_id
      LEFT JOIN LATERAL (
        SELECT
          dl.status::text AS duty_status,
          dl.service_types
        FROM public.duty_logs dl
        WHERE dl.rider_id = r.id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            NULLIF(TRIM(oc.formatted_order_id), ''),
            NULLIF(TRIM(oc.order_id), ''),
            oc.id::text
          ) AS order_display_id,
          ms.store_name AS store_name
        FROM public.orders_core oc
        LEFT JOIN public.merchant_stores ms ON ms.id = oc.merchant_store_id
        WHERE oc.rider_id = r.id
          AND oc.cancelled_at IS NULL
          AND lower(COALESCE(oc.status::text, '')) NOT IN (
            'delivered', 'cancelled', 'failed', 'rejected'
          )
          AND lower(COALESCE(oc.current_status, '')) NOT IN (
            'delivered', 'cancelled', 'canceled', 'failed', 'rejected',
            'rto', 'rto_initiated', 'rto_in_transit', 'rto_delivered', 'rto_lost'
          )
        ORDER BY oc.updated_at DESC NULLS LAST, oc.id DESC
        LIMIT 1
      ) ao ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (
            WHERE lower(ora.assignment_status::text) = 'completed'
          )::int AS delivered_count,
          COUNT(*) FILTER (
            WHERE lower(ora.assignment_status::text) IN (
              'cancelled', 'rejected', 'failed', 'unassigned'
            )
          )::int AS cancelled_count
        FROM public.order_rider_assignments ora
        WHERE ora.rider_id = r.id
      ) stats ON true
      WHERE r.deleted_at IS NULL
        AND (${areaManagerId}::int IS NULL OR r.area_manager_id = ${areaManagerId})
        AND rcl.lat IS NOT NULL
        AND rcl.lng IS NOT NULL
        AND rcl.lat BETWEEN ${lat - padDeg} AND ${lat + padDeg}
        AND rcl.lng BETWEEN ${lng - padDeg} AND ${lng + padDeg}
    ),
    with_distance AS (
      SELECT
        p.*,
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${lat})) * cos(radians(p.lat))
              * cos(radians(p.lng) - radians(${lng}))
              + sin(radians(${lat})) * sin(radians(p.lat))
            ))
          )
        ) AS distance_km,
        (
          p.last_updated_at IS NOT NULL
          AND p.last_updated_at >= NOW() - (${freshnessMinutes} * INTERVAL '1 minute')
        ) AS location_fresh,
        CASE
          WHEN upper(COALESCE(p.duty_status, '')) = 'ON'
            AND p.last_updated_at IS NOT NULL
            AND p.last_updated_at >= NOW() - (${freshnessMinutes} * INTERVAL '1 minute')
            AND p.current_assigned_order_id IS NOT NULL THEN 'BUSY'
          WHEN upper(COALESCE(p.duty_status, '')) = 'ON'
            AND p.last_updated_at IS NOT NULL
            AND p.last_updated_at >= NOW() - (${freshnessMinutes} * INTERVAL '1 minute')
            THEN 'ONLINE'
          -- Duty ON but GPS stale/missing: NOT available (matches the customer-facing
          -- serviceability check's freshness gate) — surfaced distinctly, not silently
          -- merged into OFFLINE, so an admin can see the rider exists but is invisible.
          WHEN upper(COALESCE(p.duty_status, '')) = 'ON' THEN 'STALE'
          ELSE 'OFFLINE'
        END AS status
      FROM positioned p
    )
    SELECT
      id,
      mobile,
      name,
      lat,
      lng,
      distance_km,
      status,
      location_fresh,
      locality_code,
      city,
      store_name,
      last_updated_at,
      duty_service_types,
      current_assigned_order_id,
      total_delivered,
      total_cancelled
    FROM with_distance
    WHERE distance_km <= ${maxRadius}
    ORDER BY distance_km ASC
    LIMIT 1000
  `;

  const allWithinMax: GeoRiderNearPoint[] = (rows as Record<string, unknown>[]).map((row) => {
    const last = row.last_updated_at;
    let lastUpdatedAt: string | null = null;
    if (last instanceof Date) lastUpdatedAt = last.toISOString();
    else if (last != null) {
      const d = new Date(String(last));
      lastUpdatedAt = Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const status = String(row.status ?? "OFFLINE").toUpperCase();
    const activeServices =
      status === "ONLINE" || status === "BUSY" || status === "STALE"
        ? parseServiceTypes(row.duty_service_types)
        : [];
    const storeName =
      row.store_name != null && String(row.store_name).trim()
        ? String(row.store_name).trim()
        : null;
    const localityCode =
      row.locality_code != null ? String(row.locality_code) : null;
    return {
      id: Number(row.id),
      mobile: String(row.mobile ?? ""),
      name: row.name != null ? String(row.name) : null,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceKm: Math.round(Number(row.distance_km) * 1000) / 1000,
      status,
      locationFresh: Boolean(row.location_fresh),
      localityCode,
      storeName: storeName ?? localityCode,
      lastUpdatedAt,
      activeServices,
      currentAssignedOrderId:
        row.current_assigned_order_id != null
          ? String(row.current_assigned_order_id)
          : null,
      totalDeliveredOrders: Number(row.total_delivered ?? 0) || 0,
      totalCancelledOrders: Number(row.total_cancelled ?? 0) || 0,
      city: row.city != null ? String(row.city) : null,
    };
  });

  const riders = allWithinMax.filter((r) => r.distanceKm <= radiusKm);

  let available = 0;
  let busy = 0;
  let stale = 0;
  let offline = 0;
  for (const r of riders) {
    if (r.status === "ONLINE") available += 1;
    else if (r.status === "BUSY") busy += 1;
    else if (r.status === "STALE") stale += 1;
    else offline += 1;
  }
  const total = riders.length;
  const coveragePct = total > 0 ? Math.round((available / total) * 1000) / 10 : 0;

  const nearest = riders[0] ?? null;
  const farthest = riders.length > 0 ? riders[riders.length - 1]! : null;
  const avgDistanceKm =
    total > 0
      ? Math.round((riders.reduce((s, r) => s + r.distanceKm, 0) / total) * 1000) / 1000
      : null;

  let recommendedRadiusKm = radiusKm;
  let foundRecommend = false;
  for (const rk of GEO_AVAILABILITY_RADIUS_KM) {
    const onlineN = allWithinMax.filter((r) => r.distanceKm <= rk && r.status === "ONLINE").length;
    if (onlineN >= 3) {
      recommendedRadiusKm = rk;
      foundRecommend = true;
      break;
    }
  }
  if (!foundRecommend) {
    const idx = GEO_AVAILABILITY_RADIUS_KM.indexOf(radiusKm as GeoAvailabilityRadiusKm);
    recommendedRadiusKm =
      idx >= 0 && idx < GEO_AVAILABILITY_RADIUS_KM.length - 1
        ? GEO_AVAILABILITY_RADIUS_KM[idx + 1]!
        : radiusKm;
  }

  return {
    center: { lat, lng },
    radiusKm,
    kpis: { total, available, busy, stale, offline, coveragePct },
    riders,
    insights: {
      nearest,
      farthest,
      avgDistanceKm,
      recommendedRadiusKm,
    },
  };
}


