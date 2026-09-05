/**
 * Rider hot-zone READ — serves the rider app from the persisted, city-wide state that the
 * background reconciler (`hot-zone-reconciler.ts`) computes. The rider app never computes
 * hotness (Part 32/57); the heavy demand/supply/pressure work happens once per tick in the
 * reconciler, and this just returns the elevated cells within the rider's visibility radius
 * (default 20km) for the rider's enabled services.
 *
 * This replaced the old on-demand per-rider computation: recomputing per request left
 * hysteresis dormant and only looked at a ~1.4km neighbourhood. Now the rider sees the whole
 * demand picture around them, and flicker is controlled by the reconciler's persisted state.
 */
import { cellToBoundary } from "h3-js";
import type { Sql } from "postgres";
import { getSql } from "../../db/client.js";
import type { DispatchServiceType } from "@gatimitra/rider-availability";
import type { ZoneStatus } from "./pressure-model.js";
import { loadHotZoneConfig, type HotZoneEngineConfig } from "./hot-zone-config.js";

export type ServiceType = DispatchServiceType; // "food" | "parcel" | "person_ride"

export type HotZoneServiceCell = {
  service: ServiceType;
  status: ZoneStatus;
  demandScore: number;
  supplyScore: number;
  pressure: number;
};

export type HotZoneCell = {
  h3Index: string;
  resolution: number;
  center: { lat: number; lng: number };
  /** GeoJSON ring [lng,lat][] (closed by the client/source as needed). */
  boundary: [number, number][];
  services: HotZoneServiceCell[];
  calculatedAt: string;
  validUntil: string;
};

function serviceFromDbType(t: string | null | undefined): ServiceType | null {
  const x = String(t ?? "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "person_ride" || x === "person" || x === "ride") return "person_ride";
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371008.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

/**
 * Elevated hot zones within the rider's visibility radius, for the rider's enabled services.
 * A bounding-box prefilter narrows the row scan, then an exact haversine trims to the circle.
 * Returns the same `HotZoneCell[]` shape the app already renders — the API is unchanged.
 */
export async function computeHotZonesForRider(args: {
  riderLat: number;
  riderLng: number;
  /** Rider's enabled + vehicle-eligible services (backend-resolved, authoritative). */
  services: ServiceType[];
  sql?: Sql;
  config?: HotZoneEngineConfig;
}): Promise<{ zones: HotZoneCell[]; config: HotZoneEngineConfig }> {
  const db = args.sql ?? getSql();
  const cfg = args.config ?? (await loadHotZoneConfig(db));
  if (
    !cfg.enabled ||
    args.services.length === 0 ||
    !Number.isFinite(args.riderLat) ||
    !Number.isFinite(args.riderLng)
  ) {
    return { zones: [], config: cfg };
  }

  const radiusM = cfg.visibilityRadiusMeters;
  const latDelta = radiusM / 111_320;
  const cosLat = Math.max(0.01, Math.cos((args.riderLat * Math.PI) / 180));
  const lngDelta = radiusM / (111_320 * cosLat);
  const serviceDbTypes = args.services; // 'food'|'parcel'|'person_ride' == order_type enum labels

  const rows = (await db`
    SELECT h3_index, resolution, service_type::text AS service_type, status,
           center_lat, center_lng, weighted_demand, effective_supply, pressure,
           computed_at, valid_until
    FROM rider_hot_zone_state
    WHERE valid_until > now()
      AND service_type::text = ANY (${serviceDbTypes})
      AND center_lat BETWEEN ${args.riderLat - latDelta} AND ${args.riderLat + latDelta}
      AND center_lng BETWEEN ${args.riderLng - lngDelta} AND ${args.riderLng + lngDelta}
  `) as unknown as HotZoneStateReadRow[];

  return { zones: filterZonesWithinRadius(rows, args.riderLat, args.riderLng, radiusM), config: cfg };
}

/** Raw `rider_hot_zone_state` row shape returned by the per-rider read query. */
export type HotZoneStateReadRow = {
  h3_index: string;
  resolution: number | string;
  service_type: string;
  status: string;
  center_lat: number | string;
  center_lng: number | string;
  weighted_demand: number | string;
  effective_supply: number | string;
  pressure: number | string;
  computed_at: string | Date;
  valid_until: string | Date;
};

/**
 * PURE: group state rows by H3 cell and keep only those whose CENTRE is within
 * `radiusMeters` of the rider (exact haversine). This is the guarantee that EVERY rider
 * sees hot zones within their visibility radius (20km) and nothing beyond it — independent
 * of where they are. Unit-testable without a DB.
 */
export function filterZonesWithinRadius(
  rows: HotZoneStateReadRow[],
  riderLat: number,
  riderLng: number,
  radiusMeters: number
): HotZoneCell[] {
  const byCell = new Map<
    string,
    { resolution: number; lat: number; lng: number; validUntil: string; calculatedAt: string; services: HotZoneServiceCell[] }
  >();
  for (const r of rows) {
    const svc = serviceFromDbType(r.service_type);
    if (!svc) continue;
    const clat = Number(r.center_lat);
    const clng = Number(r.center_lng);
    if (!Number.isFinite(clat) || !Number.isFinite(clng)) continue;
    if (haversineMeters(riderLat, riderLng, clat, clng) > radiusMeters) continue;

    let entry = byCell.get(r.h3_index);
    if (!entry) {
      entry = {
        resolution: Number(r.resolution),
        lat: clat,
        lng: clng,
        validUntil: new Date(r.valid_until).toISOString(),
        calculatedAt: new Date(r.computed_at).toISOString(),
        services: [],
      };
      byCell.set(r.h3_index, entry);
    }
    entry.services.push({
      service: svc,
      status: r.status as ZoneStatus,
      demandScore: round2(Number(r.weighted_demand)),
      supplyScore: round2(Number(r.effective_supply)),
      pressure: round2(Number(r.pressure)),
    });
  }

  const zones: HotZoneCell[] = [];
  for (const [h3Index, e] of byCell) {
    if (e.services.length === 0) continue;
    const boundary = cellToBoundary(h3Index, true) as [number, number][]; // GeoJSON [lng,lat]
    zones.push({
      h3Index,
      resolution: e.resolution,
      center: { lat: e.lat, lng: e.lng },
      boundary,
      services: e.services,
      calculatedAt: e.calculatedAt,
      validUntil: e.validUntil,
    });
  }
  return zones;
}
