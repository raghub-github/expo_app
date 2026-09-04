/**
 * Loads the Super-Admin hot-zone configuration (rider_hot_zone_config) and merges the
 * pure pressure-model thresholds with the spatial/demand/supply knobs. Falls back to
 * safe defaults when the table is absent (pre-migration) so the API never 500s.
 */
import type { Sql } from "postgres";
import { getSql } from "../../db/client.js";
import { DEFAULT_HOT_ZONE_CONFIG, type HotZoneConfig } from "./pressure-model.js";

export type HotZoneEngineConfig = HotZoneConfig & {
  enabled: boolean;
  h3Resolution: number;
  neighborhoodRings: number;
  supplyRadiusMeters: number;
  demandWindowSeconds: number;
  locationFreshnessMaxAgeMinutes: number;
  validitySeconds: number;
  /** How far around the rider elevated zones are returned (metres). Default 20km. */
  visibilityRadiusMeters: number;
  /** Background reconciler cadence (seconds). */
  reconcileIntervalSeconds: number;
  /** Weight of an already-assigned order as demand (0 = only unassigned backlog counts). */
  demandAssignedWeight: number;
};

export const DEFAULT_ENGINE_CONFIG: HotZoneEngineConfig = {
  ...DEFAULT_HOT_ZONE_CONFIG,
  enabled: true,
  h3Resolution: 8,
  neighborhoodRings: 2,
  supplyRadiusMeters: 6000,
  demandWindowSeconds: 900,
  locationFreshnessMaxAgeMinutes: 10,
  validitySeconds: 120,
  visibilityRadiusMeters: 20000,
  reconcileIntervalSeconds: 45,
  demandAssignedWeight: 0,
};

const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export async function loadHotZoneConfig(sql?: Sql): Promise<HotZoneEngineConfig> {
  const db = sql ?? getSql();
  try {
    const rows = (await db`
      SELECT * FROM rider_hot_zone_config WHERE id = 1 LIMIT 1
    `) as unknown as Array<Record<string, unknown>>;
    const r = rows[0];
    if (!r) return DEFAULT_ENGINE_CONFIG;
    const d = DEFAULT_ENGINE_CONFIG;
    return {
      enabled: r.enabled !== false,
      h3Resolution: num(r.h3_resolution, d.h3Resolution),
      neighborhoodRings: num(r.neighborhood_rings, d.neighborhoodRings),
      supplyRadiusMeters: num(r.supply_radius_meters, d.supplyRadiusMeters),
      demandWindowSeconds: num(r.demand_window_seconds, d.demandWindowSeconds),
      demandHalfLifeSeconds: num(r.demand_half_life_seconds, d.demandHalfLifeSeconds),
      minWeightedDemand: num(r.min_weighted_demand, d.minWeightedDemand),
      supplyRingDecay: num(r.supply_ring_decay, d.supplyRingDecay),
      minSupplyFloor: num(r.min_supply_floor, d.minSupplyFloor),
      locationFreshnessMaxAgeMinutes: num(
        r.location_freshness_max_age_minutes,
        d.locationFreshnessMaxAgeMinutes
      ),
      warmAt: num(r.warm_at, d.warmAt),
      hotAt: num(r.hot_at, d.hotAt),
      criticalAt: num(r.critical_at, d.criticalAt),
      hysteresisMargin: num(r.hysteresis_margin, d.hysteresisMargin),
      validitySeconds: num(r.validity_seconds, d.validitySeconds),
      visibilityRadiusMeters: num(r.visibility_radius_meters, d.visibilityRadiusMeters),
      reconcileIntervalSeconds: num(r.reconcile_interval_seconds, d.reconcileIntervalSeconds),
      demandAssignedWeight: num(r.demand_assigned_weight, d.demandAssignedWeight),
    };
  } catch {
    return DEFAULT_ENGINE_CONFIG;
  }
}

/** Whitelisted, admin-editable config fields (camelCase → the singleton row). */
export type HotZoneConfigPatch = Partial<{
  enabled: boolean;
  h3Resolution: number;
  neighborhoodRings: number;
  supplyRadiusMeters: number;
  demandWindowSeconds: number;
  demandHalfLifeSeconds: number;
  minWeightedDemand: number;
  supplyRingDecay: number;
  minSupplyFloor: number;
  locationFreshnessMaxAgeMinutes: number;
  warmAt: number;
  hotAt: number;
  criticalAt: number;
  hysteresisMargin: number;
  validitySeconds: number;
  visibilityRadiusMeters: number;
  reconcileIntervalSeconds: number;
  demandAssignedWeight: number;
}>;

/**
 * Update the single config row (id=1), COALESCE-merging only the provided fields so an
 * admin can change any subset. Returns the freshly-loaded, fully-typed config.
 */
export async function updateHotZoneConfig(
  patch: HotZoneConfigPatch,
  sql?: Sql
): Promise<HotZoneEngineConfig> {
  const db = sql ?? getSql();
  const p = patch;
  const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
  await db`
    INSERT INTO rider_hot_zone_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `;
  await db`
    UPDATE rider_hot_zone_config SET
      enabled = COALESCE(${orNull(p.enabled)}, enabled),
      h3_resolution = COALESCE(${orNull(p.h3Resolution)}, h3_resolution),
      neighborhood_rings = COALESCE(${orNull(p.neighborhoodRings)}, neighborhood_rings),
      supply_radius_meters = COALESCE(${orNull(p.supplyRadiusMeters)}, supply_radius_meters),
      demand_window_seconds = COALESCE(${orNull(p.demandWindowSeconds)}, demand_window_seconds),
      demand_half_life_seconds = COALESCE(${orNull(p.demandHalfLifeSeconds)}, demand_half_life_seconds),
      min_weighted_demand = COALESCE(${orNull(p.minWeightedDemand)}, min_weighted_demand),
      supply_ring_decay = COALESCE(${orNull(p.supplyRingDecay)}, supply_ring_decay),
      min_supply_floor = COALESCE(${orNull(p.minSupplyFloor)}, min_supply_floor),
      location_freshness_max_age_minutes = COALESCE(${orNull(p.locationFreshnessMaxAgeMinutes)}, location_freshness_max_age_minutes),
      warm_at = COALESCE(${orNull(p.warmAt)}, warm_at),
      hot_at = COALESCE(${orNull(p.hotAt)}, hot_at),
      critical_at = COALESCE(${orNull(p.criticalAt)}, critical_at),
      hysteresis_margin = COALESCE(${orNull(p.hysteresisMargin)}, hysteresis_margin),
      validity_seconds = COALESCE(${orNull(p.validitySeconds)}, validity_seconds),
      visibility_radius_meters = COALESCE(${orNull(p.visibilityRadiusMeters)}, visibility_radius_meters),
      reconcile_interval_seconds = COALESCE(${orNull(p.reconcileIntervalSeconds)}, reconcile_interval_seconds),
      demand_assigned_weight = COALESCE(${orNull(p.demandAssignedWeight)}, demand_assigned_weight),
      updated_at = now()
    WHERE id = 1
  `;
  return loadHotZoneConfig(db);
}
