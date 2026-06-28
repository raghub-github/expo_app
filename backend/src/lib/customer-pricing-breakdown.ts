import type { CustomerPricingBreakdown, CustomerPricingSource } from "@gatimitra/contracts";
import type { DeliveryServiceType } from "../modules/delivery-slab-pricing/types.js";
import type { SelectedSlabQuote } from "../modules/delivery-slab-pricing/deliverySlabPricing.service.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapPricingSource(engine: string): CustomerPricingSource {
  if (engine === "slab_geo") return "geo_slab";
  if (engine === "fallback_slab") return "fallback_slab";
  if (engine === "fallback_per_km" || engine === "no_geo_match" || engine === "slab_invalid") {
    return "fallback_per_km";
  }
  return "other";
}

function mapServiceType(service: DeliveryServiceType): "food" | "parcel" | "ride" {
  if (service === "person_ride") return "ride";
  return service;
}

export function buildCustomerPricingBreakdown(args: {
  service: DeliveryServiceType;
  pricingEngine: string;
  distanceKm: number;
  deliveryFee: number;
  deliveryGst?: number;
  slabQuote?: SelectedSlabQuote | null;
  appliedGeoLevel?: string | null;
  rideVehicleType?: string | null;
}): CustomerPricingBreakdown {
  const slab = args.slabQuote;
  const baseFare = round2(slab?.baseFareApplied ?? 0);
  const preMin = round2(slab?.preMinChargeTotal ?? args.deliveryFee);
  const distanceCharge = round2(Math.max(0, preMin - baseFare));
  const minChargeApplied = round2(
    slab?.minCharge != null && slab.minCharge > 0 && preMin < (slab.minCharge ?? 0)
      ? round2((slab.minCharge ?? 0) - preMin)
      : slab?.finalAmount != null && slab.finalAmount > preMin
        ? round2(slab.finalAmount - preMin)
        : 0
  );

  const pricingSource = mapPricingSource(args.pricingEngine);
  const isRide = args.service === "person_ride";

  return {
    service_type: mapServiceType(args.service),
    pricing_source: isRide && pricingSource === "geo_slab" ? "ride_vehicle_slab" : pricingSource,
    currency: "INR",
    distance_km: round2(args.distanceKm),
    base_fare: baseFare,
    distance_charge: distanceCharge,
    min_charge_applied: minChargeApplied,
    waiting_charge: 0,
    surge_charge: 0,
    taxes: round2(args.deliveryGst ?? 0),
    delivery_fee: round2(args.deliveryFee),
    total_payable_delivery: round2(args.deliveryFee + (args.deliveryGst ?? 0)),
    slab_meta: {
      slab_node_id: args.appliedGeoLevel ?? null,
      slab_node_type: args.appliedGeoLevel ?? null,
      fallback_rule_id: pricingSource === "fallback_slab" ? "platform_fallback" : null,
      vehicle_type_id: args.rideVehicleType ?? null,
    },
    breakdown_label: null,
  };
}
