import {
  calcServicePayoutRuleSplit,
  calcWaitingCharge as sharedWaitingCharge,
  type ServicePayoutRule,
} from "@gatimitra/slab-pricing";
import type { RiderPayoutQuote, ServicePayoutRuleRow } from "./types.js";
import type { AppliedRiderSurge } from "../rider-surge/types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateWaitingCharge(args: {
  waitingMinutes: number;
  chargePerMin: number;
  startAfterMinutes: number;
  /** Duration cap (billable minutes); null → engine safety ceiling. */
  maxMinutes?: number | null;
  /** Amount cap (₹); null → engine safety ceiling. */
  maxCharge?: number | null;
}): number {
  return sharedWaitingCharge(
    args.waitingMinutes,
    args.startAfterMinutes,
    args.chargePerMin,
    args.maxMinutes,
    args.maxCharge
  );
}

function toRule(row: ServicePayoutRuleRow): ServicePayoutRule {
  return {
    riderPercentage: row.riderPercentage,
    platformPercentage: row.platformPercentage,
  };
}

/**
 * Rider Fare Engine v3.0: rider payout = rule.riderPercentage of customerFare,
 * split pickup/drop purely by distance ratio (pickupKm / totalKm — no
 * guardrails, no fixed ratios), plus waiting charge and surge added on top.
 * No slab lookup — the rule and customerFare are the only pricing inputs.
 */
export function calculatePercentageRiderPayout(args: {
  customerFare: number;
  pickupKm: number;
  dropKm: number;
  rule: ServicePayoutRuleRow;
  waitingMinutes?: number;
  riderHasGmitraMax?: boolean;
  surgeWaitMaxOnly?: boolean;
  appliedSurges?: AppliedRiderSurge[];
  rawSurgeTotal?: number;
  surgeTotal?: number;
  surgeCapped?: boolean;
  maxTotalSurgeAmount?: number | null;
}): { ok: true; quote: RiderPayoutQuote } | { ok: false; code: string; message: string } {
  const pickupKm = Math.max(0, args.pickupKm);
  const dropKm = Math.max(0, args.dropKm);
  const customerFare = Math.max(0, args.customerFare);

  if (customerFare <= 0) {
    return { ok: false, code: "NO_CUSTOMER_FARE", message: "Customer fare is required to derive rider payout" };
  }

  const split = calcServicePayoutRuleSplit({
    customerFare,
    pickupKm,
    dropKm,
    rule: toRule(args.rule),
  });

  const surgeBlocked = args.surgeWaitMaxOnly === true && args.riderHasGmitraMax !== true;
  const waitingMinutes = surgeBlocked ? 0 : Math.max(0, args.waitingMinutes ?? 0);
  const waitingAmount =
    waitingMinutes > 0 && args.rule.waitingChargePerMin
      ? calculateWaitingCharge({
          waitingMinutes,
          chargePerMin: args.rule.waitingChargePerMin,
          startAfterMinutes: args.rule.waitingFreeMinutes,
          // A-3 fix: rider-side waiting is now bounded by the same caps as the customer side.
          maxMinutes: args.rule.waitingMaxMinutes,
          maxCharge: args.rule.waitingMaxCharge,
        })
      : 0;

  const appliedSurges = surgeBlocked ? [] : args.appliedSurges ?? [];
  const surgeTotal = surgeBlocked ? 0 : args.surgeTotal ?? 0;
  const rawSurgeTotal = surgeBlocked ? 0 : args.rawSurgeTotal ?? 0;

  const pickupAmount = round2(split.pickupAmount + waitingAmount);
  const dropAmount = round2(split.dropAmount);
  const finalAmount = round2(pickupAmount + dropAmount + surgeTotal);

  return {
    ok: true,
    quote: {
      pickupKm: round2(pickupKm),
      dropKm: round2(dropKm),
      customerFare: split.customerFare,
      riderPercentage: args.rule.riderPercentage,
      platformPercentage: args.rule.platformPercentage,
      platformRevenue: split.platformRevenue,
      ruleId: args.rule.id,
      rulePriority: args.rule.priority,
      pickupRatio: split.pickupRatio,
      dropRatio: split.dropRatio,
      pickupAmount,
      dropAmount,
      waitingMinutes: round2(waitingMinutes),
      waitingAmount,
      subtotalBeforeSurge: round2(pickupAmount + dropAmount),
      appliedSurges,
      rawSurgeTotal,
      surgeTotal,
      surgeCapped: args.surgeCapped === true,
      maxTotalSurgeAmount: args.maxTotalSurgeAmount ?? null,
      surgeWaitMaxOnly: args.surgeWaitMaxOnly === true,
      riderGmitraMaxApplied: args.riderHasGmitraMax === true,
      finalAmount,
      pricingEngine: "rider_percentage_v3",
    },
  };
}
