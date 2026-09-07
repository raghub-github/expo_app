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

const IST_OFFSET_MIN = 330; // Asia/Kolkata, no DST

/** Minutes-since-midnight + day-of-week (0=Sun) for `now` in IST — matches the backend. */
function istClock(now: Date): { minutes: number; dow: number } {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  return { minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(), dow: ist.getUTCDay() };
}

function isTimeInSlot(now: Date, slot: PreviewSurgeTimeSlot): boolean {
  if (!slot.isEnabled) return false;
  // Evaluate in IST so the preview matches the backend regardless of the admin's browser tz.
  const { minutes: nowMin, dow } = istClock(now);
  if (!slot.daysOfWeek.includes(dow)) return false;
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

  const slotsBySurge = new Map<number, PreviewSurgeTimeSlot[]>();
  for (const slot of args.timeSlots) {
    const list = slotsBySurge.get(slot.surgeId) ?? [];
    list.push(slot);
    slotsBySurge.set(slot.surgeId, list);
  }

  // Highest-priority first so amount ties resolve to the higher-priority (then lower-id) surge.
  const sorted = [...args.definitions].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const eligible: { def: PreviewSurgeDefinition; amount: number }[] = [];
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

    // Eligibility is decided solely by the per-surge "GMitra Max riders only" checkbox — the
    // legacy global surge_wait_max_only switch no longer blocks surges (mirrors the backend).
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

    eligible.push({ def, amount: appliedAmount });
  }

  // ONE surge per order: only the single highest-amount eligible surge applies.
  let winner: { def: PreviewSurgeDefinition; amount: number } | null = null;
  for (const cand of eligible) {
    if (!winner || cand.amount > winner.amount) winner = cand;
  }

  const applied: AppliedPreviewSurge[] = [];
  let rawSurgeTotal = 0;
  let surgeTotal = 0;
  let surgeCapped = false;

  if (winner) {
    rawSurgeTotal = winner.amount;
    surgeTotal = winner.amount;
    const cap = args.maxTotalSurgeAmount;
    if (cap != null && cap >= 0 && surgeTotal > cap) {
      surgeTotal = round2(cap);
      surgeCapped = true;
    }
    applied.push({
      surgeId: winner.def.id,
      name: winner.def.name,
      surgeType: winner.def.surgeType,
      configAmount: winner.def.amount,
      amount: surgeTotal,
    });
  }

  return { appliedSurges: applied, rawSurgeTotal, surgeTotal, surgeCapped };
}
