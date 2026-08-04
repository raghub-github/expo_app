/**
 * Rider Fare Engine v3.0 — earnings for a dispatch offer (push/WS + poll).
 * Always percentage-of-customer-fare via resolveOrderRiderPayoutBreakdown.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersRide } from "../db/schema.js";
import {
  rideGeoFromCheckoutMetadata,
  rideTripDistanceFromCheckoutMetadata,
  roundRideTripDistanceKm,
} from "./ride-address-display.js";
import { resolveRiderDeliveryFeeFromBilling } from "./rider-order-earning-resolve.js";
import {
  resolveOrderRiderPayoutBreakdown,
  type OrderRiderPayoutService,
} from "./resolve-order-rider-payout.js";
import { computePrePickupAllowance } from "./pre-pickup-pay.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

export type DispatchOfferRiderEarnings = {
  estimatedEarning: number;
  baseEarning: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  customerTipAmount?: number;
  /** First-mile allowance estimate for this pickup distance (Phase 4b). Company-funded. */
  prePickupEarning?: number;
  totalEarning: number;
  pickupDistanceKm: number;
  tripDistanceKm: number;
  totalDistanceKm: number;
  pricingEngine: "rider_percentage_v3";
};

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPayoutService(serviceType: DispatchServiceType): OrderRiderPayoutService {
  if (serviceType === "person_ride") return "ride";
  return serviceType;
}

/** Customer fare used as the % base (never sent to the rider app). */
export async function resolveCustomerFareForRiderPayout(
  orderCoreId: number,
  service: OrderRiderPayoutService
): Promise<number> {
  const db = getDb();
  if (service === "ride") {
    const [row] = await db
      .select({
        fareAmount: ordersCore.fareAmount,
        estimatedFare: ordersRide.estimatedFare,
        finalFare: ordersRide.finalFare,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, orderCoreId))
      .limit(1);
    const fare = Number(row?.finalFare ?? row?.estimatedFare ?? row?.fareAmount ?? 0);
    return Number.isFinite(fare) && fare > 0 ? fare : 0;
  }

  const [row] = await db
    .select({
      fareAmount: ordersCore.fareAmount,
      billingSnapshot: ordersCore.billingSnapshot,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);
  if (!row) return 0;
  return resolveRiderDeliveryFeeFromBilling({
    fareAmount: row.fareAmount,
    billingSnapshot: row.billingSnapshot,
  });
}

/**
 * Compute rider offer earnings for one eligible rider + order.
 * Returns null if the v3 engine cannot produce a positive payout.
 */
export async function buildDispatchOfferRiderEarnings(args: {
  orderCoreId: number;
  serviceType: DispatchServiceType;
  riderId: number;
  riderLat: number;
  riderLng: number;
  pickupDistanceMeters: number;
}): Promise<DispatchOfferRiderEarnings | null> {
  const service = toPayoutService(args.serviceType);
  const db = getDb();

  const [core] = await db
    .select({
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      distanceKm: ordersCore.distanceKm,
      tipAmount: ordersCore.tipAmount,
      checkoutMetadata: ordersCore.checkoutMetadata,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, args.orderCoreId))
    .limit(1);
  if (!core) return null;

  let rideType: string | null = null;
  let tip = 0;
  if (service === "ride") {
    const [ride] = await db
      .select({
        rideType: ordersRide.rideType,
        customerTipAmount: ordersRide.customerTipAmount,
      })
      .from(ordersRide)
      .where(eq(ordersRide.orderId, args.orderCoreId))
      .limit(1);
    rideType = ride?.rideType ?? null;
    const t = Number(ride?.customerTipAmount ?? 0);
    tip = Number.isFinite(t) && t > 0 ? Math.round(t) : 0;
  } else {
    const t = Number(core.tipAmount ?? 0);
    tip = Number.isFinite(t) && t > 0 ? Math.round(t) : 0;
  }

  const customerFare = await resolveCustomerFareForRiderPayout(args.orderCoreId, service);
  if (customerFare <= 0) return null;

  const pickupLat = parseCoord(core.pickupLat);
  const pickupLng = parseCoord(core.pickupLon);
  const dropLat = parseCoord(core.dropLat);
  const dropLng = parseCoord(core.dropLon);
  const pickupDistanceKm =
    Number.isFinite(args.pickupDistanceMeters) && args.pickupDistanceMeters >= 0
      ? Math.round((args.pickupDistanceMeters / 1000) * 1000) / 1000
      : 0;

  const rideGeo = service === "ride" ? rideGeoFromCheckoutMetadata(core.checkoutMetadata) : {};
  const bookingTripKm =
    service === "ride"
      ? rideTripDistanceFromCheckoutMetadata(core.checkoutMetadata) ??
        roundRideTripDistanceKm(Number(core.distanceKm))
      : roundRideTripDistanceKm(Number(core.distanceKm));

  if (service === "ride" && (bookingTripKm == null || bookingTripKm <= 0)) {
    return null;
  }

  const payout = await resolveOrderRiderPayoutBreakdown({
    service,
    customerFare,
    pickupLat,
    pickupLng,
    dropLat,
    dropLng,
    pickupKm: pickupDistanceKm,
    dropKm: bookingTripKm,
    riderLat: args.riderLat,
    riderLng: args.riderLng,
    riderId: args.riderId,
    rideCatalogCode: rideType,
    pincode: rideGeo.pickupPincode,
    state: rideGeo.pickupState,
  });

  if (payout == null || payout.finalAmount <= 0) return null;

  // First-mile allowance estimate — SAME computation persisted at accept + paid on
  // delivery, so the offer never promises more than the rider is paid. 0 unless a rate
  // is configured.
  const prePickup = await computePrePickupAllowance(
    args.serviceType,
    args.pickupDistanceMeters
  ).catch(() => null);
  const prePickupEarning = prePickup && prePickup.amount > 0 ? prePickup.amount : 0;

  const tripDistanceKm = Math.max(0, bookingTripKm ?? 0);
  const total = payout.finalAmount + tip + prePickupEarning;

  return {
    estimatedEarning: total,
    baseEarning: payout.subtotalBeforeSurge,
    waitingEarning: payout.waitingAmount > 0 ? payout.waitingAmount : undefined,
    surgeEarning: payout.surgeTotal > 0 ? payout.surgeTotal : undefined,
    appliedSurges: payout.appliedSurges.length > 0 ? payout.appliedSurges : undefined,
    customerTipAmount: tip > 0 ? tip : undefined,
    prePickupEarning: prePickupEarning > 0 ? prePickupEarning : undefined,
    totalEarning: total,
    pickupDistanceKm,
    tripDistanceKm,
    totalDistanceKm: Math.round((pickupDistanceKm + tripDistanceKm) * 1000) / 1000,
    pricingEngine: "rider_percentage_v3",
  };
}
