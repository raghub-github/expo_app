/**
 * Tracking configuration — single global row (tracking_config, id=1) of Super
 * Admin tunables for the real-time tracking + geo-scoping engine (Phase 1,
 * migration 0471). Runtime code reads config via getTrackingConfig() so the geo
 * engine, geofence enforcement, ETA cadence, and mobile interval all respond to
 * admin changes without a redeploy. Distances in METERS, durations in SECONDS.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { trackingConfig } from "../db/schema.js";

export interface TrackingConfig {
  trackingIntervalSeconds: number;
  gpsAccuracyThresholdM: number;
  speedThresholdKmh: number;
  etaRefreshSeconds: number;
  movementThresholdM: number;
  stationaryTimeoutSeconds: number;
  deviationDistanceM: number;
  wrongDirectionThresholdM: number;
  enableStationaryRule: boolean;
  enableDeviationRule: boolean;
  enableWrongDirectionRule: boolean;
  // Geo-engine auto-action policy (migration 0642).
  autoActionEnabled: boolean;
  applyWalletPenalties: boolean;
  penalizeMinLevel: number;
  dismissBelowMinLevel: boolean;
  penaltyLongStop: number;
  penaltyWrongDirection: number;
  penaltyRouteDeviation: number;
  perOrderPenaltyCap: number;
}

/** Spec defaults — also the DB column defaults; used when the row is missing. */
export const DEFAULT_TRACKING_CONFIG: TrackingConfig = {
  trackingIntervalSeconds: 60,
  gpsAccuracyThresholdM: 50,
  speedThresholdKmh: 120,
  etaRefreshSeconds: 60,
  movementThresholdM: 30,
  stationaryTimeoutSeconds: 600,
  deviationDistanceM: 300,
  wrongDirectionThresholdM: 200,
  enableStationaryRule: true,
  enableDeviationRule: true,
  enableWrongDirectionRule: true,
  autoActionEnabled: true,
  applyWalletPenalties: false,
  penalizeMinLevel: 2,
  dismissBelowMinLevel: true,
  penaltyLongStop: 0,
  penaltyWrongDirection: 0,
  penaltyRouteDeviation: 0,
  perOrderPenaltyCap: 100,
};

/** Allowed collection intervals surfaced to the Super Admin UI (extensible). */
export const TRACKING_INTERVAL_OPTIONS = [30, 60, 90, 120] as const;

// Short in-process cache so per-fix ingestion doesn't hit the DB every ping.
let cache: { value: TrackingConfig; at: number } | null = null;
const CACHE_TTL_MS = 15_000;

