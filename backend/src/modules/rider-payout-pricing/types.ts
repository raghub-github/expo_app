import type { AppliedRiderSurge } from "../rider-surge/types.js";

export type GeoHierarchyLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";

export type RiderPayoutServiceType = "food" | "parcel" | "ride";

export type RideVehiclePricingType =
  | "2_wheeler"
  | "3_wheeler"
  | "4_wheeler_non_ac"
  | "4_wheeler_ac";

export const RIDE_VEHICLE_TYPES: RideVehiclePricingType[] = [
  "2_wheeler",
  "3_wheeler",
  "4_wheeler_non_ac",
  "4_wheeler_ac",
];

export const RIDE_VEHICLE_LABELS: Record<RideVehiclePricingType, string> = {
  "2_wheeler": "2 Wheeler",
  "3_wheeler": "3 Wheeler",
  "4_wheeler_non_ac": "4 Wheeler Non AC",
  "4_wheeler_ac": "4 Wheeler AC",
};

export type RiderPickupSlabRow = {
  id: number;
  geoLevel: string;
  geoRefId: string;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  pickupPerKm: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
  isActive: boolean;
};

export type RiderDropSlabRow = {
  id: number;
  geoLevel: string;
  geoRefId: string;
  vehicleType?: RideVehiclePricingType | null;
  minKm: number;
  maxKm: number | null;
  dropPerKm: number;
  priority: number;
  isActive: boolean;
};

export type RideCustomerPricingRow = {
  id: number;
  geoLevel: string;
  geoRefId: string;
  vehicleType: RideVehiclePricingType;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority: number;
  isActive: boolean;
};

export type RiderPayoutLegSegment = {
  slabId: number;
  minKm: number;
  maxKm: number | null;
  segmentKm: number;
  perKmRate: number;
  segmentAmount: number;
};

export type RiderPayoutQuote = {
  pickupKm: number;
  dropKm: number;
  baseFareApplied: number;
  pickupSegments: RiderPayoutLegSegment[];
  dropSegments: RiderPayoutLegSegment[];
  pickupAmount: number;
  dropAmount: number;
  waitingMinutes: number;
  waitingStartAfter: number;
  waitingAmount: number;
  subtotalBeforeSurge: number;
  appliedSurges: AppliedRiderSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
  riderGmitraMaxApplied: boolean;
  minChargeApplied: number;
  finalAmount: number;
  pricingEngine: "rider_pickup_drop_v2" | "legacy_delivery_rate_slabs";
};
