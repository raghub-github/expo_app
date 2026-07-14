import {
  loadSurgeSettings,
} from "../rider-surge/index.js";
import {
  loadStateSurgeConfigs,
  loadStateSurgeSettings,
  loadStateSurgeTimeSlots,
  resolveStateIdFromGeoChain,
} from "../ride-state-config/rideStateConfig.repository.js";
import { resolveStateSurges } from "../ride-state-config/stateSurge.service.js";
import type { AppliedRiderSurge } from "../rider-surge/types.js";
import { calculatePercentageRiderPayout } from "./riderPayoutPricing.service.js";
import {
  loadEffectiveServicePayoutRule,
  riderHasActiveGmitraMax,
} from "./riderPayoutPricing.repository.js";
import type {
  GeoHierarchyLevel,
  RideVehiclePricingType,
  RiderPayoutQuote,
  RiderPayoutServiceType,
} from "./types.js";

function groupStateSlots(slots: Awaited<ReturnType<typeof loadStateSurgeTimeSlots>>) {
  const map = new Map<number, typeof slots>();
  for (const s of slots) {
    const list = map.get(s.stateSurgeId) ?? [];
    list.push(s);
    map.set(s.stateSurgeId, list);
  }
  return map;
}

async function resolvePayoutSurges(args: {
  service: RiderPayoutServiceType;
  level: GeoHierarchyLevel;
  refId: string;
  vehicleType?: RideVehiclePricingType | null;
  riderHasGmitraMax: boolean;
  subtotalBeforeSurge: number;
  now?: Date;
  forceActiveSurgeIds?: number[];
}): Promise<{
  appliedSurges: AppliedRiderSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
  maxTotalSurgeAmount: number | null;
  surgeWaitMaxOnly: boolean;
  activeSurgesRequireMaxOnly: boolean;
}> {
  const globalSettings = await loadSurgeSettings();

  const stateId = await resolveStateIdFromGeoChain(args.level, args.refId);
  if (stateId) {
    const [configs, slots, stateSettings] = await Promise.all([
      loadStateSurgeConfigs(stateId),
      loadStateSurgeTimeSlots(),
      loadStateSurgeSettings(stateId),
    ]);
    const maxCap =
      stateSettings.maxTotalSurgeAmount ?? globalSettings.maxTotalSurgeAmount;
    const stateResolution = resolveStateSurges({
      configs,
      timeSlotsBySurgeId: groupStateSlots(slots),
      service: args.service,
      pricingVehicle: args.vehicleType ?? null,
      riderHasGmitraMax: args.riderHasGmitraMax,
      surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
      baseFareForPct: args.subtotalBeforeSurge,
      maxTotalSurgeAmount: maxCap,
      now: args.now,
      forceActiveSurgeIds: args.forceActiveSurgeIds,
    });

    const appliedSurges: AppliedRiderSurge[] = stateResolution.appliedSurges.map((s) => ({
      surgeId: s.surgeId,
      name: s.name,
      kind: "custom" as const,
      amount: s.appliedAmount,
    }));

    const rawSurgeTotal = stateResolution.appliedSurges.reduce((sum, s) => sum + s.appliedAmount, 0);

    return {
      appliedSurges,
      rawSurgeTotal: round2(rawSurgeTotal),
      surgeTotal: stateResolution.surgeTotal,
      surgeCapped: stateResolution.surgeCapped,
      maxTotalSurgeAmount: maxCap,
      surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
      activeSurgesRequireMaxOnly: stateResolution.activeSurgesRequireMaxOnly,
    };
  }

  return {
    appliedSurges: [],
    rawSurgeTotal: 0,
    surgeTotal: 0,
    surgeCapped: false,
    maxTotalSurgeAmount: globalSettings.maxTotalSurgeAmount,
    surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
    activeSurgesRequireMaxOnly: false,
  };
}

function effectiveWaitingMinutes(args: {
  waitingMinutes?: number;
  surgeWaitMaxOnly: boolean;
  riderHasGmitraMax: boolean;
  activeSurgesRequireMaxOnly: boolean;
}): number {
  const minutes = Math.max(0, args.waitingMinutes ?? 0);
  if (minutes <= 0) return 0;
  if (args.surgeWaitMaxOnly && !args.riderHasGmitraMax) return 0;
  if (!args.riderHasGmitraMax && args.activeSurgesRequireMaxOnly) return 0;
  return minutes;
}

/**
 * Rider Fare Engine v3.0: rider payout is derived from customerFare via the
 * effective service_payout_rules row for this geo/service (nearest-ancestor
 * inheritance). No slab lookup.
 */
export async function resolveRiderPayoutQuote(args: {
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
  customerFare: number;
  pickupKm: number;
  dropKm: number;
  waitingMinutes?: number;
  riderId?: number | null;
  riderHasGmitraMax?: boolean;
  vehicleType?: RideVehiclePricingType | null;
  /** Preview: force specific surge IDs active */
  forceActiveSurgeIds?: number[];
  now?: Date;
}): Promise<
  | { ok: true; quote: RiderPayoutQuote }
  | { ok: false; code: string; message: string }
> {
  const { applied, rule } = await loadEffectiveServicePayoutRule({
    level: args.level,
    refId: args.refId,
    service: args.service,
    now: args.now,
  });

  if (!applied || !rule) {
    return { ok: false, code: "EMPTY", message: "No rider payout rule configured" };
  }

  let riderMax = args.riderHasGmitraMax;
  if (riderMax === undefined && args.riderId != null && args.riderId > 0) {
    riderMax = await riderHasActiveGmitraMax(args.riderId);
  }
  const riderIsMax = riderMax === true;

  const globalSettings = await loadSurgeSettings();

  const preSurge = calculatePercentageRiderPayout({
    customerFare: args.customerFare,
    pickupKm: args.pickupKm,
    dropKm: args.dropKm,
    rule,
    waitingMinutes: 0,
    riderHasGmitraMax: riderIsMax,
    surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
  });
  if (!preSurge.ok) return preSurge;

  const surgeResolution = await resolvePayoutSurges({
    service: args.service,
    level: args.level,
    refId: args.refId,
    vehicleType: args.vehicleType,
    riderHasGmitraMax: riderIsMax,
    subtotalBeforeSurge: preSurge.quote.subtotalBeforeSurge,
    now: args.now,
    forceActiveSurgeIds: args.forceActiveSurgeIds,
  });

  const waitingMinutes = effectiveWaitingMinutes({
    waitingMinutes: args.waitingMinutes,
    surgeWaitMaxOnly: surgeResolution.surgeWaitMaxOnly,
    riderHasGmitraMax: riderIsMax,
    activeSurgesRequireMaxOnly: surgeResolution.activeSurgesRequireMaxOnly,
  });

  return calculatePercentageRiderPayout({
    customerFare: args.customerFare,
    pickupKm: args.pickupKm,
    dropKm: args.dropKm,
    rule,
    waitingMinutes,
    riderHasGmitraMax: riderIsMax,
    surgeWaitMaxOnly: surgeResolution.surgeWaitMaxOnly,
    appliedSurges: surgeResolution.appliedSurges,
    rawSurgeTotal: surgeResolution.rawSurgeTotal,
    surgeTotal: surgeResolution.surgeTotal,
    surgeCapped: surgeResolution.surgeCapped,
    maxTotalSurgeAmount: surgeResolution.maxTotalSurgeAmount,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
