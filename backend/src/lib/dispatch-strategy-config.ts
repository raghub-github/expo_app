/**
 * Dispatch Engine - Phase 0 config loaders (service radius + strategy/rate/retry).
 *
 * Always reads fresh from DB (no cache), mirroring order-dispatch-settings.ts. These
 * back the Phase 0 config tables:
 *   - platform_rider_service_radius            (order-placement serviceability gate)
 *   - platform_rider_dispatch_strategy_config  (ordering strategy, retry loop, pre-pickup pay)
 *
 * Defaults are behavior-preserving: strategy 'nearest' + pre-pickup rate 0 -> the engine
 * behaves exactly as before until an admin changes a value.
 */

import { getSql } from "../db/client.js";
import {
  DISPATCH_SERVICE_TYPES,
  DispatchConfigurationError,
  type DispatchServiceType,
} from "./order-assignment-engine.js";

export type DispatchStrategy = "nearest" | "score" | "balanced" | "hybrid";
export type PrePickupFunding = "company" | "customer" | "shared";

export type DispatchScoreWeights = {
  distance: number;
  acceptanceRate: number;
  cancellationRate: number;
  idleBonus: number;
  workloadPenalty: number;
  directionAlignment: number;
};

export type DispatchStrategyConfig = {
  serviceType: DispatchServiceType;
  strategy: DispatchStrategy;
  scoreWeights: DispatchScoreWeights;
  retryIntervalSeconds: number;
  maxRetryDurationSeconds: number;
  prePickupRatePerKm: number;
  prePickupFunding: PrePickupFunding;
  /** When true, auto-cancel + refund an order unfilled after maxRetryDurationSeconds. */
  autoCancelOnExhaustion: boolean;
  enabled: boolean;
};

/** Behavior-preserving defaults used when a service row is absent. */
export const DEFAULT_DISPATCH_SCORE_WEIGHTS: DispatchScoreWeights = {
  distance: 1.0,
  acceptanceRate: 0.5,
  cancellationRate: -0.5,
  idleBonus: 0.2,
  workloadPenalty: -0.3,
  directionAlignment: 0.3,
};

const DEFAULT_STRATEGY_CONFIG: Omit<DispatchStrategyConfig, "serviceType"> = {
  strategy: "nearest",
  scoreWeights: DEFAULT_DISPATCH_SCORE_WEIGHTS,
  retryIntervalSeconds: 300,
  maxRetryDurationSeconds: 1200,
  prePickupRatePerKm: 0,
  prePickupFunding: "company",
  autoCancelOnExhaustion: false,
  enabled: true,
};

const VALID_STRATEGIES = new Set<DispatchStrategy>([
  "nearest",
  "score",
  "balanced",
  "hybrid",
]);
const VALID_FUNDING = new Set<PrePickupFunding>(["company", "customer", "shared"]);

function normalizeStrategy(raw: unknown): DispatchStrategy {
  const s = String(raw ?? "").trim().toLowerCase();
  return VALID_STRATEGIES.has(s as DispatchStrategy)
    ? (s as DispatchStrategy)
    : "nearest";
}

function normalizeFunding(raw: unknown): PrePickupFunding {
  const s = String(raw ?? "").trim().toLowerCase();
  return VALID_FUNDING.has(s as PrePickupFunding)
    ? (s as PrePickupFunding)
    : "company";
}

function normalizeScoreWeights(raw: unknown): DispatchScoreWeights {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const num = (key: keyof DispatchScoreWeights): number => {
    const v = Number(obj[key]);
    return Number.isFinite(v) ? v : DEFAULT_DISPATCH_SCORE_WEIGHTS[key];
  };
  return {
    distance: num("distance"),
    acceptanceRate: num("acceptanceRate"),
    cancellationRate: num("cancellationRate"),
    idleBonus: num("idleBonus"),
    workloadPenalty: num("workloadPenalty"),
    directionAlignment: num("directionAlignment"),
  };
}

/**
 * Serviceability radius (meters) for order placement - pickup->rider max distance a
 * customer may place a delivery order within. Fresh DB read. Throws if unconfigured.
 */
