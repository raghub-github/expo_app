/**
 * ETA Engine — computes the customer-facing delivery promise.
 *
 * Architecture:
 *   - Pure(ish) function: takes a routing quote + store config + context flags,
 *     returns a complete EtaSnapshot. Side-effects (DB writes) live in the
 *     persistence layer below.
 *   - Every minute of the final range traces back to a named input so disputes
 *     can be resolved against the snapshot stored on orders_core.
 *
 * Final ETA = prep + assignment + rider→store + store→customer + traffic delay
 *           + weather delay + congestion delay + safety buffer
 *
 * UX rule: never under-promise. We pad the optimistic raw ETA by a buffer that
 * grows with confidence-reducing factors (long distance, peak hours, weather,
 * congestion). The customer sees a RANGE `[min, max]` where max is the promise
 * deadline.
 */

import { getSql } from "../../db/client.js";

export type EtaInputs = {
  /** Store→customer travel duration in minutes (Mapbox / OSRM / haversine). */
  routeMinutes: number;
  /** Store→customer road distance in km. */
  routeKm: number;
  /** Merchant's stated preparation time for the order. */
  prepMinutes: number;
  /** When > 0, traffic multiplier already baked into routeMinutes; else 0. */
  trafficDelayMinutes?: number;
  /** Optional weather multiplier delay (rain / extreme heat). */
  weatherDelayMinutes?: number;
  /** Network/area congestion delay (peak hour, festivals). */
  congestionDelayMinutes?: number;
  /** Pickup→assignment lag — how long until a rider accepts. */
  riderAssignmentMinutes?: number;
  /** When the order is placed at peak hours. Auto-detected if undefined. */
  isPeakHour?: boolean;
  /** Override safety-buffer calculation. Otherwise computed below. */
  safetyBufferMinutesOverride?: number;
  /** ISO timestamp for which "now" should be used (default: real now). */
  now?: Date;
};

export type EtaSnapshot = {
  /** Lower bound of the customer-visible range. */
  minMinutes: number;
  /** Upper bound — this is the platform's official promise. */
  maxMinutes: number;
  /** ISO timestamp of the promise deadline (now + maxMinutes). */
  promisedDeliveryAt: string;
  /** Per-source breakdown (each rounded to whole minutes). */
  breakdown: {
    prepMinutes: number;
    riderAssignmentMinutes: number;
    riderToStoreMinutes: number;
    storeToCustomerMinutes: number;
    trafficDelayMinutes: number;
    weatherDelayMinutes: number;
    congestionDelayMinutes: number;
    bufferMinutes: number;
  };
  routeKm: number;
  /**
   * 0..1 — how confident the engine is in this estimate. Drops with distance,
   * peak hours, weather, congestion. UI can show ⚠️ when < 0.7.
   */
  confidenceScore: number;
  /** Raw inputs preserved for audit. */
  metadata: Record<string, unknown>;
  generatedAt: string;
};

const DEFAULT_PREP_FALLBACK = 18;
const DEFAULT_RIDER_ASSIGNMENT = 4;
const DEFAULT_RIDER_TO_STORE_RATIO = 0.45;
const PEAK_HOURS_IST: Array<[number, number]> = [
  [12, 14],
  [19, 22],
];

function clampInt(n: number, min = 0, max = 999): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function detectPeakHour(now: Date): boolean {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const h = ist.getUTCHours();
  return PEAK_HOURS_IST.some(([s, e]) => h >= s && h < e);
}

/**
 * Safety buffer rules — additive, conservative. We pick a buffer that grows
 * with each confidence-reducing factor so the promise stays beatable.
 */
function computeSafetyBuffer(opts: {
  routeKm: number;
  isPeakHour: boolean;
  weatherDelayMinutes: number;
  congestionDelayMinutes: number;
}): number {
  let buf = 5; // base safety margin so we never promise too tight
  if (opts.routeKm > 5) buf += 2;
  if (opts.routeKm > 8) buf += 3;
  if (opts.isPeakHour) buf += 4;
  if (opts.weatherDelayMinutes > 0) buf += 3;
  if (opts.congestionDelayMinutes > 0) buf += 2;
  return buf;
}

/**
 * Confidence is a soft proxy for "how stable is this number". Customers don't
 * see this directly but the tracking UI can warn when it drops.
 */
