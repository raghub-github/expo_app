import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { resolveZoneWeather } from "./weather.service.js";
import {
  dispatchPriorityBoostForSeverity,
  surgeEligibleForSeverity,
  weatherDispatchWeightForSeverity,
  weatherPriorityBoostForSeverity,
} from "./weather.dispatch.js";
import { buildZoneKey } from "./weather.classify.js";
import { resolveServiceZone } from "./weather.zone-resolver.js";

/**
 * Immutable weather snapshot at order placement — never updated after insert.
 * Failures are non-blocking (savepoint) so ordering never depends on weather.
 */
export async function captureOrderWeatherSnapshot(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  args: {
    orderCorePk: number;
    orderIdText: string;
    dropLat: number;
    dropLon: number;
    cityHint?: string | null;
  }
): Promise<void> {
  if (!Number.isFinite(args.orderCorePk) || args.orderCorePk <= 0) return;
  if (!Number.isFinite(args.dropLat) || !Number.isFinite(args.dropLon)) return;

  const savepoint = "order_weather_snapshot";
  try {
    await tx.execute(sql.raw(`SAVEPOINT ${savepoint}`));

    const weather = await resolveZoneWeather({
      lat: args.dropLat,
      lng: args.dropLon,
      cityHint: args.cityHint,
    });
    const serviceZone = await resolveServiceZone({
      lat: args.dropLat,
      lng: args.dropLon,
      cityHint: args.cityHint ?? weather.city,
    });
    const { zoneKey } = buildZoneKey(
      args.dropLat,
      args.dropLon,
      weather.city ?? serviceZone.city,
      serviceZone.zoneName
    );
    const severity = weather.severity;
    const now = new Date();

    await tx.execute(sql`
      INSERT INTO order_weather_snapshots (
        order_core_id,
        order_id,
        weather_condition,
        weather_severity,
        rain_detected,
        rain_intensity_mm,
        temperature_c,
        weather_delay_minutes,
        zone_name,
        zone_key,
        city,
        dispatch_priority_boost,
        surge_eligible,
        weather_priority_boost,
        weather_dispatch_weight,
        snapshot_timestamp,
        created_at
      ) VALUES (
        ${args.orderCorePk},
        ${args.orderIdText},
        ${weather.weatherCondition},
        ${severity},
        ${weather.rainDetected},
        ${String(weather.rainIntensityMm)},
        ${weather.temperatureC != null ? String(weather.temperatureC) : null},
        ${weather.etaDelayMinutes},
        ${weather.zone ?? serviceZone.zoneName},
        ${zoneKey},
        ${weather.city ?? serviceZone.city},
        ${dispatchPriorityBoostForSeverity(severity)},
        ${surgeEligibleForSeverity(severity)},
        ${weatherPriorityBoostForSeverity(severity)},
        ${weatherDispatchWeightForSeverity(severity)},
        ${now},
        ${now}
      )
      ON CONFLICT (order_core_id) DO NOTHING
    `);

    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`));
  } catch (e) {
    try {
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`));
    } catch {
      // parent txn may already be aborted
    }
    console.warn("[weather] order snapshot skipped:", (e as Error).message);
  }
}
