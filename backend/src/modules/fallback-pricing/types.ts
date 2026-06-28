import type { DeliveryActorType, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";

export type FallbackPricingSide = DeliveryActorType;

export type FallbackSlabRow = {
  id: number;
  serviceType: DeliveryServiceType;
  pricingSide: FallbackPricingSide;
  vehicleType: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FallbackCustomerQuote = {
  fee: number;
  engine: "fallback_slab" | "fallback_per_km";
  baseFare: number;
  distanceFare: number;
  waitingAmount: number;
  slabQuote: {
    distanceKm: number;
    baseFareApplied: number;
    finalAmount: number;
    segments: Array<{
      slabId: number;
      minKm: number;
      maxKm: number | null;
      segmentKm: number;
      perKmRate: number;
      segmentAmount: number;
    }>;
  } | null;
};
