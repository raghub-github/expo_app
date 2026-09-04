/**
 * Hot-zone reconciler — the GLOBAL, event-driven + periodic engine (Part 30/44/47).
 *
 * The old engine recomputed per-rider on every request, which left hysteresis dormant
 * (prevStatus was always NORMAL) and only ever looked at the rider's tiny neighbourhood.
 * This computes the WHOLE picture once per tick and persists it to `rider_hot_zone_state`;
 * the per-rider read (`computeHotZonesForRider`) then just filters that table within the
 * rider's visibility radius. Because the previous status is read back in as `prevStatus`,
 * `classifyZone`'s hysteresis is finally live — zones stop flapping between polls.
 *
 * Design (matches the master spec):
 *  - DEMAND is real orders, NOT "a store is online". Only UNASSIGNED (searching) orders are
 *    the pressure backlog by default (`demandAssignedWeight=0`); an already-assigned order is
 *    a rider already committed, so it shows up as reduced supply capacity, not as new demand.
 *  - SUPPLY is the canonical `queryRiderAvailabilityCandidates` (freshness/service/vehicle/
 *    capacity) — the exact engine dispatch uses — so "effective available supply" ≠ "online".
 *  - Global-then-filter: we compute city-wide, batching supply queries by coarse H3 region so
 *    we never full-scan availability once per rider.
 *  - Only WARM/HOT/CRITICAL cells are stored; a cell that falls to NORMAL is dropped.
 */
import { latLngToCell, cellToLatLng, cellToParent, gridDisk, gridDistance } from "h3-js";
import type { Sql } from "postgres";
import { withLock } from "@gatimitra/redis";
import { getSql } from "../../db/client.js";
import {
  queryRiderAvailabilityCandidates,
  type DispatchServiceType,
} from "@gatimitra/rider-availability";
import { classifyZone, demandWeight, supplyContribution, type ZoneStatus } from "./pressure-model.js";
import { loadHotZoneConfig, type HotZoneEngineConfig } from "./hot-zone-config.js";

export type ServiceType = DispatchServiceType; // "food" | "parcel" | "person_ride"

const SERVICES: ServiceType[] = ["food", "parcel", "person_ride"];

/** Orders in these states are no longer live demand. */
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

/** Coarse-region resolution offset used to batch supply queries (res-3 parent ≈ ~8km cell). */
const REGION_RES_OFFSET = 3;

export type HotZoneStateRow = {
  h3Index: string;
  resolution: number;
  service: ServiceType;
  status: ZoneStatus; // never NORMAL (those are dropped)
  centerLat: number;
  centerLng: number;
  weightedDemand: number;
  effectiveSupply: number;
  pressure: number;
  unassignedDemand: number;
  assignedDemand: number;
  orderCount: number;
  supplyCount: number;
};

