/**
 * Dashboard slab preview — re-exports shared engine and adds admin surge simulation.
 */

import {
  calcCustomerSlabPrice,
  calcGmitraMaxAdjustment,
  calcWaitingCharge,
  calcCumulativeDistanceCharge,
  calcServicePayoutRuleSplit,
  getActiveSortedSlabs,
  getFirstZeroKmSlab,
  normalizeKm,
  normalizeMoney,
  normalizeNullableMaxKm,
  toSafeNumber,
  type CustomerSlab,
  type CustomerSlabPrice,
  type CumulativeSegment,
  type ServicePayoutRule,
  type ServicePayoutRuleSplit,
} from "@gatimitra/slab-pricing";
import {
  resolvePreviewSurges,
  type AppliedPreviewSurge,
  type PreviewSurgeDefinition,
  type PreviewSurgeTimeSlot,
} from "../geo/riderSurgePreview";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type {
  CustomerSlab,
  CustomerSlabPrice,
  CumulativeSegment,
  AppliedPreviewSurge,
  PreviewSurgeDefinition,
  PreviewSurgeTimeSlot,
};

export type CustomerPreviewBreakdown = CustomerSlabPrice & { distanceKm: number };

export type RidePreviewBreakdown = { mode: "customer" } & CustomerPreviewBreakdown;

export {
  calcCustomerSlabPrice,
  calcWaitingCharge,
  calcCumulativeDistanceCharge,
  calcGmitraMaxAdjustment,
  getActiveSortedSlabs,
  getFirstZeroKmSlab,
  normalizeKm,
  normalizeMoney,
  normalizeNullableMaxKm,
  toSafeNumber,
};

export function calcSurgeAmount(input: {
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
  maxTotalSurgeAmount: number | null;
  baseFareForPct: number;
  definitions: PreviewSurgeDefinition[];
  timeSlots: PreviewSurgeTimeSlot[];
  forceActiveSurgeIds?: number[];
  now?: Date;
  onlyForceActive?: boolean;
}): {
  appliedSurges: AppliedPreviewSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
} {
  const { extrasAllowed } = calcGmitraMaxAdjustment({
    riderHasGmitraMax: input.riderHasGmitraMax,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly,
  });

  if (!extrasAllowed) {
    return { appliedSurges: [], rawSurgeTotal: 0, surgeTotal: 0, surgeCapped: false };
  }

  return resolvePreviewSurges({
    definitions: input.definitions,
    timeSlots: input.timeSlots,
    service: input.service,
    vehicleType: input.vehicleType,
    riderHasGmitraMax: input.riderHasGmitraMax,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly,
    maxTotalSurgeAmount: input.maxTotalSurgeAmount,
    baseFareForPct: input.baseFareForPct,
    forceActiveSurgeIds: input.forceActiveSurgeIds,
    now: input.now,
    onlyForceActive: input.onlyForceActive,
  });
}

export function calcCustomerPreviewBreakdown(input: {
  distanceKm: unknown;
  slabs: CustomerSlab[];
}): CustomerPreviewBreakdown | null {
  const quote = calcCustomerSlabPrice(input);
  if (!quote) return null;
  return { distanceKm: normalizeKm(input.distanceKm), ...quote };
}

export type ServicePayoutRulePreviewInput = ServicePayoutRule & {
  waitingChargePerMin: number | null;
  waitingFreeMinutes: number;
};

export type ServicePayoutRulePreviewBreakdown = ServicePayoutRuleSplit & {
  waitingMinutes: number;
  waitingAmount: number;
  appliedSurges: AppliedPreviewSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  finalAmount: number;
};

/** Rider Fare Engine v3.0 admin preview: customer fare -> rider % split -> waiting -> surge -> platform revenue. */
export function calcServicePayoutRulePreviewBreakdown(input: {
  customerFare: unknown;
  pickupKm: unknown;
  dropKm: unknown;
  rule: ServicePayoutRulePreviewInput;
  waitingMinutes?: unknown;
  riderHasGmitraMax?: boolean;
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  surgeDefinitions?: PreviewSurgeDefinition[];
  surgeTimeSlots?: PreviewSurgeTimeSlot[];
  surgeWaitMaxOnly?: boolean;
  maxTotalSurgeAmount?: number | null;
  forceActiveSurgeIds?: number[];
}): ServicePayoutRulePreviewBreakdown | null {
  const customerFare = normalizeMoney(input.customerFare);
  if (customerFare <= 0) return null;

  const split = calcServicePayoutRuleSplit({
    customerFare,
    pickupKm: normalizeKm(input.pickupKm),
    dropKm: normalizeKm(input.dropKm),
    rule: input.rule,
  });

  const { extrasAllowed } = calcGmitraMaxAdjustment({
    riderHasGmitraMax: input.riderHasGmitraMax === true,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly === true,
  });

  const waitingMinutes = extrasAllowed ? Math.max(0, toSafeNumber(input.waitingMinutes, 0)) : 0;
  const waitingAmount =
    waitingMinutes > 0 && input.rule.waitingChargePerMin
      ? calcWaitingCharge(waitingMinutes, input.rule.waitingFreeMinutes, input.rule.waitingChargePerMin)
      : 0;

  const surge = calcSurgeAmount({
    service: input.service,
    vehicleType: input.vehicleType,
    riderHasGmitraMax: input.riderHasGmitraMax === true,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly === true,
    maxTotalSurgeAmount: input.maxTotalSurgeAmount ?? null,
    baseFareForPct: round2(split.pickupAmount + split.dropAmount),
    definitions: input.surgeDefinitions ?? [],
    timeSlots: input.surgeTimeSlots ?? [],
    forceActiveSurgeIds: input.forceActiveSurgeIds,
    // Preview/calculator: a surge only applies when explicitly selected below, never from
    // time-window or always-on auto-detection (that logic is for live dispatch quotes).
    onlyForceActive: true,
  });

  const pickupAmount = round2(split.pickupAmount + waitingAmount);
  const finalAmount = round2(pickupAmount + split.dropAmount + surge.surgeTotal);

  return {
    ...split,
    pickupAmount,
    waitingMinutes,
    waitingAmount,
    appliedSurges: surge.appliedSurges,
    rawSurgeTotal: surge.rawSurgeTotal,
    surgeTotal: surge.surgeTotal,
    surgeCapped: surge.surgeCapped,
    finalAmount,
  };
}

export function calcRidePreviewBreakdown(input: {
  mode: "customer";
  tripKm: unknown;
  slabs: CustomerSlab[];
}): RidePreviewBreakdown | null {
  const customer = calcCustomerPreviewBreakdown({ distanceKm: input.tripKm, slabs: input.slabs });
  return customer ? { mode: "customer" as const, ...customer } : null;
}
