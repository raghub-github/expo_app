/**
 * Resolve GMitra Plus delivery savings for checkout upsell UI.
 * Prefers server benefit / estimate; falls back to quoted delivery fee math.
 *
 * Upsell only when the drop is within the membership free-delivery radius —
 * never advertise partial/covered-fraction savings beyond that limit.
 */

import { roundSavingsMoney } from "@/lib/checkoutAppliedSavings";
import { isStoreWithinMembershipFreeDeliveryRadius } from "@/lib/membershipFreeDelivery";

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

/** True when GMitra Plus free-delivery upsell is valid for this drop. */
export function isMembershipDeliveryUpsellEligible(input: {
  deliveryType: "delivery" | "self_pickup";
  freeDeliveryEnabled: boolean;
  distanceKm: number | null;
  maxFreeDeliveryRadiusKm: number | null | undefined;
}): boolean {
  if (input.deliveryType !== "delivery" || !input.freeDeliveryEnabled) return false;
  return isStoreWithinMembershipFreeDeliveryRadius({
    storeDistanceKm: input.distanceKm,
    maxFreeDeliveryRadiusKm: input.maxFreeDeliveryRadiusKm,
  });
}

export function resolveGmitraPlusDeliverySave(
  input: ResolveGmitraPlusDeliverySaveInput
): number | null {
  if (
    !isMembershipDeliveryUpsellEligible({
      deliveryType: input.deliveryType,
      freeDeliveryEnabled: input.freeDeliveryEnabled,
      distanceKm: input.distanceKm,
      maxFreeDeliveryRadiusKm: input.maxFreeDeliveryRadiusKm,
    })
  ) {
    return null;
  }

  const benefit = input.serverBenefit;
  // Prefer exact server waived amount (full waiver within radius — never invent fractions).
  if (benefit && benefit.waivedInr > 0.005 && benefit.isPartial !== true) {
    return roundSavingsMoney(benefit.waivedInr);
  }

  const quoted =
    input.deliveryFeeQuotedInr ??
    input.deliveryFeeStrikeAmount ??
    (input.currentDeliveryFee > 0.005 ? input.currentDeliveryFee : 0);
  if (quoted <= 0.005) return null;

  return roundSavingsMoney(quoted);
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
