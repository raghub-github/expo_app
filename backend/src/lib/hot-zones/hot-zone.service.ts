/**
 * Rider hot-zone engine — backend-authoritative demand/supply pressure over H3 cells.
 *
 * Reuses the CANONICAL engines (Part 44): supply comes from
 * `queryRiderAvailabilityCandidates` (the same freshness/service/vehicle/capacity logic
 * dispatch uses), demand comes from recent `orders_core` at pickup. Both are bucketed
 * into H3 cells; the pure `pressure-model` classifies each cell per service. The rider
 * app receives the result — it never computes hotness (Part 32/57).
 *
 * Scope of THIS phase: on-demand computation for the rider's H3 neighbourhood, filtered
 * to the rider's enabled services. Hysteresis (Part 28) and persisted expiry (Part 29)
 * are wired for once the event-driven persistence layer lands — `classifyZone` already
 * accepts a prevStatus; here prevStatus is NORMAL (strict enter thresholds).
 */
import { latLngToCell, cellToBoundary, cellToLatLng, gridDisk, gridDistance } from "h3-js";
import type { Sql } from "postgres";
import { getSql } from "../../db/client.js";
import {
  queryRiderAvailabilityCandidates,
  type DispatchServiceType,
} from "@gatimitra/rider-availability";
import { classifyZone, demandWeight, supplyContribution, type ZoneStatus } from "./pressure-model.js";
import { loadHotZoneConfig, type HotZoneEngineConfig } from "./hot-zone-config.js";

export type ServiceType = DispatchServiceType; // "food" | "parcel" | "person_ride"

/** Orders in these states are no longer demand (delivered is realized; the rest are dead). */
const TERMINAL_STATUSES = [
  "delivered",
  "cancelled",
  "failed",
  "rejected",
  "reached_user",
  "rto_initiated",
  "rto_in_transit",
  "rto_delivered",
  "rto_lost",
];

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

function orderTypeToService(t: string | null | undefined): ServiceType | null {
  const x = String(t ?? "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "person_ride" || x === "person" || x === "ride") return "person_ride";
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

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

  const res = cfg.h3Resolution;
  const originCell = latLngToCell(args.riderLat, args.riderLng, res);
  const neighborhood = gridDisk(originCell, cfg.neighborhoodRings);
  const neighborhoodSet = new Set(neighborhood);
  const serviceSet = new Set(args.services);

  // ---- DEMAND: recent, non-terminal orders at pickup → H3 cell, per service, time-decayed
  const demand = new Map<string, Map<ServiceType, number>>();
  const orders = (await db`
    SELECT order_type, pickup_lat, pickup_lon, created_at
    FROM orders_core
    WHERE created_at > now() - (${cfg.demandWindowSeconds}::int * interval '1 second')
      AND status::text <> ALL (${TERMINAL_STATUSES})
      AND pickup_lat IS NOT NULL AND pickup_lon IS NOT NULL
  `) as unknown as Array<{
    order_type: string;
    pickup_lat: number | string;
    pickup_lon: number | string;
    created_at: string | Date;
  }>;
  const now = Date.now();
  for (const o of orders) {
    const svc = orderTypeToService(o.order_type);
    if (!svc || !serviceSet.has(svc)) continue;
    const lat = Number(o.pickup_lat);
    const lng = Number(o.pickup_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const cell = latLngToCell(lat, lng, res);
    if (!neighborhoodSet.has(cell)) continue;
    const ageSec = Math.max(0, (now - new Date(o.created_at).getTime()) / 1000);
    const w = demandWeight(ageSec, cfg);
    let m = demand.get(cell);
    if (!m) {
      m = new Map();
      demand.set(cell, m);
    }
    m.set(svc, (m.get(svc) ?? 0) + w);
  }

  // ---- SUPPLY: eligible riders (canonical engine) → H3 cell, capacity + ring-decay
  const supply = new Map<string, Map<ServiceType, number>>();
  for (const svc of args.services) {
    const candidates = await queryRiderAvailabilityCandidates(db, {
      service: svc,
      lat: args.riderLat,
      lng: args.riderLng,
      radiusMeters: cfg.supplyRadiusMeters,
      freshnessMaxAgeMinutes: cfg.locationFreshnessMaxAgeMinutes,
    });
    for (const c of candidates) {
      if (!c.eligible) continue; // duty/service/vehicle/freshness already enforced
      const cap = Math.max(0, Number(c.remainingCapacity) || 0);
      if (cap <= 0) continue; // at capacity → no supply contribution
      if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
      const riderCell = latLngToCell(c.lat, c.lng, res);
      for (const cell of neighborhood) {
        let ring: number;
        try {
          ring = gridDistance(riderCell, cell);
        } catch {
          continue; // non-adjacent across an icosahedron boundary — skip
        }
        if (ring < 0) continue;
        const contrib = supplyContribution(cap, ring, cfg);
        if (contrib <= 0) continue;
        let m = supply.get(cell);
        if (!m) {
          m = new Map();
          supply.set(cell, m);
        }
        m.set(svc, (m.get(svc) ?? 0) + contrib);
      }
    }
  }

  // ---- CLASSIFY per cell per service; surface only cells with an elevated service
  const calculatedAt = new Date();
  const validUntil = new Date(calculatedAt.getTime() + cfg.validitySeconds * 1000);
  const zones: HotZoneCell[] = [];
  for (const cell of neighborhood) {
    const cellServices: HotZoneServiceCell[] = [];
    for (const svc of args.services) {
      const d = demand.get(cell)?.get(svc) ?? 0;
      const s = supply.get(cell)?.get(svc) ?? 0;
      const { status, pressure } = classifyZone({ weightedDemand: d, effectiveSupply: s, cfg });
      if (status === "NORMAL") continue;
      cellServices.push({
        service: svc,
        status,
        demandScore: round2(d),
        supplyScore: round2(s),
        pressure: round2(pressure),
      });
    }
    if (cellServices.length === 0) continue;
    const [clat, clng] = cellToLatLng(cell);
    const boundary = cellToBoundary(cell, true) as [number, number][]; // GeoJSON [lng,lat]
    zones.push({
      h3Index: cell,
      resolution: res,
      center: { lat: clat, lng: clng },
      boundary,
      services: cellServices,
      calculatedAt: calculatedAt.toISOString(),
      validUntil: validUntil.toISOString(),
    });
  }

  return { zones, config: cfg };
}