export async function fetchServiceRadiusMeters(
  serviceType: DispatchServiceType
): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT radius_meters
    FROM platform_rider_service_radius
    WHERE service_type = ${serviceType}
    LIMIT 1
  `) as Array<{ radius_meters: number }>;

  const meters = Number(rows[0]?.radius_meters);
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new DispatchConfigurationError(
      `Service radius for "${serviceType}" is not configured in platform_rider_service_radius`
    );
  }
  return Math.round(meters);
}

/** All service radii (meters), keyed by service. Fresh DB read; throws if any missing. */
export async function fetchAllServiceRadiiMeters(): Promise<
  Record<DispatchServiceType, number>
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT service_type, radius_meters
    FROM platform_rider_service_radius
    ORDER BY service_type ASC
  `) as Array<{ service_type: string; radius_meters: number }>;

  const map = {} as Record<DispatchServiceType, number>;
  for (const row of rows ?? []) {
    const key = String(row.service_type ?? "").trim() as DispatchServiceType;
    const meters = Number(row.radius_meters);
    if (
      DISPATCH_SERVICE_TYPES.includes(key) &&
      Number.isFinite(meters) &&
      meters > 0
    ) {
      map[key] = Math.round(meters);
    }
  }

  for (const service of DISPATCH_SERVICE_TYPES) {
    if (map[service] == null) {
      throw new DispatchConfigurationError(
        `Service radius for "${service}" is not configured in platform_rider_service_radius`
      );
    }
  }
  return map;
}

/**
 * Strategy / retry / pre-pickup config for a service. Fresh DB read. Falls back to
 * behavior-preserving defaults (nearest, no first-mile pay) when the row is absent, so
 * the engine never breaks on a missing config.
 */
export async function fetchDispatchStrategyConfig(
  serviceType: DispatchServiceType
): Promise<DispatchStrategyConfig> {
  const sql = getSql();
  let rows: Array<{
    service_type: string;
    strategy: string;
    score_weights: unknown;
    retry_interval_seconds: number;
    max_retry_duration_seconds: number;
    pre_pickup_rate_per_km: string | number;
    pre_pickup_funding: string;
    auto_cancel_on_exhaustion?: boolean;
    enabled: boolean;
  }> = [];

  try {
    rows = (await sql`
      SELECT
        service_type,
        strategy,
        score_weights,
        retry_interval_seconds,
        max_retry_duration_seconds,
        pre_pickup_rate_per_km,
        pre_pickup_funding,
        auto_cancel_on_exhaustion,
        enabled
      FROM platform_rider_dispatch_strategy_config
      WHERE service_type = ${serviceType}
      LIMIT 1
    `) as typeof rows;
  } catch {
    // Column or table may be absent until migration 0500 / strategy table migrate.
    try {
      rows = (await sql`
        SELECT
          service_type,
          strategy,
          score_weights,
          retry_interval_seconds,
          max_retry_duration_seconds,
          pre_pickup_rate_per_km,
          pre_pickup_funding,
          enabled
        FROM platform_rider_dispatch_strategy_config
        WHERE service_type = ${serviceType}
        LIMIT 1
      `) as typeof rows;
    } catch {
      return { serviceType, ...DEFAULT_STRATEGY_CONFIG };
    }
  }

  const row = rows[0];
  if (!row) {
    return { serviceType, ...DEFAULT_STRATEGY_CONFIG };
  }

  const retryInterval = Number(row.retry_interval_seconds);
  const maxRetryDuration = Number(row.max_retry_duration_seconds);
  const prePickupRate = Number(row.pre_pickup_rate_per_km);

  return {
    serviceType,
    strategy: normalizeStrategy(row.strategy),
    scoreWeights: normalizeScoreWeights(row.score_weights),
    retryIntervalSeconds:
      Number.isFinite(retryInterval) && retryInterval > 0
        ? Math.round(retryInterval)
        : DEFAULT_STRATEGY_CONFIG.retryIntervalSeconds,
    maxRetryDurationSeconds:
      Number.isFinite(maxRetryDuration) && maxRetryDuration >= 0
        ? Math.round(maxRetryDuration)
        : DEFAULT_STRATEGY_CONFIG.maxRetryDurationSeconds,
    prePickupRatePerKm:
      Number.isFinite(prePickupRate) && prePickupRate >= 0 ? prePickupRate : 0,
    prePickupFunding: normalizeFunding(row.pre_pickup_funding),
    autoCancelOnExhaustion: row.auto_cancel_on_exhaustion === true,
    enabled: row.enabled !== false,
  };
}
