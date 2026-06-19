import type {
  RideVehiclePricingType,
  RiderPayoutServiceType,
} from "../rider-payout-pricing/types.js";
import type {
  AppliedRiderSurge,
  RiderSurgeKind,
  RiderSurgeResolution,
  SurgeDefinitionRow,
  SurgeTimeSlotRow,
} from "./types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function isTimeInSlot(now: Date, slot: SurgeTimeSlotRow): boolean {
  if (!slot.isEnabled) return false;
  const day = now.getDay();
  if (!slot.daysOfWeek.includes(day)) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  if (start === end) return false;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

function matchesService(def: SurgeDefinitionRow, service: RiderPayoutServiceType): boolean {
  if (service === "food") return def.appliesFood;
  if (service === "parcel") return def.appliesParcel;
  return def.appliesRide;
}

function matchesVehicle(
  def: SurgeDefinitionRow,
  service: RiderPayoutServiceType,
  vehicleType: RideVehiclePricingType | null | undefined
): boolean {
  if (service !== "ride") return def.vehicle2Wheeler;
  const vt = vehicleType ?? "2_wheeler";
  if (vt === "2_wheeler") return def.vehicle2Wheeler;
  if (vt === "3_wheeler") return def.vehicle3Wheeler;
  if (vt === "4_wheeler_ac") return def.vehicle4WheelerAc;
  return def.vehicle4WheelerNonAc;
}

function isDefinitionRuntimeActive(args: {
  def: SurgeDefinitionRow;
  kind: RiderSurgeKind;
  timeSlots: SurgeTimeSlotRow[];
  now: Date;
  forceActiveIds?: Set<number>;
}): boolean {
  if (!args.def.isEnabled) return false;
  if (args.forceActiveIds?.has(args.def.id)) return true;

  if (args.kind === "peak_hour") {
    return args.timeSlots.some((slot) => isTimeInSlot(args.now, slot));
  }
  if (args.kind === "rain" || args.kind === "festival") {
    return args.def.manualActive;
  }
  return true;
}

export function resolveRiderSurges(args: {
  definitions: SurgeDefinitionRow[];
  timeSlotsBySurgeId: Map<number, SurgeTimeSlotRow[]>;
  service: RiderPayoutServiceType;
  vehicleType?: RideVehiclePricingType | null;
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
  maxTotalSurgeAmount: number | null;
  now?: Date;
  /** Preview: treat these surge IDs as active regardless of schedule/manual state */
  forceActiveSurgeIds?: number[];
}): RiderSurgeResolution {
  const now = args.now ?? new Date();
  const forceIds = args.forceActiveSurgeIds ? new Set(args.forceActiveSurgeIds) : undefined;
  const extrasGloballyBlocked = args.surgeWaitMaxOnly && !args.riderHasGmitraMax;

  if (extrasGloballyBlocked) {
    return {
      appliedSurges: [],
      rawSurgeTotal: 0,
      surgeTotal: 0,
      surgeCapped: false,
      maxTotalSurgeAmount: args.maxTotalSurgeAmount,
    };
  }

  const applied: AppliedRiderSurge[] = [];

  const sorted = [...args.definitions].sort(
    (a, b) => b.priority - a.priority || a.id - b.id
  );

  for (const def of sorted) {
    if (!matchesService(def, args.service)) continue;
    if (!matchesVehicle(def, args.service, args.vehicleType)) continue;
    if (def.gmitraMaxOnly && !args.riderHasGmitraMax) continue;

    const slots = args.timeSlotsBySurgeId.get(def.id) ?? [];
    if (
      !isDefinitionRuntimeActive({
        def,
        kind: def.kind,
        timeSlots: slots,
        now,
        forceActiveIds: forceIds,
      })
    ) {
      continue;
    }

    const amount = round2(Math.max(0, def.fixedAmount));
    if (amount <= 0) continue;
    applied.push({
      surgeId: def.id,
      name: def.name,
      kind: def.kind,
      amount,
    });
  }

  const rawSurgeTotal = round2(applied.reduce((sum, s) => sum + s.amount, 0));
  let surgeTotal = rawSurgeTotal;
  let surgeCapped = false;
  const cap = args.maxTotalSurgeAmount;
  if (cap != null && cap >= 0 && surgeTotal > cap) {
    surgeTotal = round2(cap);
    surgeCapped = true;
  }

  return {
    appliedSurges: applied,
    rawSurgeTotal,
    surgeTotal,
    surgeCapped,
    maxTotalSurgeAmount: cap,
  };
}
