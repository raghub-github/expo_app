/**
 * Per-service batching config loader (dispatch_batch_config). DB-backed with a short cache and a
 * safe code default (disabled) so the batching engine never blocks live dispatch if the table is
 * missing or a read fails. Person Ride batching is force-disabled regardless of the stored row.
 */
import { getSql } from "../../db/client.js";
import type { BatchRouteConfig } from "./batch-route.js";
import type { BatchService } from "./batch-eligibility.js";

export type ServiceBatchConfig = BatchRouteConfig & {
  serviceType: BatchService;
  enabled: boolean;
  batchWindowSec: number;
};

export const BATCH_SERVICES: BatchService[] = ["food", "parcel", "person_ride"];

function codeDefault(service: BatchService): ServiceBatchConfig {
  return {
    serviceType: service,
    enabled: false, // dark by default
    avgSpeedKmph: 18,
    pickupServiceMin: 3,
    dropServiceMin: 2,
    maxPickupDetourKm: 2,
    maxPickupDetourMin: 8,
    maxExtraDropDelayMin: 10,
    sameStoreBonus: 6,
    batchWindowSec: 20,
  };
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; map: Map<BatchService, ServiceBatchConfig> } | null = null;

export async function loadBatchConfig(): Promise<Map<BatchService, ServiceBatchConfig>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map;
  const map = new Map<BatchService, ServiceBatchConfig>();
  for (const s of BATCH_SERVICES) map.set(s, codeDefault(s));
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT service_type, enabled,
             max_pickup_detour_km::float8 AS max_pickup_detour_km,
             max_pickup_detour_min::float8 AS max_pickup_detour_min,
             max_extra_drop_delay_min::float8 AS max_extra_drop_delay_min,
             avg_speed_kmph::float8 AS avg_speed_kmph,
             pickup_service_min::float8 AS pickup_service_min,
             drop_service_min::float8 AS drop_service_min,
             same_store_bonus::float8 AS same_store_bonus,
             batch_window_sec
      FROM dispatch_batch_config
      WHERE service_type IN ('food','parcel','person_ride')
    `) as unknown as Array<{
      service_type: BatchService;
      enabled: boolean;
      max_pickup_detour_km: number;
      max_pickup_detour_min: number;
      max_extra_drop_delay_min: number;
      avg_speed_kmph: number;
      pickup_service_min: number;
      drop_service_min: number;
      same_store_bonus: number;
      batch_window_sec: number;
    }>;
    for (const r of rows) {
      map.set(r.service_type, {
        serviceType: r.service_type,
        // Person Ride is never batchable, whatever the row says.
        enabled: r.service_type === "person_ride" ? false : r.enabled === true,
        avgSpeedKmph: Number(r.avg_speed_kmph) || 18,
        pickupServiceMin: Number(r.pickup_service_min) || 0,
        dropServiceMin: Number(r.drop_service_min) || 0,
        maxPickupDetourKm: Number(r.max_pickup_detour_km) || 0,
        maxPickupDetourMin: Number(r.max_pickup_detour_min) || 0,
        maxExtraDropDelayMin: Number(r.max_extra_drop_delay_min) || 0,
        sameStoreBonus: Number(r.same_store_bonus) || 0,
        batchWindowSec: Number(r.batch_window_sec) || 20,
      });
    }
  } catch {
    // Table missing / read error → all code defaults (disabled).
  }
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateBatchConfigCache(): void {
  cache = null;
}
