import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import { pricingVehicleMatchesScope } from "./catalogVehicleMap.js";
import type { StateSurgeConfigRow, StateSurgeTimeSlotRow } from "./rideStateConfig.repository.js";

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function isTimeInSlot(now: Date, slot: StateSurgeTimeSlotRow): boolean {
  if (!slot.isEnabled) return false;
  if (!slot.daysOfWeek.includes(now.getDay())) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  if (start === end) return false;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type AppliedStateSurge = {
  surgeId: number;
  name: string;
  surgeType: "fixed" | "percentage";
  amount: number;
  appliedAmount: number;
};

export function resolveStateSurges(args: {
  configs: StateSurgeConfigRow[];
  timeSlotsBySurgeId: Map<number, StateSurgeTimeSlotRow[]>;
  service?: "food" | "parcel" | "ride" | "person_ride";
  pricingVehicle: RideVehiclePricingType | null;
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
  baseFareForPct: number;
  maxTotalSurgeAmount: number | null;
  now?: Date;
  forceActiveSurgeIds?: number[];
}): {
  appliedSurges: AppliedStateSurge[];
  surgeTotal: number;
  surgeCapped: boolean;
  /** Active surges exist but rider is ineligible for all of them (e.g. max-only). */
  activeSurgesRequireMaxOnly: boolean;
} {
  const now = args.now ?? new Date();
  const forceIds = args.forceActiveSurgeIds ? new Set(args.forceActiveSurgeIds) : undefined;
  const extrasBlocked = args.surgeWaitMaxOnly && !args.riderHasGmitraMax;

  if (extrasBlocked) {
    return {
      appliedSurges: [],
      surgeTotal: 0,
      surgeCapped: false,
      activeSurgesRequireMaxOnly: true,
    };
  }

  const applied: AppliedStateSurge[] = [];
  const sorted = [...args.configs].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const serviceKey =
    args.service === "person_ride" ? "ride" : args.service ?? null;

  let activeSurgeCount = 0;
  let riderEligibleActiveSurgeCount = 0;

  for (const cfg of sorted) {
    if (!cfg.enabled) continue;
    if (serviceKey === "food" && !cfg.appliesFood) continue;
    if (serviceKey === "parcel" && !cfg.appliesParcel) continue;
    if (serviceKey === "ride" && !cfg.appliesRide) continue;
    if (
      args.pricingVehicle &&
      !pricingVehicleMatchesScope(args.pricingVehicle, cfg.vehicleType)
    ) {
      continue;
    }

    const slots = args.timeSlotsBySurgeId.get(cfg.id) ?? [];
    let active = forceIds?.has(cfg.id) === true;
    if (!active) {
      if (slots.length > 0) {
        active = slots.some((s) => isTimeInSlot(now, s));
      } else {
        const nameLower = cfg.name.toLowerCase();
        const isRainOrFestival =
          nameLower.includes("rain") || nameLower.includes("festival");
        active = isRainOrFestival ? cfg.manualActive : true;
      }
    }
    if (!active) continue;

    activeSurgeCount += 1;
    if (!cfg.maxRidersOnly || args.riderHasGmitraMax) {
      riderEligibleActiveSurgeCount += 1;
    }

    if (cfg.maxRidersOnly && !args.riderHasGmitraMax) continue;

    const appliedAmount =
      cfg.surgeType === "percentage"
        ? round2(Math.max(0, args.baseFareForPct) * (cfg.amount / 100))
        : round2(Math.max(0, cfg.amount));

    if (appliedAmount <= 0) continue;
    applied.push({
      surgeId: cfg.id,
      name: cfg.name,
      surgeType: cfg.surgeType,
      amount: cfg.amount,
      appliedAmount,
    });
  }

  let surgeTotal = round2(applied.reduce((s, x) => s + x.appliedAmount, 0));
  let surgeCapped = false;
  const cap = args.maxTotalSurgeAmount;
  if (cap != null && cap >= 0 && surgeTotal > cap) {
    surgeTotal = round2(cap);
    surgeCapped = true;
  }

  return {
    appliedSurges: applied,
    surgeTotal,
    surgeCapped,
    activeSurgesRequireMaxOnly:
      activeSurgeCount > 0 && riderEligibleActiveSurgeCount === 0,
  };
}
