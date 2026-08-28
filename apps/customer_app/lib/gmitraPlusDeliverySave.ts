/**
 * Resolve GMitra Plus delivery savings for checkout upsell UI.
 * Prefers server benefit / estimate; falls back to quoted delivery fee math.
 */

import { roundSavingsMoney } from "@/lib/checkoutAppliedSavings";

export type GmitraPlusDeliveryBenefit = {
  waivedInr: number;
  membershipDeliveryFeeInr?: number;
  isPartial?: boolean;
};

export type ResolveGmitraPlusDeliverySaveInput = {
  deliveryType: "delivery" | "self_pickup";
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  distanceKm: number | null;
  deliveryFeeQuotedInr: number | null;
  deliveryFeeStrikeAmount: number | null;
  currentDeliveryFee: number;
  serverBenefit: GmitraPlusDeliveryBenefit | null;
};

export type MembershipDeliverySavingsInput = ResolveGmitraPlusDeliverySaveInput & {
  appliedBillSavings: number;
  membershipOnBill: boolean;
};

export function resolveGmitraPlusDeliverySave(
  input: ResolveGmitraPlusDeliverySaveInput
): number | null {
  const benefit = input.serverBenefit;
  if (benefit && benefit.waivedInr > 0.005) {
    return roundSavingsMoney(benefit.waivedInr);
  }

  if (input.deliveryType !== "delivery" || !input.freeDeliveryEnabled) {
    return null;
  }

  const quoted =
    input.deliveryFeeQuotedInr ??
    input.deliveryFeeStrikeAmount ??
    (input.currentDeliveryFee > 0.005 ? input.currentDeliveryFee : 0);
  if (quoted <= 0.005) return null;

  const radius =
    input.maxFreeDeliveryRadiusKm > 0 ? input.maxFreeDeliveryRadiusKm : 7;
  const dist = input.distanceKm;

  if (dist == null || dist <= radius) {
    return roundSavingsMoney(quoted);
  }

  const current = Math.max(0, input.currentDeliveryFee);
  if (quoted > current + 0.005) {
    return roundSavingsMoney(quoted - current);
  }

  const coveredFraction = Math.min(1, radius / dist);
  const estimated = quoted * coveredFraction;
  return estimated > 0.005 ? roundSavingsMoney(estimated) : null;
}

/** One amount for upsell + applied membership copy — bill applied savings win when settled. */
export function resolveMembershipDeliverySavingsDisplay(
  input: MembershipDeliverySavingsInput
): number | null {
  if (input.membershipOnBill && input.appliedBillSavings > 0.005) {
    return roundSavingsMoney(input.appliedBillSavings);
  }
  return resolveGmitraPlusDeliverySave(input);
}
