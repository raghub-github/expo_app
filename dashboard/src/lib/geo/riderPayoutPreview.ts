/**
 * Client-side rider payout preview with dynamic surge breakdown.
 */

import { resolvePreviewSurges, type AppliedPreviewSurge, type PreviewSurgeDefinition, type PreviewSurgeTimeSlot } from "./riderSurgePreview";

export type PreviewPickupSlab = {
  id: number;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  pickupPerKm: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
};

export type PreviewDropSlab = {
  id: number;
  minKm: number;
  maxKm: number | null;
  dropPerKm: number;
  priority: number;
};

export type RiderPayoutPreviewBreakdown = {
  baseFare: number;
  pickupAmount: number;
  dropAmount: number;
  waitingAmount: number;
  subtotalBeforeSurge: number;
  appliedSurges: AppliedPreviewSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  minChargeApplied: number;
  finalAmount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function legAmount(
  distanceKm: number,
  slabs: Array<{
    id: number;
    minKm: number;
    maxKm: number | null;
    priority: number;
    pickupPerKm?: number;
    dropPerKm?: number;
  }>,
  rateOf: (s: (typeof slabs)[0]) => number
) {
  const sorted = [...slabs].sort(
    (a, b) => a.minKm - b.minKm || (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) || b.priority - a.priority || a.id - b.id
  );
  const includedKm = Math.max(0, Number(sorted[0]?.maxKm ?? 0) || 0);
  let total = 0;
  for (const s of sorted) {
    const min = Math.max(s.minKm, includedKm);
    const max = s.maxKm ?? Infinity;
    const segKm = Math.max(0, Math.min(distanceKm, max) - min);
    if (segKm <= 0) continue;
    total += round2(segKm * Math.max(0, rateOf(s)));
    if (max >= distanceKm) break;
  }
  return round2(total);
}

export function previewRiderPayoutBreakdown(args: {
  pickupKm: number;
  dropKm: number;
  pickupSlabs: PreviewPickupSlab[];
  dropSlabs: PreviewDropSlab[];
  waitingMinutes?: number;
  riderHasGmitraMax?: boolean;
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  surgeDefinitions?: PreviewSurgeDefinition[];
  surgeTimeSlots?: PreviewSurgeTimeSlot[];
  surgeWaitMaxOnly?: boolean;
  maxTotalSurgeAmount?: number | null;
  forceActiveSurgeIds?: number[];
}): RiderPayoutPreviewBreakdown | null {
  if (args.pickupSlabs.length === 0 && args.dropSlabs.length === 0) return null;

  const sortedPickup = [...args.pickupSlabs].sort((a, b) => a.minKm - b.minKm);
  const first = sortedPickup[0];
  const base = Math.max(0, first?.minCharge ?? first?.baseFare ?? 0);
  const pickupAmt = legAmount(args.pickupKm, args.pickupSlabs, (s) => s.pickupPerKm ?? 0);
  const dropAmt = legAmount(args.dropKm, args.dropSlabs, (s) => s.dropPerKm ?? 0);

  const riderMax = args.riderHasGmitraMax === true;
  const surgeWaitMaxOnly = args.surgeWaitMaxOnly === true;
  const extrasAllowed = !surgeWaitMaxOnly || riderMax;

  const waitMin = Math.max(0, args.waitingMinutes ?? 0);
  const startAfter = Math.max(0, first?.waitingStartAfter ?? 0);
  const waitRate = extrasAllowed ? Math.max(0, first?.waitingChargePerMin ?? 0) : 0;
  const waitingAmt =
    waitMin > startAfter && waitRate > 0 ? round2((waitMin - startAfter) * waitRate) : 0;

  const subtotal = round2(base + pickupAmt + dropAmt + waitingAmt);

  const surgeResolution = resolvePreviewSurges({
    definitions: args.surgeDefinitions ?? [],
    timeSlots: args.surgeTimeSlots ?? [],
    service: args.service,
    vehicleType: args.vehicleType,
    riderHasGmitraMax: riderMax,
    surgeWaitMaxOnly,
    maxTotalSurgeAmount: args.maxTotalSurgeAmount ?? null,
    forceActiveSurgeIds: args.forceActiveSurgeIds,
  });

  const appliedSurges = extrasAllowed ? surgeResolution.appliedSurges : [];
  const rawSurgeTotal = extrasAllowed ? surgeResolution.rawSurgeTotal : 0;
  const surgeTotal = extrasAllowed ? surgeResolution.surgeTotal : 0;

  let final = round2(subtotal + surgeTotal);
  let minChargeApplied = 0;
  const floor = first?.minCharge != null ? Math.max(0, first.minCharge) : null;
  if (floor != null && final < floor) {
    minChargeApplied = round2(floor - final);
    final = floor;
  }

  return {
    baseFare: round2(base),
    pickupAmount: pickupAmt,
    dropAmount: dropAmt,
    waitingAmount: waitingAmt,
    subtotalBeforeSurge: subtotal,
    appliedSurges,
    rawSurgeTotal,
    surgeTotal,
    surgeCapped: surgeResolution.surgeCapped,
    minChargeApplied,
    finalAmount: final,
  };
}

export function previewRiderPayout(args: Parameters<typeof previewRiderPayoutBreakdown>[0]): number {
  const breakdown = previewRiderPayoutBreakdown(args);
  return breakdown?.finalAmount ?? 0;
}
