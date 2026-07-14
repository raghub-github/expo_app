/**
 * Client-side surge resolution — mirrors backend stateSurge.service.ts.
 */

export type PreviewSurgeDefinition = {
  id: number;
  name: string;
  surgeType: "fixed" | "percentage";
  /** Configured amount — ₹ for fixed, % for percentage. */
  amount: number;
  priority: number;
  isEnabled: boolean;
  gmitraMaxOnly: boolean;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  vehicleType: string;
  manualActive: boolean;
};

export type PreviewSurgeTimeSlot = {
  id: number;
  surgeId: number;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  isEnabled: boolean;
};

export type AppliedPreviewSurge = {
  surgeId: number;
  name: string;
  surgeType: "fixed" | "percentage";
  configAmount: number;
  amount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function isTimeInSlot(now: Date, slot: PreviewSurgeTimeSlot): boolean {
  if (!slot.isEnabled) return false;
  if (!slot.daysOfWeek.includes(now.getDay())) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  if (start === end) return false;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

function pricingVehicleMatchesScope(
  pricingVehicle: string | null | undefined,
  scope: string
): boolean {
  const vt = pricingVehicle ?? "2_wheeler";
  if (scope === "all") return true;
  return vt === scope;
}

export function resolvePreviewSurges(args: {
  definitions: PreviewSurgeDefinition[];
  timeSlots: PreviewSurgeTimeSlot[];
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
  maxTotalSurgeAmount: number | null;
  baseFareForPct: number;
  now?: Date;
  forceActiveSurgeIds?: number[];
  /** Calculator mode: a surge is only ever applied when explicitly present in forceActiveSurgeIds — no time-window or always-on auto-detection. */
  onlyForceActive?: boolean;
}): {
  appliedSurges: AppliedPreviewSurge[];
  rawSurgeTotal: number;
  surgeTotal: number;
  surgeCapped: boolean;
} {
  const now = args.now ?? new Date();
  const forceIds = args.forceActiveSurgeIds ? new Set(args.forceActiveSurgeIds) : undefined;

  if (args.surgeWaitMaxOnly && !args.riderHasGmitraMax) {
    return { appliedSurges: [], rawSurgeTotal: 0, surgeTotal: 0, surgeCapped: false };
  }

  const slotsBySurge = new Map<number, PreviewSurgeTimeSlot[]>();
  for (const slot of args.timeSlots) {
    const list = slotsBySurge.get(slot.surgeId) ?? [];
    list.push(slot);
    slotsBySurge.set(slot.surgeId, list);
  }

  const applied: AppliedPreviewSurge[] = [];
  const sorted = [...args.definitions].sort((a, b) => b.priority - a.priority || a.id - b.id);

  for (const def of sorted) {
    if (!def.isEnabled) continue;
    if (args.service === "food" && !def.appliesFood) continue;
    if (args.service === "parcel" && !def.appliesParcel) continue;
    if (args.service === "ride" && !def.appliesRide) continue;

    if (args.service === "ride") {
      if (!pricingVehicleMatchesScope(args.vehicleType, def.vehicleType)) continue;
    } else if (def.vehicleType !== "all" && def.vehicleType !== "2_wheeler") {
      continue;
    }

    if (def.gmitraMaxOnly && !args.riderHasGmitraMax) continue;

    const slots = slotsBySurge.get(def.id) ?? [];
    let active = forceIds?.has(def.id) === true;
    if (!active && !args.onlyForceActive) {
      if (slots.length > 0) {
        active = slots.some((s) => isTimeInSlot(now, s));
      } else {
        const nameLower = def.name.toLowerCase();
        const isRainOrFestival =
          nameLower.includes("rain") || nameLower.includes("festival");
        active = isRainOrFestival ? def.manualActive : true;
      }
    }
    if (!active) continue;

    const appliedAmount =
      def.surgeType === "percentage"
        ? round2(Math.max(0, args.baseFareForPct) * (def.amount / 100))
        : round2(Math.max(0, def.amount));

    if (appliedAmount <= 0) continue;

    applied.push({
      surgeId: def.id,
      name: def.name,
      surgeType: def.surgeType,
      configAmount: def.amount,
      amount: appliedAmount,
    });
  }

  const rawSurgeTotal = round2(applied.reduce((s, x) => s + x.amount, 0));
  let surgeTotal = rawSurgeTotal;
  let surgeCapped = false;
  const cap = args.maxTotalSurgeAmount;
  if (cap != null && cap >= 0 && surgeTotal > cap) {
    surgeTotal = round2(cap);
    surgeCapped = true;
  }

  return { appliedSurges: applied, rawSurgeTotal, surgeTotal, surgeCapped };
}
