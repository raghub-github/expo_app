import { resolveGeoLocation } from "../modules/billing/geoLocationResolver.js";
import { catalogCodeToPricingVehicle } from "../modules/ride-state-config/catalogVehicleMap.js";
import { pickMostSpecificGeoAnchor, resolveRidePricingGeoFromPickup } from "../modules/ride-state-config/rideStateConfig.repository.js";
import { resolveRiderPayoutQuote } from "../modules/rider-payout-pricing/resolveRiderPayoutQuote.js";
import type { GeoHierarchyLevel, RideVehiclePricingType } from "../modules/rider-payout-pricing/types.js";
import { haversineDistanceMeters } from "./order-assignment-engine.js";
import type { RiderPayoutTrace } from "./calc-trace.js";

export type OrderRiderPayoutService = "food" | "parcel" | "ride";

export type OrderRiderPayoutBreakdown = {
  finalAmount: number;
  subtotalBeforeSurge: number;
  waitingAmount: number;
  surgeTotal: number;
  appliedSurges: { name: string; amount: number }[];
  /** calc_trace inputs: the geo node + rule that produced this payout. */
  trace: RiderPayoutTrace | null;
};

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function kmBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  if (!aLat || !aLng || !bLat || !bLng) return 0;
  return haversineDistanceMeters(aLat, aLng, bLat, bLng) / 1000;
}

export async function resolveOrderRiderPayoutBreakdown(args: {
  service: OrderRiderPayoutService;
  customerFare: number;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  pickupKm?: number | null;
  dropKm?: number | null;
  riderLat?: number | null;
  riderLng?: number | null;
  pincode?: string | null;
  state?: string | null;
  riderId?: number | null;
  vehicleType?: RideVehiclePricingType | null;
  rideCatalogCode?: string | null;
  waitingMinutes?: number;
}): Promise<OrderRiderPayoutBreakdown | null> {
  const pickupLat = parseCoord(args.pickupLat);
  const pickupLng = parseCoord(args.pickupLng);
  const dropLat = parseCoord(args.dropLat);
  const dropLng = parseCoord(args.dropLng);

  let level: GeoHierarchyLevel;
  let refId: string;

  if (args.service === "ride") {
    const rideGeo = await resolveRidePricingGeoFromPickup({
      pickupLat,
      pickupLng,
      pickupPincode: args.pincode,
      pickupState: args.state,
    });
    if (!rideGeo.pricingGeo) return null;
    level = rideGeo.pricingGeo.level;
    refId = rideGeo.pricingGeo.refId;
  } else {
    const geo = await resolveGeoLocation({
      livePincode: args.pincode,
      liveState: args.state,
      latitude: dropLat,
      longitude: dropLng,
    });
    const anchor = pickMostSpecificGeoAnchor(geo.refs);
    if (!anchor) return null;
    level = anchor.level;
    refId = anchor.refId;
  }

  let pickupKm = args.pickupKm ?? null;
  let dropKm = args.dropKm ?? null;
  if (args.service === "ride") {
    if (dropKm == null || !Number.isFinite(dropKm) || dropKm <= 0) {
      return null;
    }
  } else if (dropKm == null || !Number.isFinite(dropKm) || dropKm <= 0) {
    dropKm = kmBetween(pickupLat, pickupLng, dropLat, dropLng);
  }
  if (pickupKm == null || !Number.isFinite(pickupKm) || pickupKm < 0) {
    const riderLat = args.riderLat ?? null;
    const riderLng = args.riderLng ?? null;
    pickupKm =
      riderLat != null && riderLng != null
        ? kmBetween(riderLat, riderLng, pickupLat, pickupLng)
        : 0;
  }

  const vehicleType =
    args.vehicleType ??
    (args.service === "ride" && args.rideCatalogCode
      ? catalogCodeToPricingVehicle(args.rideCatalogCode)
      : null);

  if (!Number.isFinite(args.customerFare) || args.customerFare <= 0) return null;

  const quote = await resolveRiderPayoutQuote({
    level,
    refId,
    service: args.service,
    customerFare: args.customerFare,
    pickupKm: Math.max(0, pickupKm),
    dropKm: Math.max(0, dropKm),
    waitingMinutes: args.waitingMinutes ?? 0,
    riderId: args.riderId ?? undefined,
    vehicleType,
  });

  if (!quote.ok || quote.quote.finalAmount <= 0) return null;

  const appliedSurges = (quote.quote.appliedSurges ?? [])
    .map((s) => ({
      name: s.name?.trim() || "Surge",
      amount: Math.round(s.amount),
    }))
    .filter((s) => s.amount > 0);

  return {
    finalAmount: Math.round(quote.quote.finalAmount),
    subtotalBeforeSurge: Math.round(quote.quote.subtotalBeforeSurge),
    waitingAmount: Math.round(quote.quote.waitingAmount ?? 0),
    surgeTotal: Math.round(quote.quote.surgeTotal ?? 0),
    appliedSurges,
    trace: {
      level,
      refId,
      ruleId: quote.quote.ruleId ?? null,
      rulePriority: quote.quote.rulePriority ?? null,
      riderPercentage: quote.quote.riderPercentage ?? null,
      grossBasis: args.customerFare,
      vehicleType: vehicleType ?? null,
    },
  };
}

export async function resolveOrderRiderPayoutAmount(args: {
  service: OrderRiderPayoutService;
  customerFare: number;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  pickupKm?: number | null;
  dropKm?: number | null;
  riderLat?: number | null;
  riderLng?: number | null;
  pincode?: string | null;
  state?: string | null;
  riderId?: number | null;
  vehicleType?: RideVehiclePricingType | null;
  rideCatalogCode?: string | null;
  waitingMinutes?: number;
}): Promise<number | null> {
  const breakdown = await resolveOrderRiderPayoutBreakdown(args);
  return breakdown?.finalAmount ?? null;
}
