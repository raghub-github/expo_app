import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import { loadEffectiveRideCustomerPricing } from "../rider-payout-pricing/riderPayoutPricing.repository.js";
import {
  fallbackSlabsToDeliveryRows,
  loadFallbackCustomerSlabs,
} from "../fallback-pricing/fallbackSlabPricing.repository.js";
import { catalogCodeToPricingVehicle } from "./catalogVehicleMap.js";
import {
  loadRideVehicleLimitsForState,
  resolveRidePricingGeoFromPickup,
} from "./rideStateConfig.repository.js";
import { isCatalogOptionEligibleForTrip } from "./rideEligibility.service.js";
import { applyBikeLiteCustomerFare } from "./rideCustomerFare.js";
import { formatRideCustomerRateCardSummary, formatRideWaitingChargeNote } from "./rideRateCardDisplay.js";
import { resolveRidePickupFreeWaitMinutes } from "../../lib/ride-pickup-wait.js";
import { loadEffectiveRiderPickupSlabs } from "../rider-payout-pricing/riderPayoutPricing.repository.js";

export async function quoteCustomerRideFare(args: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  tripKm: number;
  catalogCode: string;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<
  | {
      ok: true;
      stateId: string | null;
      pricingGeoLevel: string | null;
      pricingGeoRefId: string | null;
      pricingVehicle: RideVehiclePricingType | null;
      eligible: boolean;
      maxDistanceKm: number | null;
      baseFare: number;
      distanceFare: number;
      surgeTotal: number;
      finalFare: number;
      appliedSurges: Array<{ name: string; amount: number }>;
      rateCardSummary: string | null;
      waitingChargeNote: string | null;
    }
  | { ok: false; code: string; message: string }
> {
  const tripKm = Math.max(0, args.tripKm);
  // eslint-disable-next-line no-console
  console.log(
    "[ride-quote] fare_distance",
    JSON.stringify({
      catalogCode: args.catalogCode,
      fareCalculationDistanceKm: tripKm,
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropLat: args.dropLat,
      dropLng: args.dropLng,
    })
  );
  const pricingVehicle = catalogCodeToPricingVehicle(args.catalogCode);
  const { stateId, pricingGeo } = await resolveRidePricingGeoFromPickup({
    pickupLat: args.pickupLat,
    pickupLng: args.pickupLng,
    pickupPincode: args.pickupPincode,
    pickupState: args.pickupState,
  });

  const limits = stateId ? await loadRideVehicleLimitsForState(stateId) : [];
  const eligible = isCatalogOptionEligibleForTrip({
    catalogCode: args.catalogCode,
    tripKm,
    limits,
  });

  const maxDistanceKm =
    pricingVehicle && stateId
      ? (limits.find((l) => l.vehicleType === pricingVehicle)?.maxDistanceKm ?? null)
      : null;

  if (!eligible) {
    return {
      ok: true,
      stateId,
      pricingGeoLevel: pricingGeo?.level ?? null,
      pricingGeoRefId: pricingGeo?.refId ?? null,
      pricingVehicle,
      eligible: false,
      maxDistanceKm,
      baseFare: 0,
      distanceFare: 0,
      surgeTotal: 0,
      finalFare: 0,
      appliedSurges: [],
      rateCardSummary: null,
      waitingChargeNote: null,
    };
  }

  if (!pricingVehicle) {
    return { ok: false, code: "NO_PRICING_CONTEXT", message: "Could not resolve ride pricing context" };
  }

  let rideSlabs: DeliveryRateSlabRow[] = [];
  let pricingGeoLevel: string | null = pricingGeo?.level ?? null;
  let pricingGeoRefId: string | null = pricingGeo?.refId ?? null;
  let rateCardSlabs: import("../rider-payout-pricing/types.js").RideCustomerPricingRow[] = [];

  if (pricingGeo) {
    const pricing = await loadEffectiveRideCustomerPricing({
      level: pricingGeo.level,
      refId: pricingGeo.refId,
      vehicleType: pricingVehicle,
    });
    rateCardSlabs = pricing.slabs;
    pricingGeoLevel = pricing.applied?.level ?? pricingGeo.level;
    pricingGeoRefId = pricing.applied?.refId ?? pricingGeo.refId;
    if (pricing.slabs.length > 0) {
      rideSlabs = pricing.slabs.map((s) => ({
        id: s.id,
        geoLevel: s.geoLevel,
        geoRefId: s.geoRefId,
        serviceType: "person_ride" as DeliveryServiceType,
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
  }

  if (rideSlabs.length === 0) {
    const fallbackSlabs = await loadFallbackCustomerSlabs({
      service: "person_ride",
      vehicleType: pricingVehicle,
    });
    rideSlabs = fallbackSlabsToDeliveryRows(fallbackSlabs, "person_ride");
    rateCardSlabs = fallbackSlabs.map((s) => ({
      id: s.id,
      geoLevel: "state" as const,
      geoRefId: "00000000-0000-0000-0000-000000000000",
      vehicleType: s.vehicleType!,
      minKm: s.minKm,
      maxKm: s.maxKm,
      baseFare: s.baseFare,
      perKmRate: s.perKmRate,
      minCharge: s.minCharge,
      priority: s.priority,
      isActive: s.isActive,
    }));
    pricingGeoLevel = "fallback";
    pricingGeoRefId = null;
  }

  if (rideSlabs.length === 0) {
    return {
      ok: false,
      code: "NO_SLABS",
      message: "No ride customer pricing configured for this pickup area or fallback",
    };
  }

  const slabQuote = calculateProgressiveSlabAmount({
    distanceKm: tripKm,
    slabs: rideSlabs,
  });

  if (!slabQuote.ok) {
    return { ok: false, code: slabQuote.code, message: slabQuote.message };
  }

  const subtotal = slabQuote.quote.finalAmount;
  let finalFare = Math.round(subtotal * 100) / 100;
  let baseFare = slabQuote.quote.baseFareApplied;
  let distanceFare = subtotal - slabQuote.quote.baseFareApplied;

  // Bike Lite is always ₹12 below Bike (customer slabs only — no surges on customer fare).
  if (args.catalogCode === "bike-lite") {
    const bikeQuote = await quoteCustomerRideFare({ ...args, catalogCode: "bike" });
    if (bikeQuote.ok && bikeQuote.eligible && bikeQuote.finalFare > 0) {
      finalFare = applyBikeLiteCustomerFare(bikeQuote.finalFare);
      const ratio = bikeQuote.finalFare > 0 ? finalFare / bikeQuote.finalFare : 1;
      baseFare = Math.round(bikeQuote.baseFare * ratio * 100) / 100;
      distanceFare = Math.round((finalFare - baseFare) * 100) / 100;
    }
  }

  const rateCardSummary = formatRideCustomerRateCardSummary(rateCardSlabs);
  let waitingChargeNote: string | null = null;
  if (pricingVehicle) {
    const freeMinutes = await resolveRidePickupFreeWaitMinutes({
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      rideType: args.catalogCode,
    });
    let perMin = 0;
    if (pricingGeo) {
      const { slabs: pickupSlabs } = await loadEffectiveRiderPickupSlabs({
        level: pricingGeo.level,
        refId: pricingGeo.refId,
        service: "ride",
        vehicleType: pricingVehicle,
      });
      const sortedPickup = [...pickupSlabs].sort(
        (a, b) =>
          a.minKm - b.minKm ||
          (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) ||
          b.priority - a.priority ||
          a.id - b.id
      );
      perMin = sortedPickup[0]?.waitingChargePerMin ?? 0;
    } else {
      const fallbackSlabs = await loadFallbackCustomerSlabs({
        service: "person_ride",
        vehicleType: pricingVehicle,
      });
      perMin = fallbackSlabs[0]?.waitingChargePerMin ?? 0;
    }
    waitingChargeNote = formatRideWaitingChargeNote(freeMinutes, perMin ?? 0);
  }

  return {
    ok: true,
    stateId,
    pricingGeoLevel,
    pricingGeoRefId,
    pricingVehicle,
    eligible: true,
    maxDistanceKm,
    baseFare,
    distanceFare,
    surgeTotal: 0,
    finalFare,
    appliedSurges: [],
    rateCardSummary,
    waitingChargeNote,
  };
}
