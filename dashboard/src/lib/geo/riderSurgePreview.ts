/**
 * Client-side surge resolution (mirrors backend riderSurge.service.ts).
 */

export type PreviewSurgeDefinition = {
  id: number;
  name: string;
  kind: "peak_hour" | "rain" | "festival" | "custom";
  fixedAmount: number;
  priority: number;
  isEnabled: boolean;
  gmitraMaxOnly: boolean;
  appliesFood: boolean;
  appliesParcel: boolean;
  appliesRide: boolean;
  vehicle2Wheeler: boolean;
  vehicle3Wheeler: boolean;
  vehicle4WheelerAc: boolean;
  vehicle4WheelerNonAc: boolean;
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
  kind: PreviewSurgeDefinition["kind"];
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

export function resolvePreviewSurges(args: {
  definitions: PreviewSurgeDefinition[];
  timeSlots: PreviewSurgeTimeSlot[];
  service: "food" | "parcel" | "ride";
  vehicleType?: string | null;
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
  maxTotalSurgeAmount: number | null;
  now?: Date;
  forceActiveSurgeIds?: number[];
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
      const vt = args.vehicleType ?? "2_wheeler";
      if (vt === "2_wheeler" && !def.vehicle2Wheeler) continue;
      if (vt === "3_wheeler" && !def.vehicle3Wheeler) continue;
      if (vt === "4_wheeler_ac" && !def.vehicle4WheelerAc) continue;
      if (vt === "4_wheeler_non_ac" && !def.vehicle4WheelerNonAc) continue;
    } else if (!def.vehicle2Wheeler) continue;

    if (def.gmitraMaxOnly && !args.riderHasGmitraMax) continue;

    let active = forceIds?.has(def.id) === true;
    if (!active) {
      if (def.kind === "peak_hour") {
        active = (slotsBySurge.get(def.id) ?? []).some((s) => isTimeInSlot(now, s));
      } else if (def.kind === "rain" || def.kind === "festival") {
        active = def.manualActive;
      } else {
        active = true;
      }
    }
    if (!active) continue;

    const amount = round2(Math.max(0, def.fixedAmount));
    if (amount <= 0) continue;
    applied.push({ surgeId: def.id, name: def.name, kind: def.kind, amount });
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
