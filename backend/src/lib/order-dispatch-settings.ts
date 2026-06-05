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

/** Returns false when no further waves are configured beyond currentWave. */
export async function hasNextDispatchWave(
  serviceType: DispatchServiceType,
  currentWave: number
): Promise<boolean> {
  const settings = await fetchDispatchWaveSettings(serviceType);
  if (!settings.enabled) return false;
  const nextWave = currentWave + 1;
  if (nextWave > settings.maxWaves) return false;

  try {
    await fetchEffectiveDispatchRadiusMeters(serviceType, nextWave);
    const currentRadius = await fetchEffectiveDispatchRadiusMeters(serviceType, currentWave);
    const nextRadius = await fetchEffectiveDispatchRadiusMeters(serviceType, nextWave);
    return nextRadius > currentRadius;
  } catch {
    return false;
  }
}
