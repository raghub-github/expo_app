import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import { loadEffectiveDeliveryRateSlabs } from "../delivery-slab-pricing/deliverySlabPricing.repository.js";
import type { DeliveryServiceType } from "../delivery-slab-pricing/types.js";
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
import { calculateRiderPickupDropPayout } from "./riderPayoutPricing.service.js";
import {
  hasRiderPickupDropSlabsConfigured,
  loadEffectiveRiderDropSlabs,
  loadEffectiveRiderPickupSlabs,
  riderHasActiveGmitraMax,
} from "./riderPayoutPricing.repository.js";
import type {
  GeoHierarchyLevel,
  RideVehiclePricingType,
  RiderPayoutQuote,
  RiderPayoutServiceType,
} from "./types.js";

function serviceToDeliveryType(service: RiderPayoutServiceType): DeliveryServiceType {
  return service === "ride" ? "person_ride" : service;
}

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

export async function resolveRiderPayoutQuote(args: {
  db?: PostgresJsDatabase<Record<string, unknown>>;
  level: GeoHierarchyLevel;
  refId: string;
  service: RiderPayoutServiceType;
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
  const hasV2 = await hasRiderPickupDropSlabsConfigured({
    level: args.level,
    refId: args.refId,
    service: args.service,
    vehicleType: args.vehicleType,
  });

  let riderMax = args.riderHasGmitraMax;
  if (riderMax === undefined && args.riderId != null && args.riderId > 0) {
    riderMax = await riderHasActiveGmitraMax(args.riderId);
  }

  if (hasV2) {
    const [pickupRes, dropRes] = await Promise.all([
      loadEffectiveRiderPickupSlabs({
        level: args.level,
        refId: args.refId,
        service: args.service,
        vehicleType: args.vehicleType,
      }),
      loadEffectiveRiderDropSlabs({
        level: args.level,
        refId: args.refId,
        service: args.service,
        vehicleType: args.vehicleType,
      }),
    ]);

    if (pickupRes.slabs.length === 0 && dropRes.slabs.length === 0) {
      return { ok: false, code: "EMPTY", message: "No rider pickup/drop slabs configured" };
    }

    const globalSettings = await loadSurgeSettings();
    const riderIsMax = riderMax === true;

    const preSurge = calculateRiderPickupDropPayout({
      pickupKm: args.pickupKm,
      dropKm: args.dropKm,
      pickupSlabs: pickupRes.slabs,
      dropSlabs: dropRes.slabs,
      waitingMinutes: 0,
      riderHasGmitraMax: riderIsMax,
      surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
      appliedSurges: [],
      rawSurgeTotal: 0,
      surgeTotal: 0,
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

    return calculateRiderPickupDropPayout({
      pickupKm: args.pickupKm,
      dropKm: args.dropKm,
      pickupSlabs: pickupRes.slabs,
      dropSlabs: dropRes.slabs,
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

  if (!args.db) {
    return { ok: false, code: "NO_LEGACY_DB", message: "Legacy payout requires db connection" };
  }

  if (args.service === "ride") {
    return {
      ok: false,
      code: "RIDER_SLABS_REQUIRED",
      message: "Ride payout requires rider pickup/drop slabs — customer geo slabs are not used",
    };
  }

  const legacyDistance = Math.max(0, args.pickupKm) + Math.max(0, args.dropKm);
  const legacySlabs = await loadEffectiveDeliveryRateSlabs(args.db, {
    geoLevel: args.level,
    geoRefId: args.refId,
    serviceType: serviceToDeliveryType(args.service),
    actorType: "rider",
  });

  if (legacySlabs.length === 0) {
    return { ok: false, code: "EMPTY", message: "No rider slabs configured" };
  }

  const globalSettings = await loadSurgeSettings();
  const riderIsMax = riderMax === true;
  const legacyWaitingMinutes = effectiveWaitingMinutes({
    waitingMinutes: args.waitingMinutes,
    surgeWaitMaxOnly: globalSettings.surgeWaitMaxOnly,
    riderHasGmitraMax: riderIsMax,
    activeSurgesRequireMaxOnly: false,
  });

  const legacy = calculateProgressiveSlabAmount({
    distanceKm: legacyDistance,
    slabs: legacySlabs,
    waitingMinutes: legacyWaitingMinutes,
    applyRiderExtras: true,
  });

  if (!legacy.ok) return legacy;

  const legacyWaiting = legacy.quote.waitingAmount ?? 0;
  const legacySubtotal =
    legacy.quote.baseFareApplied +
    (legacy.quote.preMinChargeTotal - legacy.quote.baseFareApplied - (legacy.quote.waitingAmount ?? 0)) +
    legacyWaiting;

  const surgeResolution = await resolvePayoutSurges({
    service: args.service,
    level: args.level,
    refId: args.refId,
    vehicleType: args.vehicleType,
    riderHasGmitraMax: riderIsMax,
    subtotalBeforeSurge: round2(legacySubtotal),
    now: args.now,
    forceActiveSurgeIds: args.forceActiveSurgeIds,
  });

  const legacyWaitingFinal = effectiveWaitingMinutes({
    waitingMinutes: args.waitingMinutes,
    surgeWaitMaxOnly: surgeResolution.surgeWaitMaxOnly,
    riderHasGmitraMax: riderIsMax,
    activeSurgesRequireMaxOnly: surgeResolution.activeSurgesRequireMaxOnly,
  });
  const legacyWaitingAmount =
    legacyWaitingFinal > 0 ? legacyWaiting : 0;
  const legacySubtotalFinal =
    legacy.quote.baseFareApplied +
    (legacy.quote.preMinChargeTotal - legacy.quote.baseFareApplied - (legacy.quote.waitingAmount ?? 0)) +
    legacyWaitingAmount;

  let finalAmount = round2(legacySubtotalFinal + surgeResolution.surgeTotal);
  const minApplied = legacy.quote.minChargeApplied;
  if (finalAmount < legacy.quote.finalAmount && minApplied > 0) {
    finalAmount = legacy.quote.finalAmount;
  }

  return {
    ok: true,
    quote: {
      pickupKm: args.pickupKm,
      dropKm: args.dropKm,
      baseFareApplied: legacy.quote.baseFareApplied,
      pickupSegments: [],
      dropSegments: legacy.quote.segments.map((s) => ({
        slabId: s.slabId,
        minKm: s.minKm,
        maxKm: s.maxKm,
        segmentKm: s.segmentKm,
        perKmRate: s.perKmRate,
        segmentAmount: s.segmentAmount,
      })),
      pickupAmount: 0,
      dropAmount: legacy.quote.preMinChargeTotal - legacy.quote.baseFareApplied - (legacy.quote.waitingAmount ?? 0),
      waitingMinutes: legacy.quote.waitingMinutes ?? 0,
      waitingStartAfter: 0,
      waitingAmount: legacyWaitingAmount,
      subtotalBeforeSurge: round2(legacySubtotalFinal),
      appliedSurges: surgeResolution.appliedSurges,
      rawSurgeTotal: surgeResolution.rawSurgeTotal,
      surgeTotal: surgeResolution.surgeTotal,
      surgeCapped: surgeResolution.surgeCapped,
      maxTotalSurgeAmount: surgeResolution.maxTotalSurgeAmount,
      surgeWaitMaxOnly: surgeResolution.surgeWaitMaxOnly,
      riderGmitraMaxApplied: riderMax === true,
      minChargeApplied: minApplied,
      finalAmount,
      pricingEngine: "legacy_delivery_rate_slabs",
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
