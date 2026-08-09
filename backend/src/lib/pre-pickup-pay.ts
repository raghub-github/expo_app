/**
 * Dispatch Engine — Phase 4: pre-pickup (first-mile) rider compensation.
 *
 * Pays the ACCEPTING rider an allowance for the pickup leg (rider GPS -> store), so a
 * farther rider is incentivised to accept without ever changing the CUSTOMER's price.
 * Rate + funding come from the Phase 0 config (platform_rider_dispatch_strategy_config).
 * Default rate is 0 -> allowance is 0 -> a pure no-op until an admin sets a rate.
 *
 * The pure math (`prePickupAllowanceAmount`) is separated from the DB read so it is
 * unit-testable without a database.
 */

import {
  fetchDispatchStrategyConfig,
  type PrePickupFunding,
} from "./dispatch-strategy-config.js";
import {
  haversineDistanceMeters,
  type DispatchServiceType,
} from "./order-assignment-engine.js";
import {
  resolveGeoPrePickupOverride,
  type PrePickupGeoRefs,
} from "./geo-pre-pickup-config.js";

export type { PrePickupGeoRefs } from "./geo-pre-pickup-config.js";

export type PrePickupAllowanceSource = "geo" | "global";

export type PrePickupAllowance = {
  serviceType: DispatchServiceType;
  ratePerKm: number;
  pickupDistanceMeters: number;
  pickupDistanceKm: number;
  amount: number;
  funding: PrePickupFunding;
  /** Customer share (0..100) when funding === 'shared'; 0 otherwise. */
  customerSharePct: number;
  /** Optional per-location floor/cap applied to the amount. */
  minAmount: number | null;
  maxAmount: number | null;
  /** Which config supplied the rate: a geo override or the global dispatch default. */
  source: PrePickupAllowanceSource;
};

/** Round to 2 decimals (rupees). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pure first-mile amount: rate (₹/km) × pickup distance (km), then clamped to an optional
 * [min, max] band, rounded to paise. Non-finite / negative inputs collapse to 0.
 * A floor only applies when the raw amount is > 0 (a zero-rate location pays nothing).
 * No DB, no side effects.
 */
export function prePickupAllowanceAmount(
  ratePerKm: number,
  pickupDistanceMeters: number,
  minAmount?: number | null,
  maxAmount?: number | null
): number {
  const rate = Number.isFinite(ratePerKm) && ratePerKm > 0 ? ratePerKm : 0;
  const meters =
    Number.isFinite(pickupDistanceMeters) && pickupDistanceMeters > 0
      ? pickupDistanceMeters
      : 0;
  let amount = rate * (meters / 1000);
  // NOTE: guard null/undefined explicitly — Number(null) === 0, which would wrongly
  // treat an absent cap/floor as 0 and zero out every amount.
  const max =
    maxAmount != null && Number.isFinite(Number(maxAmount)) && Number(maxAmount) >= 0
      ? Number(maxAmount)
      : null;
  if (max != null) amount = Math.min(amount, max);
  const min =
    minAmount != null && Number.isFinite(Number(minAmount)) && Number(minAmount) >= 0
      ? Number(minAmount)
      : null;
  // Floor only lifts a positive earned amount; it never manufactures pay where the rate is 0.
  if (min != null && amount > 0) amount = Math.max(amount, min);
  return roundMoney(Math.max(0, amount));
}

/**
 * Compute the first-mile allowance for a service + pickup distance.
 *
 * When `geoRefs` is supplied, a location-specific override from
 * geo_pre_pickup_compensation (closest-ancestor-wins) takes precedence over the global
 * platform_rider_dispatch_strategy_config. Falls back to the global config otherwise.
 */
export async function computePrePickupAllowance(
  serviceType: DispatchServiceType,
  pickupDistanceMeters: number,
  geoRefs?: PrePickupGeoRefs | null
): Promise<PrePickupAllowance> {
  const meters =
    Number.isFinite(pickupDistanceMeters) && pickupDistanceMeters > 0
      ? pickupDistanceMeters
      : 0;

  const override = geoRefs ? await resolveGeoPrePickupOverride(geoRefs, serviceType) : null;

  if (override) {
    return {
      serviceType,
      ratePerKm: override.ratePerKm,
      pickupDistanceMeters: Math.round(meters),
      pickupDistanceKm: Math.round((meters / 1000) * 100) / 100,
      amount: prePickupAllowanceAmount(
        override.ratePerKm,
        meters,
        override.minAmount,
        override.maxAmount
      ),
      funding: override.funding,
      customerSharePct: override.funding === "shared" ? override.customerSharePct : 0,
      minAmount: override.minAmount,
      maxAmount: override.maxAmount,
      source: "geo",
    };
  }

  const cfg = await fetchDispatchStrategyConfig(serviceType);
  return {
    serviceType,
    ratePerKm: cfg.prePickupRatePerKm,
    pickupDistanceMeters: Math.round(meters),
    pickupDistanceKm: Math.round((meters / 1000) * 100) / 100,
    amount: prePickupAllowanceAmount(cfg.prePickupRatePerKm, meters),
    funding: cfg.prePickupFunding,
    customerSharePct: 0,
    minAmount: null,
    maxAmount: null,
    source: "global",
  };
}

/** Convenience: allowance from rider GPS -> pickup point (haversine). */
export async function computePrePickupAllowanceForPickup(
  serviceType: DispatchServiceType,
  riderLat: number,
  riderLng: number,
  pickupLat: number,
  pickupLng: number,
  geoRefs?: PrePickupGeoRefs | null
): Promise<PrePickupAllowance> {
  const meters = haversineDistanceMeters(riderLat, riderLng, pickupLat, pickupLng);
  return computePrePickupAllowance(serviceType, meters, geoRefs);
}
