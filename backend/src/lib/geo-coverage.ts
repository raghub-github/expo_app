/**
 * Dispatch Engine — Phase 1: Geo & Pincode Coverage resolver.
 *
 * Given a service + location descriptor (pincode/city/state/country), resolves the
 * effective fulfillment config, matched most-specific-first (pincode > city > state >
 * country). NULL radius/strategy columns fall back to the Phase 0 global config.
 *
 * Behavior-preserving: with no coverage rows, resolution returns "enabled everywhere,
 * self-pickup + delivery + internal rider on, 3PL off, global defaults" — i.e. exactly
 * how the platform behaves today (no placement gating until an admin adds rows).
 *
 * Fresh DB read (no cache), consistent with the rest of the dispatch config layer.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import {
  fetchServiceRadiusMeters,
  fetchDispatchStrategyConfig,
  type DispatchStrategy,
} from "./dispatch-strategy-config.js";

export type CoverageMatchType = "pincode" | "city" | "state" | "country";

export type CoverageLocation = {
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export type EffectiveCoverage = {
  serviceType: DispatchServiceType;
  /** True when an explicit coverage row matched; false when falling back to defaults. */
  matched: boolean;
  matchType: CoverageMatchType | "default";
  enabled: boolean;
  selfPickupEnabled: boolean;
  deliveryEnabled: boolean;
  internalRiderEnabled: boolean;
  tplEnabled: boolean;
  serviceRadiusMeters: number;
  /** Per-location dispatch radius cap override (meters), or null → use wave settings. */
  dispatchRadiusOverrideMeters: number | null;
  maxRetryDurationSeconds: number;
  strategy: DispatchStrategy;
};

type GeoCoverageRow = {
  match_type: CoverageMatchType;
  enabled: boolean;
  self_pickup_enabled: boolean;
  delivery_enabled: boolean;
  internal_rider_enabled: boolean;
  tpl_enabled: boolean;
  service_radius_meters: number | null;
  dispatch_radius_meters: number | null;
  max_retry_duration_seconds: number | null;
  strategy: string | null;
};

const MATCH_PRECEDENCE: Record<CoverageMatchType, number> = {
  pincode: 4,
  city: 3,
  state: 2,
  country: 1,
};

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

function nullableInt(v: number | null | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Resolve the effective coverage config for a service at a location. */
export async function resolveGeoCoverage(
  serviceType: DispatchServiceType,
  location: CoverageLocation
): Promise<EffectiveCoverage> {
  const sql = getSql();
  const pincode = String(location.pincode ?? "").trim();
  const city = norm(location.city);
  const state = norm(location.state);
  const country = norm(location.country);

  const rows = (await sql`
    SELECT
      match_type, enabled, self_pickup_enabled, delivery_enabled,
      internal_rider_enabled, tpl_enabled, service_radius_meters,
      dispatch_radius_meters, max_retry_duration_seconds, strategy
    FROM geo_coverage
    WHERE service_type = ${serviceType}
      AND (
        (match_type = 'pincode' AND ${pincode} <> '' AND match_value = ${pincode})
        OR (match_type = 'city'    AND ${city}    <> '' AND match_value = ${city})
        OR (match_type = 'state'   AND ${state}   <> '' AND match_value = ${state})
        OR (match_type = 'country' AND ${country} <> '' AND match_value = ${country})
      )
  `) as GeoCoverageRow[];

  // Global fallbacks (Phase 0). fetchServiceRadiusMeters throws if unconfigured —
  // that is intentional and surfaces to the serviceability caller.
  const [globalServiceRadius, strategyConfig] = await Promise.all([
    fetchServiceRadiusMeters(serviceType),
    fetchDispatchStrategyConfig(serviceType),
  ]);

  const defaults: EffectiveCoverage = {
    serviceType,
    matched: false,
    matchType: "default",
    enabled: true,
    selfPickupEnabled: true,
    deliveryEnabled: true,
    internalRiderEnabled: true,
    tplEnabled: false,
    serviceRadiusMeters: globalServiceRadius,
    dispatchRadiusOverrideMeters: null,
    maxRetryDurationSeconds: strategyConfig.maxRetryDurationSeconds,
    strategy: strategyConfig.strategy,
  };

  if (!rows || rows.length === 0) return defaults;

  let best = rows[0];
  for (const r of rows) {
    if (MATCH_PRECEDENCE[r.match_type] > MATCH_PRECEDENCE[best.match_type]) {
      best = r;
    }
  }

  const VALID_STRATEGIES = new Set<DispatchStrategy>([
    "nearest",
    "score",
    "balanced",
    "hybrid",
  ]);
  const rowStrategy =
    best.strategy && VALID_STRATEGIES.has(best.strategy as DispatchStrategy)
      ? (best.strategy as DispatchStrategy)
      : null;

  return {
    serviceType,
    matched: true,
    matchType: best.match_type,
    enabled: best.enabled !== false,
    selfPickupEnabled: best.self_pickup_enabled !== false,
    deliveryEnabled: best.delivery_enabled !== false,
    internalRiderEnabled: best.internal_rider_enabled !== false,
    tplEnabled: best.tpl_enabled === true,
    serviceRadiusMeters: nullableInt(best.service_radius_meters) ?? globalServiceRadius,
    dispatchRadiusOverrideMeters: nullableInt(best.dispatch_radius_meters),
    maxRetryDurationSeconds:
      nullableInt(best.max_retry_duration_seconds) ?? strategyConfig.maxRetryDurationSeconds,
    strategy: rowStrategy ?? strategyConfig.strategy,
  };
}
