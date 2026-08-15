/**
 * Rider geo directory — the Super Admin "Geo Rx Availability" dashboard's view of
 * riders near a point: richer and broader than dispatch's candidate list (any
 * on-duty rider regardless of which services they've selected, plus admin-facing
 * fields like locality/store/stats), but the online/busy/stale/offline status is
 * derived by the SAME freshness rule as `availabilityEngine.ts` — this is what
 * closes the reported bug (dashboard showing a rider ONLINE while the customer
 * app, using `queryRiderAvailabilityCandidates`, correctly refused to dispatch to
 * them because their GPS was stale). Previously this lived as hand-rolled SQL
 * inside `dashboard/src/lib/area-manager/queries.ts`; that file now calls this.
 */
import type { Sql } from "postgres";
import { DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES } from "./availabilityEngine.js";

export type RiderOnlineStatus = "ONLINE" | "BUSY" | "STALE" | "OFFLINE";

/**
 * Pure status derivation — no DB access, unit-testable. Off duty always wins;
 * duty ON with a stale GPS fix is STALE (not ONLINE, not silently OFFLINE) —
 * this is the exact distinction the dashboard was missing before.
 */
export function deriveOnlineStatus(args: {
  dutyStatus: string | null;
  locationFresh: boolean;
  hasActiveOrder: boolean;
}): RiderOnlineStatus {
  if (args.dutyStatus !== "ON") return "OFFLINE";
  if (!args.locationFresh) return "STALE";
  return args.hasActiveOrder ? "BUSY" : "ONLINE";
}

export type RiderGeoDirectoryEntry = {
  riderId: number;
  mobile: string;
  name: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  status: RiderOnlineStatus;
  locationFresh: boolean;
  locationUpdatedAt: Date | null;
  localityCode: string | null;
  city: string | null;
  storeName: string | null;
  /** Active duty services from latest duty_logs — populated regardless of status
   *  (ONLINE/BUSY/STALE all mean "duty ON"; only OFFLINE clears this). */
  dutyServiceTypes: string[];
  currentAssignedOrderDisplayId: string | null;
  totalDeliveredOrders: number;
  totalCancelledOrders: number;
};

type DirectoryRow = {
  id: number;
  mobile: string | null;
  name: string | null;
  lat: number;
  lng: number;
  distance_meters: number | string;
  duty_status: string | null;
  duty_service_types: unknown;
  last_updated_at: Date | null;
  locality_code: string | null;
  city: string | null;
  store_name: string | null;
  current_assigned_order_id: string | null;
  total_delivered: number | string | null;
  total_cancelled: number | string | null;
};

function parseServiceTypesJsonb(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type QueryGeoDirectoryArgs = {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Default RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES (10). */
  freshnessMaxAgeMinutes?: number;
  areaManagerId?: number | null;
  limit?: number;
};

/**
 * Every rider with a GPS fix inside `radiusMeters` of (lat, lng), regardless of
 * which services they've selected (a directory, not a per-service candidate
 * list — see `queryRiderAvailabilityCandidates` for that). Status/freshness use
 * the same rule as the rest of this package.
 */
export async function queryRiderGeoDirectory(
  sql: Sql,
  args: QueryGeoDirectoryArgs
): Promise<RiderGeoDirectoryEntry[]> {
  const { lat, lng, radiusMeters, areaManagerId = null } = args;
  const freshnessMaxAgeMinutes = args.freshnessMaxAgeMinutes ?? DEFAULT_LOCATION_FRESHNESS_MAX_AGE_MINUTES;
  const limit = args.limit ?? 1000;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return [];
  }

  const latDelta = radiusMeters / 111_320;
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusMeters / (111_320 * cosLat);

  const rows = (await sql`
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
        AND rcl.lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
        AND rcl.lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
    ),
    scored AS (
      SELECT
        p.*,
        (
          6371008.8 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(p.lat - ${lat}) / 2), 2) +
            COS(RADIANS(${lat})) * COS(RADIANS(p.lat)) *
            POWER(SIN(RADIANS(p.lng - ${lng}) / 2), 2)
          ))
        ) AS distance_meters
      FROM positioned p
    )
    SELECT
      id, mobile, name, lat, lng, locality_code, city, last_updated_at,
      duty_status, duty_service_types, current_assigned_order_id, store_name,
      total_delivered, total_cancelled, distance_meters
    FROM scored
    WHERE distance_meters <= ${radiusMeters}
    ORDER BY distance_meters ASC
    LIMIT ${limit}
  `) as unknown as DirectoryRow[];

  const now = Date.now();
  return rows.map((row): RiderGeoDirectoryEntry => {
    const locationUpdatedAt = row.last_updated_at ? new Date(row.last_updated_at) : null;
    const locationFresh =
      locationUpdatedAt != null &&
      now - locationUpdatedAt.getTime() <= freshnessMaxAgeMinutes * 60_000;
    const hasActiveOrder = row.current_assigned_order_id != null;
    const status = deriveOnlineStatus({
      dutyStatus: row.duty_status,
      locationFresh,
      hasActiveOrder,
    });
    const dutyServiceTypes = status === "OFFLINE" ? [] : parseServiceTypesJsonb(row.duty_service_types);
    const storeName = row.store_name != null && String(row.store_name).trim() ? String(row.store_name).trim() : null;
    const localityCode = row.locality_code != null ? String(row.locality_code) : null;

    return {
      riderId: Number(row.id),
      mobile: String(row.mobile ?? ""),
      name: row.name != null ? String(row.name) : null,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceMeters: Number(row.distance_meters),
      status,
      locationFresh,
      locationUpdatedAt,
      localityCode,
      city: row.city != null ? String(row.city) : null,
      storeName: storeName ?? localityCode,
      dutyServiceTypes,
      currentAssignedOrderDisplayId: row.current_assigned_order_id,
      totalDeliveredOrders: Number(row.total_delivered ?? 0) || 0,
      totalCancelledOrders: Number(row.total_cancelled ?? 0) || 0,
    };
  });
}
