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

/** Same shape as ride — parcel customer vehicle slabs. */
export type ParcelCustomerPricingRow = RideCustomerPricingRow;

/**
 * Rider Fare Engine v3.0: percentage-of-customer-fare payout rule, geo-inherited.
 * Intentionally minimal — no guardrails. Pickup/drop split is always pure
 * distance ratio (pickupKm / totalKm); nothing here can force a fixed split.
 */
export type ServicePayoutRuleRow = {
  id: number;
  serviceType: RiderPayoutServiceType;
  /** NULL = applies to all vehicles; overrides the all-vehicles row for the same node/service. */
  vehicleType: RideVehiclePricingType | null;
  geoLevel: string;
  geoRefId: string;
  riderPercentage: number;
  platformPercentage: number;
  waitingChargePerMin: number | null;
  waitingFreeMinutes: number;
  waitingMaxCharge: number | null;
  /** Duration cap (billable minutes). Null → engine applies the absolute safety ceiling. */
  waitingMaxMinutes: number | null;
  /** When waiting starts (food): fixed grace from arrival vs after the original KPT + grace. */
  waitingStartMode: "FIXED_GRACE" | "KPT_PLUS_GRACE";
  /** Extra grace (minutes) after the original KPT commitment (KPT_PLUS_GRACE). */
  waitingKptGraceMinutes: number | null;
  /** Bulk-order triggers (value ₹ / item count) → extra waiting grace. Null = not a trigger. */
  waitingBulkValueThreshold: number | null;
  waitingBulkItemThreshold: number | null;
  waitingBulkExtraGraceMinutes: number | null;
  waitingFundingMode: "CUSTOMER_100" | "COMPANY_100" | "MERCHANT_100" | "SHARED";
  waitingCustomerSharePct: number;
  waitingCompanySharePct: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type RiderPayoutQuote = {
  pickupKm: number;
  dropKm: number;
  customerFare: number;
  riderPercentage: number;
  platformPercentage: number;
  platformRevenue: number;
  ruleId: number;
  rulePriority: number;
  pickupRatio: number;
  dropRatio: number;
  pickupAmount: number;
  dropAmount: number;
  waitingMinutes: number;
  waitingAmount: number;
  subtotalBeforeSurge: number;
  appliedSurges: AppliedRiderSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
  riderGmitraMaxApplied: boolean;
  finalAmount: number;
  pricingEngine: "rider_percentage_v3";
};