function computeConfidence(opts: {
  routeKm: number;
  isPeakHour: boolean;
  weatherDelayMinutes: number;
  congestionDelayMinutes: number;
}): number {
  let c = 0.95;
  if (opts.routeKm > 5) c -= 0.05;
  if (opts.routeKm > 8) c -= 0.07;
  if (opts.isPeakHour) c -= 0.08;
  if (opts.weatherDelayMinutes > 0) c -= 0.06;
  if (opts.congestionDelayMinutes > 0) c -= 0.04;
  return Math.max(0, Math.min(1, Number(c.toFixed(2))));
}

export function computeEta(input: EtaInputs): EtaSnapshot {
  const now = input.now ?? new Date();
  const isPeak = input.isPeakHour ?? detectPeakHour(now);

  const prep = clampInt(input.prepMinutes > 0 ? input.prepMinutes : DEFAULT_PREP_FALLBACK);
  const assignment = clampInt(
    input.riderAssignmentMinutes != null ? input.riderAssignmentMinutes : DEFAULT_RIDER_ASSIGNMENT,
  );
  // Rider→store is generally a short hop; approximate as a fraction of the
  // full route until rider-side tracking gives us a better signal.
  const riderToStore = clampInt(input.routeMinutes * DEFAULT_RIDER_TO_STORE_RATIO);
  const storeToCustomer = clampInt(input.routeMinutes);

  const trafficDelay = clampInt(input.trafficDelayMinutes ?? 0);
  const weatherDelay = clampInt(input.weatherDelayMinutes ?? 0);
  const congestionDelay = clampInt(input.congestionDelayMinutes ?? 0);

  const buffer =
    input.safetyBufferMinutesOverride != null
      ? clampInt(input.safetyBufferMinutesOverride)
      : computeSafetyBuffer({
          routeKm: input.routeKm,
          isPeakHour: isPeak,
          weatherDelayMinutes: weatherDelay,
          congestionDelayMinutes: congestionDelay,
        });

  // Optimistic raw ETA — no buffer.
  const rawCore =
    prep +
    assignment +
    riderToStore +
    storeToCustomer +
    trafficDelay +
    weatherDelay +
    congestionDelay;

  // Range: [rawCore + smaller buffer, rawCore + larger buffer]. The min keeps
  // the optimistic side honest; the max is the promise.
  const minMinutes = clampInt(rawCore + Math.max(0, buffer - 5));
  const maxMinutes = clampInt(rawCore + buffer);

  const promisedDeliveryAt = new Date(now.getTime() + maxMinutes * 60 * 1000).toISOString();
  const confidence = computeConfidence({
    routeKm: input.routeKm,
    isPeakHour: isPeak,
    weatherDelayMinutes: weatherDelay,
    congestionDelayMinutes: congestionDelay,
  });

  return {
    minMinutes,
    maxMinutes,
    promisedDeliveryAt,
    breakdown: {
      prepMinutes: prep,
      riderAssignmentMinutes: assignment,
      riderToStoreMinutes: riderToStore,
      storeToCustomerMinutes: storeToCustomer,
      trafficDelayMinutes: trafficDelay,
      weatherDelayMinutes: weatherDelay,
      congestionDelayMinutes: congestionDelay,
      bufferMinutes: buffer,
    },
    routeKm: Number(input.routeKm.toFixed(2)),
    confidenceScore: confidence,
    metadata: {
      isPeakHour: isPeak,
      raw: input,
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * Resolves the prep_time for a store, falling back through:
 *   1. merchant_store_preparation_times (peak-hour override if matching)
 *   2. merchant_stores.avg_preparation_time_minutes
 *   3. compile-time default
 */
export async function resolveStorePrepMinutes(storeId: number): Promise<number> {
  const sql = getSql();
  try {
    const rows = await sql<Array<{ pt: number | null }>>`
      SELECT avg_preparation_time_minutes AS pt
      FROM merchant_stores
      WHERE id = ${storeId}
      LIMIT 1
    `;
    const n = rows[0]?.pt;
    if (n != null && Number.isFinite(Number(n)) && Number(n) > 0) return Math.round(Number(n));
  } catch (e) {
    console.warn("[eta] resolveStorePrepMinutes lookup failed", { storeId, err: (e as Error).message });
  }
  return DEFAULT_PREP_FALLBACK;
}
