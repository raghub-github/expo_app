import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import { pricingVehicleMatchesScope } from "./catalogVehicleMap.js";
import type { StateSurgeConfigRow, StateSurgeTimeSlotRow } from "./rideStateConfig.repository.js";
import { istClock } from "../../lib/dynamic-pricing.js";

function parseTimeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

function isTimeInSlot(now: Date, slot: StateSurgeTimeSlotRow): boolean {
  if (!slot.isEnabled) return false;
  // Evaluate the slot window in IST (Asia/Kolkata) so the day-of-week and start/end times
  // match what the admin sets in the dashboard, regardless of the server's own timezone.
  // Mirrors the dynamic-pricing engine (istClock); server-local getDay()/getHours() would
  // fire the window at the wrong wall-clock time on a UTC host.
  const { minutes: nowMin, dow } = istClock(now);
  if (!slot.daysOfWeek.includes(dow)) return false;
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
  /** Phase 3 — who pays this surge amount. */
  fundingMode: "CUSTOMER_100" | "COMPANY_100" | "SHARED";
  customerShareAmount: number;
  companyShareAmount: number;
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
  /** Sum of customer-funded portions across all applied surges (Phase 3). */
  customerShareTotal: number;
  /** Sum of company-funded portions across all applied surges (Phase 3). */
  companyShareTotal: number;
  surgeCapped: boolean;
  /** Active surges exist but rider is ineligible for all of them (e.g. max-only). */
  activeSurgesRequireMaxOnly: boolean;
} {
  const now = args.now ?? new Date();
  const forceIds = args.forceActiveSurgeIds ? new Set(args.forceActiveSurgeIds) : undefined;

  // Highest-priority first so amount ties resolve to the higher-priority (then lower-id) surge.
  const sorted = [...args.configs].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const serviceKey =
    args.service === "person_ride" ? "ride" : args.service ?? null;

  let activeSurgeCount = 0;
  const eligible: { cfg: StateSurgeConfigRow; appliedAmount: number }[] = [];

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

    // Eligibility is decided SOLELY by the per-surge "GMitra Max riders only" checkbox:
    //   checked   -> only riders with an active GatiMitra Max subscription qualify;
    //   unchecked -> every rider qualifies (Max and non-Max alike).
    // (The legacy global surge_wait_max_only switch no longer blocks surges — it only gates
    // waiting minutes upstream — so the checkbox is the single source of truth for surge.)
    if (cfg.maxRidersOnly && !args.riderHasGmitraMax) continue;

    const appliedAmount =
      cfg.surgeType === "percentage"
        ? round2(Math.max(0, args.baseFareForPct) * (cfg.amount / 100))
        : round2(Math.max(0, cfg.amount));
    if (appliedAmount <= 0) continue;

    eligible.push({ cfg, appliedAmount });
  }

  // ONE surge per order: when several surges are active AND the rider is eligible for more than
  // one, only the single highest-amount surge applies. Ties break toward the higher-priority
  // (then lower-id) surge because `eligible` is built in that order and the winner is replaced
  // only on a strictly-greater amount.
  let winner: { cfg: StateSurgeConfigRow; appliedAmount: number } | null = null;
  for (const cand of eligible) {
    if (!winner || cand.appliedAmount > winner.appliedAmount) winner = cand;
  }

  const applied: AppliedStateSurge[] = [];
  let surgeTotal = 0;
  let customerShareTotal = 0;
  let companyShareTotal = 0;
  let surgeCapped = false;

  if (winner) {
    const cfg = winner.cfg;
    let appliedAmount = winner.appliedAmount;

    // Per-order cap: with a single surge the cap is simply a ceiling on that surge's amount.
    const cap = args.maxTotalSurgeAmount;
    if (cap != null && cap >= 0 && appliedAmount > cap) {
      appliedAmount = round2(cap);
      surgeCapped = true;
    }

    // Split the (possibly capped) amount by the surge's funding mode. Rows predating the
    // funding migration collapse to CUSTOMER_100 so customerShareAmount === appliedAmount.
    const customerPct =
      cfg.fundingMode === "CUSTOMER_100"
        ? 100
        : cfg.fundingMode === "COMPANY_100"
          ? 0
          : Math.max(0, Math.min(100, cfg.customerSharePct));
    const customerShareAmount = round2((appliedAmount * customerPct) / 100);
    const companyShareAmount = round2(appliedAmount - customerShareAmount);

    applied.push({
      surgeId: cfg.id,
      name: cfg.name,
      surgeType: cfg.surgeType,
      amount: cfg.amount,
      appliedAmount,
      fundingMode: cfg.fundingMode,
      customerShareAmount,
      companyShareAmount,
    });
    surgeTotal = appliedAmount;
    customerShareTotal = customerShareAmount;
    companyShareTotal = companyShareAmount;
  }

  return {
    appliedSurges: applied,
    surgeTotal,
    customerShareTotal,
    companyShareTotal,
    surgeCapped,
    activeSurgesRequireMaxOnly: activeSurgeCount > 0 && eligible.length === 0,
  };
}
