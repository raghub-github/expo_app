/**
 * Resolve the INDEPENDENT rider legs (pre + post) for one order (v3.2). Shared by the
 * dispatch OFFER estimate and the accept-time freeze so the offered and paid legs match.
 *
 * PRE-pickup (rider→pickup): from a rider_leg_pricing 'pre' rule; if none is configured at
 * the node, falls back to the caller's legacy first-mile allowance (geo_pre_pickup_comp) —
 * so nothing changes until a pre-leg rule exists.
 * POST-pickup (pickup→drop): from a rider_leg_pricing 'post' rule; if none, amount 0, which
 * makes the reconciliation give post = the rider-% pool remainder (v3.1 behaviour).
 */

import {
  resolveRiderLegPricing,
  type LegGeoRefs,
  type LegVehicleType,
} from "./rider-leg-pricing.js";
import { catalogCodeToPricingVehicle } from "../modules/ride-state-config/catalogVehicleMap.js";
import type { PrePickupFunding } from "@gatimitra/slab-pricing";
import type { DispatchServiceType } from "./order-assignment-engine.js";

const VALID_LEG_VEHICLES = new Set<string>([
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
  "4_wheeler_ac",
]);

/**
 * Resolve the real vehicle for THIS order so vehicle-specific pre/post leg rules can
 * actually match — without this, an admin-configured vehicle-specific rule never applies
 * to a real order. Ride: catalog code (e.g. "auto") -> pricing vehicle via the same mapping
 * already used for the customer-fare lookup. Parcel: the order's booked vehicle_category
 * (already stored as the same enum strings). Food: no vehicle dimension.
 */
export function resolveOrderLegVehicleType(args: {
  service: "food" | "parcel" | "ride";
  rideCatalogCode?: string | null;
  parcelVehicleCategory?: string | null;
}): LegVehicleType {
  if (args.service === "ride") {
    return args.rideCatalogCode ? catalogCodeToPricingVehicle(args.rideCatalogCode) : null;
  }
  if (args.service === "parcel") {
    const v = String(args.parcelVehicleCategory ?? "").trim();
    return VALID_LEG_VEHICLES.has(v) ? (v as LegVehicleType) : null;
  }
  return null;
}

export type OrderLegResult = {
  amount: number;
  funding: PrePickupFunding;
  ruleId: number | null;
  matched: boolean;
  distanceKm: number;
  ratePerKm: number;
};

export type OrderLegs = { pre: OrderLegResult; post: OrderLegResult };

export async function resolveRiderLegsForOrder(args: {
  serviceType: DispatchServiceType;
  vehicleType?: LegVehicleType;
  weightKg?: number | null;
  /** rider → pickup (km). */
  pickupKm: number;
  /** pickup → drop (km). */
  dropKm: number;
  geo: LegGeoRefs;
  /** Legacy first-mile allowance used for the PRE leg when no pre-leg rule is configured. */
  fallbackPre?: { amount: number; funding: PrePickupFunding } | null;
}): Promise<OrderLegs> {
  const [preLeg, postLeg] = await Promise.all([
    resolveRiderLegPricing({
      leg: "pre",
      service: args.serviceType,
      vehicleType: args.vehicleType ?? null,
      weightKg: args.weightKg ?? null,
      distanceKm: args.pickupKm,
      geo: args.geo,
    }).catch(() => null),
    resolveRiderLegPricing({
      leg: "post",
      service: args.serviceType,
      vehicleType: args.vehicleType ?? null,
      weightKg: args.weightKg ?? null,
      distanceKm: args.dropKm,
      geo: args.geo,
    }).catch(() => null),
  ]);

  const pre: OrderLegResult =
    preLeg && preLeg.matched
      ? {
          amount: preLeg.rawAmount,
          funding: preLeg.funding,
          ruleId: preLeg.ruleId,
          matched: true,
          distanceKm: args.pickupKm,
          ratePerKm: preLeg.ratePerKm,
        }
      : {
          amount: Math.max(0, args.fallbackPre?.amount ?? 0),
          funding: args.fallbackPre?.funding ?? "company",
          ruleId: null,
          matched: false,
          distanceKm: args.pickupKm,
          ratePerKm: 0,
        };

  const post: OrderLegResult =
    postLeg && postLeg.matched
      ? {
          amount: postLeg.rawAmount,
          funding: postLeg.funding,
          ruleId: postLeg.ruleId,
          matched: true,
          distanceKm: args.dropKm,
          ratePerKm: postLeg.ratePerKm,
        }
      : {
          amount: 0,
          funding: "customer",
          ruleId: null,
          matched: false,
          distanceKm: args.dropKm,
          ratePerKm: 0,
        };

  return { pre, post };
}
