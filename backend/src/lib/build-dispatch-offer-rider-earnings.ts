/**
 * Rider Fare Engine v3.0 — earnings for a dispatch offer (push/WS + poll).
 * Always percentage-of-customer-fare via resolveOrderRiderPayoutBreakdown.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, ordersRide, ordersParcel } from "../db/schema.js";
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
import { readDynamicRiderIncentiveFromSnapshot } from "./dynamic-pricing.js";
import {
  defaultPrePickupFunding,
  normalizePrePickupFunding,
  type PrePickupFunding,
} from "./rider-payout-composition.js";
import { reconcileRiderLegs } from "@gatimitra/slab-pricing";
import {
  resolveRiderLegsForOrder,
  resolveOrderLegVehicleType,
} from "./resolve-rider-legs-for-order.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

export type DispatchOfferRiderEarnings = {
  estimatedEarning: number;
  baseEarning: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  customerTipAmount?: number;
  /**
   * Total first-mile allowance the rider receives for this pickup distance (v3.1).
   * Composed WITH the % pool — see prePickupFromPool / prePickupCompanyFunded.
   */
  prePickupEarning?: number;
  /** First-mile portion carved out of the % pool (customer/delivery-fee funded). */
  prePickupFromPool?: number;
  /** First-mile portion funded on top by the company. */
  prePickupCompanyFunded?: number;
  /** Post-pickup (drop) share of the pool after first-mile allocation. */
  postPickupEarning?: number;
  /** How the first-mile is funded for this service. */
  prePickupFunding?: PrePickupFunding;
  /** Company-funded dynamic incentive (night/rain/peak/festival) from the customer bill. */
  dynamicIncentiveEarning?: number;
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
      billingSnapshot: ordersCore.billingSnapshot,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, args.orderCoreId))
    .limit(1);
  if (!core) return null;

  let rideType: string | null = null;
  let parcelWeightKg: number | null = null;
  let parcelVehicleCategory: string | null = null;
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
    if (service === "parcel") {
      const [parcel] = await db
        .select({
          weightKg: ordersParcel.weightKg,
          vehicleCategory: ordersParcel.vehicleCategory,
        })
        .from(ordersParcel)
        .where(eq(ordersParcel.orderId, args.orderCoreId))
        .limit(1);
      const w = Number(parcel?.weightKg);
      parcelWeightKg = Number.isFinite(w) && w > 0 ? w : null;
      parcelVehicleCategory = parcel?.vehicleCategory ?? null;
    }
    const t = Number(core.tipAmount ?? 0);
    tip = Number.isFinite(t) && t > 0 ? Math.round(t) : 0;
  }
  const legVehicleType = resolveOrderLegVehicleType({
    service,
    rideCatalogCode: rideType,
    parcelVehicleCategory,
  });

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
    // parcel's real vehicle so a vehicle-specific rider%/waiting rule actually matches —
    // the internal fallback only resolves vehicle for "ride" (via rideCatalogCode).
    vehicleType: legVehicleType,
    pincode: rideGeo.pickupPincode,
    state: rideGeo.pickupState,
  });

  if (payout == null || payout.finalAmount <= 0) return null;

  // First-mile allowance estimate — SAME computation persisted at accept + paid on
  // delivery, so the offer never promises more than the rider is paid. 0 unless a rate
  // is configured.
  // Geo-aware for ALL services: ride carries pickup pincode/state in checkout metadata;
  // food (store) / parcel (drop-off) fall back to the pickup lat/lng via the cached
  // reverse-geocoder. So every service resolves the per-location pre-pickup rate + funding.
  const prePickup = await computePrePickupAllowance(
    args.serviceType,
    args.pickupDistanceMeters,
    {
      pincode: rideGeo.pickupPincode,
      state: rideGeo.pickupState,
      latitude: pickupLat,
      longitude: pickupLng,
    }
  ).catch(() => null);
  const prePickupRaw = prePickup && prePickup.amount > 0 ? prePickup.amount : 0;
  const prePickupFunding = normalizePrePickupFunding(
    prePickup?.funding,
    defaultPrePickupFunding(service)
  );

  const tripDistanceKm = Math.max(0, bookingTripKm ?? 0);

  // Company-funded dynamic incentive (night/rain/peak/festival) — a Ledger-B top-up.
  const dynIncentive = readDynamicRiderIncentiveFromSnapshot(core.billingSnapshot);
  const dynamicIncentiveEarning = dynIncentive.amount > 0 ? dynIncentive.amount : 0;
  const mergedSurges = [
    ...payout.appliedSurges,
    ...dynIncentive.lines.map((l) => ({ name: l.name, amount: l.amount })),
  ];

  // v3.2 — resolve the two legs INDEPENDENTLY. PRE falls back to the legacy first-mile when
  // no pre-leg rule exists; POST is 0 (⇒ pool remainder) when no post-leg rule exists — so
  // with an empty rider_leg_pricing table this is byte-identical to the v3.1 composition.
  // Vehicle (ride catalog code / parcel booked category) + parcel weight are the order's
  // REAL values, so vehicle-/weight-specific leg rules actually match real orders.
  const legs = await resolveRiderLegsForOrder({
    serviceType: args.serviceType,
    vehicleType: legVehicleType,
    weightKg: parcelWeightKg,
    pickupKm: pickupDistanceKm,
    dropKm: tripDistanceKm,
    geo: {
      pincode: rideGeo.pickupPincode,
      state: rideGeo.pickupState,
      latitude: pickupLat,
      longitude: pickupLng,
    },
    fallbackPre: { amount: prePickupRaw, funding: prePickupFunding },
  });

  const composition = reconcileRiderLegs({
    pool: Math.max(0, payout.subtotalBeforeSurge - payout.waitingAmount),
    pre: { rawAmount: legs.pre.amount, funding: legs.pre.funding },
    post: { rawAmount: legs.post.amount, funding: legs.post.funding },
    surge: payout.surgeTotal,
    waiting: payout.waitingAmount,
    tip,
    companyIncentive: dynamicIncentiveEarning,
  });
  const prePickupPaid = Math.round((composition.pre.allocated + composition.pre.companyFunded) * 100) / 100;

  const total = composition.riderTotal;

  return {
    estimatedEarning: total,
    baseEarning: payout.subtotalBeforeSurge,
    waitingEarning: payout.waitingAmount > 0 ? payout.waitingAmount : undefined,
    surgeEarning:
      payout.surgeTotal + dynamicIncentiveEarning > 0
        ? Math.round((payout.surgeTotal + dynamicIncentiveEarning) * 100) / 100
        : undefined,
    appliedSurges: mergedSurges.length > 0 ? mergedSurges : undefined,
    customerTipAmount: tip > 0 ? tip : undefined,
    prePickupEarning: prePickupPaid > 0 ? prePickupPaid : undefined,
    prePickupFromPool:
      composition.pre.allocated > 0 ? composition.pre.allocated : undefined,
    prePickupCompanyFunded:
      composition.pre.companyFunded > 0 ? composition.pre.companyFunded : undefined,
    postPickupEarning: composition.post.allocated > 0 ? composition.post.allocated : undefined,
    prePickupFunding: legs.pre.funding,
    dynamicIncentiveEarning: dynamicIncentiveEarning > 0 ? dynamicIncentiveEarning : undefined,
    totalEarning: total,
    pickupDistanceKm,
    tripDistanceKm,
    totalDistanceKm: Math.round((pickupDistanceKm + tripDistanceKm) * 1000) / 1000,
    pricingEngine: "rider_percentage_v3",
  };
}
