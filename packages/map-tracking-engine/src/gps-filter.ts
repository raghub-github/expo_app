/**
 * Client-side GPS sanitization for live rider markers.
 * Shared by customer / rider / merchant apps.
 */

import { haversineMeters } from "./geo";

export type RiderGpsSample = {
  latitude: number;
  longitude: number;
  headingDegrees?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  updatedAt: string;
};

export type RiderGpsFilterConfig = {
  maxAccuracyM: number;
  maxImpliedSpeedMps: number;
  maxTeleportM: number;
  headingMaxAccuracyM: number;
  headingMinSpeedMps: number;
};

export const DEFAULT_RIDER_GPS_FILTER: RiderGpsFilterConfig = {
  maxAccuracyM: 80,
  maxImpliedSpeedMps: 55,
  maxTeleportM: 350,
  headingMaxAccuracyM: 45,
  headingMinSpeedMps: 1.2,
};

export type GpsFilterDecision =
  | { accept: true; sample: RiderGpsSample; headingTrusted: boolean }
  | { accept: false; reason: string };

type LastAccepted = {
  latitude: number;
  longitude: number;
  updatedAtMs: number;
};

const lastByOrder = new Map<string, LastAccepted>();

function updatedAtMs(iso: string | undefined): number {
  if (!iso) return Date.now();
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Date.now();
}

export function clearRiderGpsFilterState(orderIds?: string[]): void {
  if (!orderIds || orderIds.length === 0) {
    lastByOrder.clear();
    return;
  }
  for (const id of orderIds) {
    lastByOrder.delete(String(id).trim().toUpperCase());
  }
}

export function filterRiderGpsSample(
  orderKeys: string[],
  sample: RiderGpsSample,
  config: RiderGpsFilterConfig = DEFAULT_RIDER_GPS_FILTER
): GpsFilterDecision {
  const keys = orderKeys
    .map((k) => String(k ?? "").trim().toUpperCase())
    .filter(Boolean);
  if (keys.length === 0) {
    return { accept: false, reason: "no_order_key" };
  }

  const lat = Number(sample.latitude);
  const lng = Number(sample.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { accept: false, reason: "invalid_coords" };
  }

  const accuracy =
    sample.accuracyMeters != null && Number.isFinite(Number(sample.accuracyMeters))
      ? Number(sample.accuracyMeters)
      : null;

  if (accuracy != null && accuracy > config.maxAccuracyM) {
    return { accept: false, reason: `low_accuracy_${Math.round(accuracy)}m` };
  }

  const nextMs = updatedAtMs(sample.updatedAt);
  let prev: LastAccepted | null = null;
  for (const key of keys) {
    const row = lastByOrder.get(key);
    if (!row) continue;
    if (!prev || row.updatedAtMs >= prev.updatedAtMs) prev = row;
  }

  if (prev && nextMs >= prev.updatedAtMs) {
    const dtSec = Math.max(0.05, (nextMs - prev.updatedAtMs) / 1000);
    const distM = haversineMeters(prev.latitude, prev.longitude, lat, lng);
    if (distM > config.maxTeleportM && dtSec < 3) {
      return { accept: false, reason: `teleport_${Math.round(distM)}m` };
    }
    const speed = distM / dtSec;
    if (distM > 40 && speed > config.maxImpliedSpeedMps) {
      return { accept: false, reason: `impossible_speed_${speed.toFixed(1)}mps` };
    }
  }

  const reportedSpeed =
    sample.speedMps != null && Number.isFinite(Number(sample.speedMps))
      ? Number(sample.speedMps)
      : null;

  const headingTrusted =
    sample.headingDegrees != null &&
    Number.isFinite(Number(sample.headingDegrees)) &&
    (accuracy == null || accuracy <= config.headingMaxAccuracyM) &&
    (reportedSpeed == null || reportedSpeed >= config.headingMinSpeedMps || !prev);

  const accepted: RiderGpsSample = {
    ...sample,
    latitude: lat,
    longitude: lng,
    headingDegrees: headingTrusted ? sample.headingDegrees ?? null : null,
    accuracyMeters: accuracy,
  };

  for (const key of keys) {
    lastByOrder.set(key, { latitude: lat, longitude: lng, updatedAtMs: nextMs });
  }

  return { accept: true, sample: accepted, headingTrusted };
}
