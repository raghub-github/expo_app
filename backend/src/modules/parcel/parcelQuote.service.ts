/**
 * Parcel customer fare quote — uses parcel_customer_pricing geo slabs per vehicle type.
 */

import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type { RideCustomerPricingRow, RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import { loadEffectiveParcelCustomerPricing } from "../rider-payout-pricing/riderPayoutPricing.repository.js";
import { resolveRidePricingGeoFromPickup } from "../ride-state-config/rideStateConfig.repository.js";

/** Parcel customer quote vehicles — no 4 Wheeler AC. */
export const PARCEL_VEHICLE_TYPES: RideVehiclePricingType[] = [
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
];

export type ParcelFareQuoteOk = {
  ok: true;
  vehicleType: RideVehiclePricingType;
  eligible: boolean;
  baseFare: number;
  distanceFare: number;
  finalFare: number;
  pricingGeoLevel: string | null;
  pricingGeoRefId: string | null;
};

export type ParcelFareQuoteFail = { ok: false; code: string; message: string; vehicleType?: RideVehiclePricingType };

export type ParcelFareQuoteResult = ParcelFareQuoteOk | ParcelFareQuoteFail;

function toDeliveryRows(slabs: RideCustomerPricingRow[]): DeliveryRateSlabRow[] {
  return slabs.map((s) => ({
    id: s.id,
    geoLevel: s.geoLevel,
    geoRefId: s.geoRefId,
    serviceType: "parcel" as DeliveryServiceType,
    actorType: "customer" as DeliveryActorType,
    minKm: s.minKm,
    maxKm: s.maxKm,
    baseFare: s.baseFare,
    perKmRate: s.perKmRate,
    minCharge: s.minCharge,
    priority: s.priority,
    isActive: s.isActive,
  }));
}

export async function quoteParcelVehicleFare(args: {
  pickupLat: number;
  pickupLng: number;
  tripKm: number;
  vehicleType: RideVehiclePricingType;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<ParcelFareQuoteResult> {
  const tripKm = Math.max(0, args.tripKm);
  const { pricingGeo } = await resolveRidePricingGeoFromPickup({
    pickupLat: args.pickupLat,
    pickupLng: args.pickupLng,
    pickupPincode: args.pickupPincode,
    pickupState: args.pickupState,
  });

  if (!pricingGeo) {
    return {
      ok: false,
      code: "NO_GEO",
      message: "Could not resolve pricing geo for pickup",
      vehicleType: args.vehicleType,
    };
  }

  const pricing = await loadEffectiveParcelCustomerPricing({
    level: pricingGeo.level,
    refId: pricingGeo.refId,
    vehicleType: args.vehicleType,
  });

  if (pricing.slabs.length === 0) {
    return {
      ok: true,
      vehicleType: args.vehicleType,
      eligible: false,
      baseFare: 0,
      distanceFare: 0,
      finalFare: 0,
      pricingGeoLevel: pricing.applied?.level ?? pricingGeo.level,
      pricingGeoRefId: pricing.applied?.refId ?? pricingGeo.refId,
    };
  }

  const slabs = toDeliveryRows(pricing.slabs);
  const calc = calculateProgressiveSlabAmount({
    distanceKm: tripKm,
    slabs,
    applyRiderExtras: false,
  });

  if (!calc.ok) {
    return {
      ok: false,
      code: calc.code,
      message: calc.message,
      vehicleType: args.vehicleType,
    };
  }

  const baseFare = Math.round(calc.quote.baseFareApplied * 100) / 100;
  const finalFare = Math.round(calc.quote.finalAmount * 100) / 100;
  const distanceFare = Math.round((finalFare - baseFare) * 100) / 100;

  return {
    ok: true,
    vehicleType: args.vehicleType,
    eligible: finalFare > 0,
    baseFare,
    distanceFare: Math.max(0, distanceFare),
    finalFare,
    pricingGeoLevel: pricing.applied?.level ?? pricingGeo.level,
    pricingGeoRefId: pricing.applied?.refId ?? pricingGeo.refId,
  };
}

export async function quoteParcelVehicleFareBatch(args: {
  pickupLat: number;
  pickupLng: number;
  tripKm: number;
  vehicleTypes?: RideVehiclePricingType[];
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<{
  quotes: Record<string, ParcelFareQuoteResult>;
}> {
  const types = args.vehicleTypes?.length
    ? args.vehicleTypes.filter((t) => PARCEL_VEHICLE_TYPES.includes(t))
    : [...PARCEL_VEHICLE_TYPES];
  if (types.length === 0) {
    return { quotes: {} };
  }
  const quotes: Record<string, ParcelFareQuoteResult> = {};
  await Promise.all(
    types.map(async (vehicleType) => {
      quotes[vehicleType] = await quoteParcelVehicleFare({
        pickupLat: args.pickupLat,
        pickupLng: args.pickupLng,
        tripKm: args.tripKm,
        vehicleType,
        pickupPincode: args.pickupPincode,
        pickupState: args.pickupState,
      });
    })
  );
  return { quotes };
}
