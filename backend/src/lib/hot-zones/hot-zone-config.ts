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
    };
  } catch {
    return DEFAULT_ENGINE_CONFIG;
  }
}