function orderTypeToService(t: string | null | undefined): ServiceType | null {
  const x = String(t ?? "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "person_ride" || x === "person" || x === "ride") return "person_ride";
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

type DemandCell = {
  weightedDemand: number; // unassigned + assignedWeight*assigned (feeds the score)
  unassigned: number;
  assigned: number;
  orderCount: number;
};

/** Normalized demand event fed to the pure core (DB shape already resolved). */
export type NormalizedOrder = {
  service: ServiceType;
  assigned: boolean; // has a rider_id → already being served (not backlog)
  lat: number;
  lng: number;
  ageSec: number; // seconds since created_at
};

/** Normalized supply candidate (already eligibility-filtered) fed to the pure core. */
export type NormalizedSupply = {
  service: ServiceType;
  lat: number;
  lng: number;
  remainingCapacity: number;
};

/**
 * PURE hot-zone computation — no DB, no time: bucket demand + supply into H3 cells, apply
 * the demand-split (unassigned = backlog, assigned counted only at `demandAssignedWeight`),
 * ring-decay supply, and classify each cell with hysteresis from `prevStatusByKey`. Returns
 * only WARM/HOT/CRITICAL rows. Fully unit-testable — this is the heart of the engine.
 */
export function computeHotZoneRows(args: {
  orders: NormalizedOrder[];
  supply: NormalizedSupply[];
  cfg: HotZoneEngineConfig;
  prevStatusByKey: Map<string, ZoneStatus>;
}): HotZoneStateRow[] {
  const { orders, supply, cfg, prevStatusByKey } = args;
  const res = cfg.h3Resolution;

  // ── DEMAND: orders → (service, cell). Unassigned is the true backlog. ──
  const demand = new Map<ServiceType, Map<string, DemandCell>>(SERVICES.map((s) => [s, new Map()]));
  for (const o of orders) {
    if (!SERVICES.includes(o.service)) continue;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lng)) continue;
    const cell = latLngToCell(o.lat, o.lng, res);
    const w = demandWeight(Math.max(0, o.ageSec), cfg);
    const m = demand.get(o.service)!;
    let dc = m.get(cell);
    if (!dc) {
      dc = { weightedDemand: 0, unassigned: 0, assigned: 0, orderCount: 0 };
      m.set(cell, dc);
    }
    if (o.assigned) {
      dc.assigned += w;
      dc.weightedDemand += w * cfg.demandAssignedWeight;
    } else {
      dc.unassigned += w;
      dc.weightedDemand += w;
    }
    dc.orderCount += 1;
  }

  // ── SUPPLY: candidates → (service, cell) capacity + head-count. ──
  const supplyByService = new Map<ServiceType, Map<string, { cap: number; count: number }>>(
    SERVICES.map((s) => [s, new Map()])
  );
  for (const c of supply) {
    if (!SERVICES.includes(c.service)) continue;
    const cap = Math.max(0, Number(c.remainingCapacity) || 0);
    if (cap <= 0) continue;
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const cell = latLngToCell(c.lat, c.lng, res);
    const map = supplyByService.get(c.service)!;
    const cur = map.get(cell) ?? { cap: 0, count: 0 };
    cur.cap += cap;
    cur.count += 1;
    map.set(cell, cur);
  }

  // ── CLASSIFY each demand cell per service, with hysteresis from persisted prevStatus ──
  const rows: HotZoneStateRow[] = [];
  for (const svc of SERVICES) {
    const demandCells = demand.get(svc)!;
    const supplyMap = supplyByService.get(svc)!;
    for (const [cell, dc] of demandCells) {
      // Effective supply = capacity of nearby candidate cells, ring-decayed.
      let effectiveSupply = 0;
      let supplyCount = 0;
      const disk = gridDisk(cell, cfg.neighborhoodRings);
      for (const nb of disk) {
        const s = supplyMap.get(nb);
        if (!s || s.cap <= 0) continue;
        let ring: number;
        try {
          ring = gridDistance(cell, nb);
        } catch {
          continue;
        }
        if (ring < 0) continue;
        effectiveSupply += supplyContribution(s.cap, ring, cfg);
        if (ring === 0) supplyCount += s.count; // riders in the cell itself (for the panel)
      }

      const key = `${cell}:${svc}`;
      const prevStatus = prevStatusByKey.get(key) ?? "NORMAL";
      const { status, pressure } = classifyZone({
        weightedDemand: dc.weightedDemand,
        effectiveSupply,
        prevStatus,
        cfg,
      });
      if (status === "NORMAL") continue;

      const [clat, clng] = cellToLatLng(cell);
      rows.push({
        h3Index: cell,
        resolution: res,
        service: svc,
        status,
        centerLat: clat,
        centerLng: clng,
        weightedDemand: round2(dc.weightedDemand),
        effectiveSupply: round2(effectiveSupply),
        pressure: round2(pressure),
        unassignedDemand: round2(dc.unassigned),
        assignedDemand: round2(dc.assigned),
        orderCount: dc.orderCount,
        supplyCount,
      });
    }
  }

  return rows;
}

/**
 * Fetch demand (orders) + supply (canonical availability, batched by coarse H3 region so we
 * never full-scan availability once per rider) from the DB, then delegate to the pure
 * `computeHotZoneRows`. Returns only WARM/HOT/CRITICAL cells.
 */