function n(v: unknown, fallback: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/** Read the live tracking config (cached ~15s). Falls back to defaults. */
export async function getTrackingConfig(force = false): Promise<TrackingConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const db = getDb();
    const [row] = await db.select().from(trackingConfig).where(eq(trackingConfig.id, 1)).limit(1);
    const value: TrackingConfig = row
      ? {
          trackingIntervalSeconds: n(row.trackingIntervalSeconds, DEFAULT_TRACKING_CONFIG.trackingIntervalSeconds),
          gpsAccuracyThresholdM: n(row.gpsAccuracyThresholdM, DEFAULT_TRACKING_CONFIG.gpsAccuracyThresholdM),
          speedThresholdKmh: n(row.speedThresholdKmh, DEFAULT_TRACKING_CONFIG.speedThresholdKmh),
          etaRefreshSeconds: n(row.etaRefreshSeconds, DEFAULT_TRACKING_CONFIG.etaRefreshSeconds),
          movementThresholdM: n(row.movementThresholdM, DEFAULT_TRACKING_CONFIG.movementThresholdM),
          stationaryTimeoutSeconds: n(row.stationaryTimeoutSeconds, DEFAULT_TRACKING_CONFIG.stationaryTimeoutSeconds),
          deviationDistanceM: n(row.deviationDistanceM, DEFAULT_TRACKING_CONFIG.deviationDistanceM),
          wrongDirectionThresholdM: n(row.wrongDirectionThresholdM, DEFAULT_TRACKING_CONFIG.wrongDirectionThresholdM),
          enableStationaryRule: row.enableStationaryRule ?? DEFAULT_TRACKING_CONFIG.enableStationaryRule,
          enableDeviationRule: row.enableDeviationRule ?? DEFAULT_TRACKING_CONFIG.enableDeviationRule,
          enableWrongDirectionRule: row.enableWrongDirectionRule ?? DEFAULT_TRACKING_CONFIG.enableWrongDirectionRule,
          autoActionEnabled: row.autoActionEnabled ?? DEFAULT_TRACKING_CONFIG.autoActionEnabled,
          applyWalletPenalties: row.applyWalletPenalties ?? DEFAULT_TRACKING_CONFIG.applyWalletPenalties,
          penalizeMinLevel: n(row.penalizeMinLevel, DEFAULT_TRACKING_CONFIG.penalizeMinLevel),
          dismissBelowMinLevel: row.dismissBelowMinLevel ?? DEFAULT_TRACKING_CONFIG.dismissBelowMinLevel,
          penaltyLongStop: n(row.penaltyLongStop, DEFAULT_TRACKING_CONFIG.penaltyLongStop),
          penaltyWrongDirection: n(row.penaltyWrongDirection, DEFAULT_TRACKING_CONFIG.penaltyWrongDirection),
          penaltyRouteDeviation: n(row.penaltyRouteDeviation, DEFAULT_TRACKING_CONFIG.penaltyRouteDeviation),
          perOrderPenaltyCap: n(row.perOrderPenaltyCap, DEFAULT_TRACKING_CONFIG.perOrderPenaltyCap),
        }
      : DEFAULT_TRACKING_CONFIG;
    cache = { value, at: Date.now() };
    return value;
  } catch {
    // Never let a config read break the ingestion/enforcement path.
    return cache?.value ?? DEFAULT_TRACKING_CONFIG;
  }
}

const INT_FIELDS = [
  "trackingIntervalSeconds",
  "gpsAccuracyThresholdM",
  "speedThresholdKmh",
  "etaRefreshSeconds",
  "movementThresholdM",
  "stationaryTimeoutSeconds",
  "deviationDistanceM",
  "wrongDirectionThresholdM",
  "penalizeMinLevel",
] as const;
/** Allowed to be 0 (e.g. ₹0 = mark-only; cap 0 = no cap). */
const NONNEG_INT_FIELDS = [
  "penaltyLongStop",
  "penaltyWrongDirection",
  "penaltyRouteDeviation",
  "perOrderPenaltyCap",
] as const;
const BOOL_FIELDS = [
  "enableStationaryRule",
  "enableDeviationRule",
  "enableWrongDirectionRule",
  "autoActionEnabled",
  "applyWalletPenalties",
  "dismissBelowMinLevel",
] as const;

/**
 * Super Admin update (partial). Validates numeric ranges (all positive, sane
 * upper bounds) and upserts the singleton row. Returns the fresh config.
 */
export async function updateTrackingConfig(
  patch: Partial<TrackingConfig>,
  updatedBy?: string | null
): Promise<TrackingConfig> {
  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: updatedBy ?? null };
  for (const f of INT_FIELDS) {
    if (patch[f] === undefined) continue;
    const v = Math.round(Number(patch[f]));
    if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) {
      throw new Error(`Invalid value for ${f}`);
    }
    set[f] = v;
  }
  for (const f of NONNEG_INT_FIELDS) {
    if (patch[f] === undefined) continue;
    const v = Math.round(Number(patch[f]));
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      throw new Error(`Invalid value for ${f}`);
    }
    set[f] = v;
  }
  for (const f of BOOL_FIELDS) {
    if (patch[f] === undefined) continue;
    set[f] = Boolean(patch[f]);
  }

  const db = getDb();
  await db
    .insert(trackingConfig)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: trackingConfig.id, set });
  cache = null; // invalidate
  return getTrackingConfig(true);
}
