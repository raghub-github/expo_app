/**
 * Dashboard slab preview — re-exports shared engine and adds admin surge simulation.
 */

import {
  calcCustomerSlabPrice,
  calcPickupPayout,
  calcDropPayout,
  calcRiderPayoutBreakdown,
  calcGmitraMaxAdjustment,
  calcWaitingCharge,
  calcCumulativeDistanceCharge,
  getActiveSortedSlabs,
  getFirstZeroKmSlab,
  normalizeKm,
  normalizeMoney,
  normalizeNullableMaxKm,
  toSafeNumber,
  type CustomerSlab,
  type PickupSlab,
  type DropSlab,
  type CustomerSlabPrice,
  type PickupPayoutBreakdown,
  type DropPayoutBreakdown,
  type CumulativeSegment,
  type RiderPayoutBreakdown,
  type AppliedSurgeLine,
} from "@gatimitra/slab-pricing";
import {
  resolvePreviewSurges,
  type AppliedPreviewSurge,
  type PreviewSurgeDefinition,
  type PreviewSurgeTimeSlot,
} from "../geo/riderSurgePreview";

export type {
  CustomerSlab,
  PickupSlab,
  DropSlab,
  CustomerSlabPrice,
  PickupPayoutBreakdown,
  DropPayoutBreakdown,
  CumulativeSegment,
  AppliedPreviewSurge,
  PreviewSurgeDefinition,
  PreviewSurgeTimeSlot,
};

export type CustomerPreviewBreakdown = CustomerSlabPrice & { distanceKm: number };

export type RiderPreviewBreakdown = RiderPayoutBreakdown;

export type RidePreviewBreakdown =
  | ({ mode: "customer" } & CustomerPreviewBreakdown)
  | ({ mode: "rider" } & RiderPreviewBreakdown);

export {
  calcCustomerSlabPrice,
  calcPickupPayout,
  calcDropPayout,
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
  definitions: PreviewSurgeDefinition[];
  timeSlots: PreviewSurgeTimeSlot[];
  forceActiveSurgeIds?: number[];
  now?: Date;
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
    forceActiveSurgeIds: input.forceActiveSurgeIds,
    now: input.now,
  });
}

export function calcRiderPreviewBreakdown(input: {
  pickupKm: unknown;
  dropKm: unknown;
  pickupSlabs: PickupSlab[];
  dropSlabs: DropSlab[];
  waitingMinutes?: unknown;
  riderHasGmitraMax?: boolean;
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  surgeDefinitions?: PreviewSurgeDefinition[];
  surgeTimeSlots?: PreviewSurgeTimeSlot[];
  surgeWaitMaxOnly?: boolean;
  maxTotalSurgeAmount?: number | null;
  forceActiveSurgeIds?: number[];
}): RiderPreviewBreakdown | null {
  if (input.pickupSlabs.length === 0 && input.dropSlabs.length === 0) return null;

  const surge = calcSurgeAmount({
    service: input.service,
    vehicleType: input.vehicleType,
    riderHasGmitraMax: input.riderHasGmitraMax === true,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly === true,
    maxTotalSurgeAmount: input.maxTotalSurgeAmount ?? null,
    definitions: input.surgeDefinitions ?? [],
    timeSlots: input.surgeTimeSlots ?? [],
    forceActiveSurgeIds: input.forceActiveSurgeIds,
  });

  return calcRiderPayoutBreakdown({
    pickupKm: input.pickupKm,
    dropKm: input.dropKm,
    pickupSlabs: input.pickupSlabs,
    dropSlabs: input.dropSlabs,
    waitingMinutes: input.waitingMinutes,
    riderHasGmitraMax: input.riderHasGmitraMax,
    surgeWaitMaxOnly: input.surgeWaitMaxOnly,
    appliedSurges: surge.appliedSurges as AppliedSurgeLine[],
    rawSurgeTotal: surge.rawSurgeTotal,
    surgeTotal: surge.surgeTotal,
    surgeCapped: surge.surgeCapped,
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

export function calcRidePreviewBreakdown(
  input:
    | { mode: "customer"; tripKm: unknown; slabs: CustomerSlab[] }
    | {
        mode: "rider";
        pickupKm: unknown;
        dropKm: unknown;
        pickupSlabs: PickupSlab[];
        dropSlabs: DropSlab[];
        waitingMinutes?: unknown;
        riderHasGmitraMax?: boolean;
        vehicleType?: string | null;
        surgeDefinitions?: PreviewSurgeDefinition[];
        surgeTimeSlots?: PreviewSurgeTimeSlot[];
        surgeWaitMaxOnly?: boolean;
        maxTotalSurgeAmount?: number | null;
        forceActiveSurgeIds?: number[];
      }
): RidePreviewBreakdown | null {
  if (input.mode === "customer") {
    const customer = calcCustomerPreviewBreakdown({ distanceKm: input.tripKm, slabs: input.slabs });
    return customer ? { mode: "customer" as const, ...customer } : null;
  }

  const rider = calcRiderPreviewBreakdown({
    ...input,
    service: "ride",
  });

  return rider ? { mode: "rider" as const, ...rider } : null;
}
