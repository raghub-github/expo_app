/**
 * Admin + runtime loaders for dispatch wave expansion (pickup radius only).
 * Always reads fresh from DB — no cache, no hardcoded fallbacks.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import { fetchPickupRadiusMeters } from "./order-assignment-engine.js";

export type DispatchWaveSettings = {
  serviceType: DispatchServiceType;
  waveIntervalSeconds: number;
  maxWaves: number;
  maxDispatchRadiusMeters: number;
  enabled: boolean;
};

export class DispatchWaveConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchWaveConfigurationError";
  }
}

/** Fresh DB read — wave timing and caps per service. */
export async function fetchDispatchWaveSettings(
  serviceType: DispatchServiceType
): Promise<DispatchWaveSettings> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      service_type,
      wave_interval_seconds,
      max_waves,
      max_dispatch_radius_meters,
      enabled
    FROM platform_rider_dispatch_wave_settings
    WHERE service_type = ${serviceType}
    LIMIT 1
  `) as Array<{
    service_type: string;
    wave_interval_seconds: number;
    max_waves: number;
    max_dispatch_radius_meters: number;
    enabled: boolean;
  }>;

  const row = rows[0];
  const interval = Number(row?.wave_interval_seconds);
  const maxWaves = Number(row?.max_waves);
  const maxRadius = Number(row?.max_dispatch_radius_meters);

  if (
    !row ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    !Number.isFinite(maxWaves) ||
    maxWaves < 1 ||
    !Number.isFinite(maxRadius) ||
    maxRadius <= 0
  ) {
    throw new DispatchWaveConfigurationError(
      `Dispatch wave settings for "${serviceType}" are not configured in platform_rider_dispatch_wave_settings`
    );
  }

  return {
    serviceType,
    waveIntervalSeconds: Math.round(interval),
    maxWaves: Math.round(maxWaves),
    maxDispatchRadiusMeters: Math.round(maxRadius),
    enabled: row.enabled !== false,
  };
}

async function fetchWaveExpansionRadiusMeters(
  serviceType: DispatchServiceType,
  waveNumber: number
): Promise<number | null> {
  if (waveNumber < 2) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT effective_radius_meters
    FROM platform_rider_dispatch_wave_expansion
    WHERE service_type = ${serviceType}
      AND wave_number = ${waveNumber}
    LIMIT 1
  `) as Array<{ effective_radius_meters: number }>;

  const meters = Number(rows[0]?.effective_radius_meters);
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return Math.round(meters);
}

/**
 * Effective pickup search radius for a dispatch wave (meters, pickup point only).
 * Wave 1 → platform_rider_dispatch_pickup_radius.
 * Wave 2+ → expansion row, capped by max_dispatch_radius_meters.
 */
export async function fetchEffectiveDispatchRadiusMeters(
  serviceType: DispatchServiceType,
  waveNumber: number
): Promise<number> {
  const waveSettings = await fetchDispatchWaveSettings(serviceType);
  const wave = Math.max(1, Math.round(waveNumber));

  if (wave === 1) {
    const base = await fetchPickupRadiusMeters(serviceType);
    return Math.min(base, waveSettings.maxDispatchRadiusMeters);
  }

  const expanded = await fetchWaveExpansionRadiusMeters(serviceType, wave);
  if (expanded == null) {
    throw new DispatchWaveConfigurationError(
      `Dispatch wave ${wave} expansion for "${serviceType}" is not configured in platform_rider_dispatch_wave_expansion`
    );
  }

  return Math.min(expanded, waveSettings.maxDispatchRadiusMeters);
}

/**
 * Pure gate used by {@link hasNextDispatchWave} (and unit tests).
 * Next wave is available when enabled, within maxWaves, and expansion radius is configured.
 * Does NOT require nextRadius > currentRadius — equal/capped radii must still escalate
 * (otherwise Wave 2/3 never run when Wave-1 pickup ≥ Wave-2 expansion after max cap).
 */
export function canAdvanceDispatchWave(args: {
  enabled: boolean;
  maxWaves: number;
  currentWave: number;
  /** null when expansion row missing / misconfigured */
  nextRadiusMeters: number | null;
}): boolean {
  if (!args.enabled) return false;
  const nextWave = args.currentWave + 1;
  if (nextWave > args.maxWaves) return false;
  return args.nextRadiusMeters != null && Number.isFinite(args.nextRadiusMeters) && args.nextRadiusMeters > 0;
}

/** Returns false when no further waves are configured beyond currentWave. */
export async function hasNextDispatchWave(
  serviceType: DispatchServiceType,
  currentWave: number
): Promise<boolean> {
  const settings = await fetchDispatchWaveSettings(serviceType);
  const nextWave = currentWave + 1;
  let nextRadiusMeters: number | null = null;
  try {
    nextRadiusMeters = await fetchEffectiveDispatchRadiusMeters(serviceType, nextWave);
  } catch {
    nextRadiusMeters = null;
  }

  const ok = canAdvanceDispatchWave({
    enabled: settings.enabled,
    maxWaves: settings.maxWaves,
    currentWave,
    nextRadiusMeters,
  });

  if (ok) {
    try {
      const currentRadius = await fetchEffectiveDispatchRadiusMeters(serviceType, currentWave);
      if (!(nextRadiusMeters! > currentRadius)) {
        console.warn(
          "[dispatch] next_wave_radius_not_larger_still_advancing",
          JSON.stringify({
            serviceType,
            currentWave,
            nextWave,
            currentRadiusMeters: currentRadius,
            nextRadiusMeters,
          })
        );
      }
    } catch {
      /* ignore — advance still allowed when next radius resolves */
    }
  }

  return ok;
}