export async function computeGlobalHotZones(
  db: Sql,
  cfg: HotZoneEngineConfig,
  prevStatusByKey: Map<string, ZoneStatus>
): Promise<HotZoneStateRow[]> {
  const res = cfg.h3Resolution;

  // ── DEMAND rows ──
  const orderRows = (await db`
    SELECT order_type, rider_id, pickup_lat, pickup_lon, created_at
    FROM orders_core
    WHERE created_at > now() - (${cfg.demandWindowSeconds}::int * interval '1 second')
      AND status::text <> ALL (${TERMINAL_STATUSES})
      AND pickup_lat IS NOT NULL AND pickup_lon IS NOT NULL
  `) as unknown as Array<{
    order_type: string;
    rider_id: number | null;
    pickup_lat: number | string;
    pickup_lon: number | string;
    created_at: string | Date;
  }>;

  const now = Date.now();
  const orders: NormalizedOrder[] = [];
  const regionSeeds = new Map<ServiceType, Map<string, { lat: number; lng: number }>>(
    SERVICES.map((s) => [s, new Map()])
  );
  for (const o of orderRows) {
    const svc = orderTypeToService(o.order_type);
    if (!svc) continue;
    const lat = Number(o.pickup_lat);
    const lng = Number(o.pickup_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    orders.push({
      service: svc,
      assigned: o.rider_id != null,
      lat,
      lng,
      ageSec: Math.max(0, (now - new Date(o.created_at).getTime()) / 1000),
    });
    // Record the coarse region this demand sits in, so we know where to query supply.
    const region = cellToParent(latLngToCell(lat, lng, res), Math.max(0, res - REGION_RES_OFFSET));
    const seeds = regionSeeds.get(svc)!;
    if (!seeds.has(region)) {
      const [rlat, rlng] = cellToLatLng(region);
      seeds.set(region, { lat: rlat, lng: rlng });
    }
  }

  // ── SUPPLY rows: one availability query per active coarse region, deduped by rider. ──
  const supply: NormalizedSupply[] = [];
  const queryRadius = cfg.supplyRadiusMeters + 8000; // cover riders serving the region's edges
  for (const svc of SERVICES) {
    const seeds = regionSeeds.get(svc)!;
    if (seeds.size === 0) continue;
    const seenRiders = new Set<number>();
    for (const [, center] of seeds) {
      const candidates = await queryRiderAvailabilityCandidates(db, {
        service: svc,
        lat: center.lat,
        lng: center.lng,
        radiusMeters: queryRadius,
        freshnessMaxAgeMinutes: cfg.locationFreshnessMaxAgeMinutes,
      });
      for (const c of candidates) {
        if (!c.eligible) continue;
        if (seenRiders.has(c.riderId)) continue;
        const cap = Math.max(0, Number(c.remainingCapacity) || 0);
        if (cap <= 0) continue;
        if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
        seenRiders.add(c.riderId);
        supply.push({ service: svc, lat: c.lat, lng: c.lng, remainingCapacity: cap });
      }
    }
  }

  return computeHotZoneRows({ orders, supply, cfg, prevStatusByKey });
}

/** Load the current persisted status per (cell, service) so hysteresis has a `prevStatus`. */
async function loadPrevStatus(db: Sql): Promise<Map<string, ZoneStatus>> {
  const rows = (await db`
    SELECT h3_index, service_type::text AS service_type, status
    FROM rider_hot_zone_state
  `) as unknown as Array<{ h3_index: string; service_type: string; status: string }>;
  const map = new Map<string, ZoneStatus>();
  for (const r of rows) {
    const svc = orderTypeToService(r.service_type);
    if (!svc) continue;
    map.set(`${r.h3_index}:${svc}`, r.status as ZoneStatus);
  }
  return map;
}

/** One reconcile pass: compute global state and atomically replace the state table. */
export async function reconcileHotZonesOnce(sql?: Sql): Promise<{ elevated: number }> {
  const db = sql ?? getSql();
  const cfg = await loadHotZoneConfig(db);
  if (!cfg.enabled) {
    // Engine off: clear state so riders see nothing (and readers don't serve stale zones).
    await db`DELETE FROM rider_hot_zone_state`;
    return { elevated: 0 };
  }

  const prev = await loadPrevStatus(db);
  const rows = await computeGlobalHotZones(db, cfg, prev);
  const validUntil = new Date(Date.now() + cfg.validitySeconds * 1000);

  // Atomically swap the table: readers see the old snapshot until COMMIT (MVCC).
  await db.begin(async (tx) => {
    await tx`DELETE FROM rider_hot_zone_state`;
    for (const r of rows) {
      await tx`
        INSERT INTO rider_hot_zone_state
          (h3_index, resolution, service_type, status, center_lat, center_lng,
           weighted_demand, effective_supply, pressure, unassigned_demand, assigned_demand,
           order_count, supply_count, computed_at, valid_until)
        VALUES
          (${r.h3Index}, ${r.resolution}, ${r.service}::order_type, ${r.status},
           ${r.centerLat}, ${r.centerLng}, ${r.weightedDemand}, ${r.effectiveSupply},
           ${r.pressure}, ${r.unassignedDemand}, ${r.assignedDemand}, ${r.orderCount},
           ${r.supplyCount}, now(), ${validUntil})
      `;
    }
  });

  return { elevated: rows.length };
}

// ── Poller (mirrors the notification pollers: Redis-locked, unref'd, fire-once-on-start) ──
const LOCK_KEY = "tick:hot-zone-reconciler";
const LOCK_TTL_MS = 40_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

async function pollOnce(): Promise<void> {
  if (running) return; // never overlap a slow pass with the next tick
  running = true;
  try {
    await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
      const { elevated } = await reconcileHotZonesOnce();
      if (elevated > 0) console.info(`[hot-zones] reconciled — ${elevated} elevated cell(s)`);
    });
  } finally {
    running = false;
  }
}

/** Coalesced on-demand trigger (event-driven): order create/assign can nudge a fast pass. */
let triggerTimer: NodeJS.Timeout | null = null;
export function triggerHotZoneReconcileSoon(delayMs = 3000): void {
  if (triggerTimer) return;
  triggerTimer = setTimeout(() => {
    triggerTimer = null;
    void pollOnce().catch((e) => console.warn("[hot-zones] triggered pass error", (e as Error).message));
  }, delayMs);
  if (triggerTimer.unref) triggerTimer.unref();
}

export async function startHotZoneReconciler(): Promise<void> {
  if (timer) return;
  const cfg = await loadHotZoneConfig().catch(() => null);
  const intervalSec = cfg?.reconcileIntervalSeconds ?? 45;
  const ms = Math.max(15, Math.min(600, intervalSec)) * 1000;

  void pollOnce().catch((e) => console.warn("[hot-zones] initial pass error", (e as Error).message));
  timer = setInterval(() => {
    void pollOnce().catch((e) => console.warn("[hot-zones] poll error", (e as Error).message));
  }, ms);
  if (timer.unref) timer.unref();
}

export function stopHotZoneReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
