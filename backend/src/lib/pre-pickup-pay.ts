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

export type PrePickupAllowance = {
  serviceType: DispatchServiceType;
  ratePerKm: number;
  pickupDistanceMeters: number;
  pickupDistanceKm: number;
  amount: number;
  funding: PrePickupFunding;
};

/** Round to 2 decimals (rupees). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Pure first-mile amount: rate (₹/km) × pickup distance (km), rounded to paise.
 * Non-finite / negative inputs collapse to 0. No DB, no side effects.
 */
export function prePickupAllowanceAmount(
  ratePerKm: number,
  pickupDistanceMeters: number
): number {
  const rate = Number.isFinite(ratePerKm) && ratePerKm > 0 ? ratePerKm : 0;
  const meters =
    Number.isFinite(pickupDistanceMeters) && pickupDistanceMeters > 0
      ? pickupDistanceMeters
      : 0;
  return roundMoney(rate * (meters / 1000));
}

/** Compute the first-mile allowance for a service + pickup distance (reads config). */
export async function computePrePickupAllowance(
  serviceType: DispatchServiceType,
  pickupDistanceMeters: number
): Promise<PrePickupAllowance> {
  const cfg = await fetchDispatchStrategyConfig(serviceType);
  const meters =
    Number.isFinite(pickupDistanceMeters) && pickupDistanceMeters > 0
      ? pickupDistanceMeters
      : 0;
  return {
    serviceType,
    ratePerKm: cfg.prePickupRatePerKm,
    pickupDistanceMeters: Math.round(meters),
    pickupDistanceKm: Math.round((meters / 1000) * 100) / 100,
    amount: prePickupAllowanceAmount(cfg.prePickupRatePerKm, meters),
    funding: cfg.prePickupFunding,
  };
}

/** Convenience: allowance from rider GPS -> pickup point (haversine). */
export async function computePrePickupAllowanceForPickup(
  serviceType: DispatchServiceType,
  riderLat: number,
  riderLng: number,
  pickupLat: number,
  pickupLng: number
): Promise<PrePickupAllowance> {
  const meters = haversineDistanceMeters(riderLat, riderLng, pickupLat, pickupLng);
  return computePrePickupAllowance(serviceType, meters);
}
