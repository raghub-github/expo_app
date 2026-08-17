/**
 * Client-side GPS sanitization — same rules as @gatimitra/map-tracking-engine
 * (kept local so dashboard does not need a new workspace transpile dep).
 */

export type RiderGpsSample = {
  latitude: number;
  longitude: number;
  headingDegrees?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  updatedAt: string;
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

const MAX_ACCURACY_M = 80;
const MAX_TELEPORT_M = 350;
const MAX_IMPLIED_SPEED_MPS = 55;
const HEADING_MAX_ACCURACY_M = 45;
const HEADING_MIN_SPEED_MPS = 1.2;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

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
  sample: RiderGpsSample
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

  if (accuracy != null && accuracy > MAX_ACCURACY_M) {
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
    if (distM > MAX_TELEPORT_M && dtSec < 3) {
      return { accept: false, reason: `teleport_${Math.round(distM)}m` };
    }
    const speed = distM / dtSec;
    if (speed > MAX_IMPLIED_SPEED_MPS && distM > 40) {
      return { accept: false, reason: `speed_${Math.round(speed)}mps` };
    }
  }

  const speedMps =
    sample.speedMps != null && Number.isFinite(Number(sample.speedMps))
      ? Number(sample.speedMps)
      : null;
  const headingTrusted =
    sample.headingDegrees != null &&
    Number.isFinite(Number(sample.headingDegrees)) &&
    (accuracy == null || accuracy <= HEADING_MAX_ACCURACY_M) &&
    (speedMps == null || speedMps >= HEADING_MIN_SPEED_MPS);

  const accepted: RiderGpsSample = {
    latitude: lat,
    longitude: lng,
    headingDegrees: headingTrusted ? Number(sample.headingDegrees) : sample.headingDegrees ?? null,
    accuracyMeters: accuracy,
    speedMps,
    updatedAt: sample.updatedAt || new Date(nextMs).toISOString(),
  };

  for (const key of keys) {
    lastByOrder.set(key, {
      latitude: lat,
      longitude: lng,
      updatedAtMs: nextMs,
    });
  }

  return { accept: true, sample: accepted, headingTrusted };
}
