/**
 * Pure helpers: decide when a completed order refund includes the membership fee.
 * Partial food-only refunds must NOT revoke until cumulative refunds exceed non-membership paid.
 */

import { pickSubscriptionFromCharges } from "./customer-order-bill-breakdown.js";

const MONEY_EPS = 0.02;

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type MembershipChargeBreakdown = {
  subtotal: number;
  gstAmount: number;
  total: number;
  label: string | null;
};

/** Membership checkout charge (subtotal + GST) from billing_snapshot. */
export function extractMembershipChargeFromBillingSnapshot(
  snapshot: Record<string, unknown> | null | undefined
): MembershipChargeBreakdown {
  const snap = snapshot ?? {};
  const { label, amount: subtotal } = pickSubscriptionFromCharges(snap);
  if (subtotal <= MONEY_EPS) {
    return { subtotal: 0, gstAmount: 0, total: 0, label: null };
  }

  const taxes = Array.isArray(snap.taxes) ? snap.taxes : [];
  let gstFromTaxes = 0;
  for (const raw of taxes) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as { amount?: unknown; meta?: Record<string, unknown> };
    if (line.meta?.source === "customer_subscription_checkout") {
      gstFromTaxes += num(line.amount);
    }
  }

  const gstComponents = snap.gst_components;
  let gstFromComponents = 0;
  if (gstComponents && typeof gstComponents === "object") {
    const sub = (gstComponents as Record<string, unknown>).subscription;
    if (sub && typeof sub === "object") {
      gstFromComponents = num((sub as { gst?: unknown }).gst);
    }
  }

  const gstAmount = round2(Math.max(gstFromTaxes, gstFromComponents));
  const total = round2(subtotal + gstAmount);
  return { subtotal: round2(subtotal), gstAmount, total, label };
}

/** Amount the customer paid for the order (membership + food + fees, after wallet/adjustments). */
export function resolveCustomerPaidTotal(args: {
  billingSnapshot: Record<string, unknown> | null | undefined;
  fallbackGrandTotal?: number | null;
}): number {
  const snap = args.billingSnapshot ?? {};
  const fromSnapshot = num(snap.final_amount);
  if (fromSnapshot > MONEY_EPS) return round2(fromSnapshot);
  const fallback = num(args.fallbackGrandTotal);
  return fallback > MONEY_EPS ? round2(fallback) : 0;
}

export type MembershipRefundAllocationInput = {
  customerPaidTotal: number;
  membershipChargeTotal: number;
  cumulativeRefunded: number;
};

export type MembershipRefundAllocationResult = {
  /** Order included a newly purchased membership charge at checkout. */
  orderHadMembershipCheckout: boolean;
  /** Cumulative refunds have reached a full order refund (includes membership). */
  isFullOrderRefund: boolean;
  /** Cumulative refunds have eaten into the membership fee portion. */
  isMembershipFeeRefunded: boolean;
  /** Safe to revoke the subscription linked to this order. */
  shouldRevokeMembership: boolean;
  nonMembershipPaid: number;
};

/** JSONB / client payloads may store opt-in as boolean or "true". */
export function isSubscriptionOptInTruthy(
  meta: Record<string, unknown> | null | undefined
): boolean {
  if (!meta) return false;
  const raw = meta.subscriptionOptIn;
  if (raw === true) return true;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
}

/**
 * True only when the customer bought a NEW membership on this checkout — not when
 * an existing Plus member merely used delivery benefits on the order.
 */
export function orderPurchasedMembershipOnCheckout(args: {
  billingSnapshot: Record<string, unknown> | null | undefined;
  checkoutMetadata: Record<string, unknown> | null | undefined;
}): boolean {
  const membership = extractMembershipChargeFromBillingSnapshot(args.billingSnapshot);
  if (membership.total > MONEY_EPS) return true;

  if (!isSubscriptionOptInTruthy(args.checkoutMetadata)) return false;

  const planId = Number(args.checkoutMetadata?.subscriptionPlanId);
  return Number.isFinite(planId) && planId > 0;
}

/**
 * Revoke only when the membership fee itself has been refunded:
 * - full order refund, OR
 * - cumulative refunds exceed food/fees-only portion (membership allocation reached).
 */
export function evaluateMembershipRefundAllocation(
  input: MembershipRefundAllocationInput
): MembershipRefundAllocationResult {
  const customerPaidTotal = round2(Math.max(0, input.customerPaidTotal));
  const membershipChargeTotal = round2(Math.max(0, input.membershipChargeTotal));
  const cumulativeRefunded = round2(Math.max(0, input.cumulativeRefunded));

  const orderHadMembershipCheckout = membershipChargeTotal > MONEY_EPS;
  if (!orderHadMembershipCheckout) {
    return {
      orderHadMembershipCheckout: false,
      isFullOrderRefund: false,
      isMembershipFeeRefunded: false,
      shouldRevokeMembership: false,
      nonMembershipPaid: customerPaidTotal,
    };
  }

  const nonMembershipPaid = round2(Math.max(0, customerPaidTotal - membershipChargeTotal));
  const isFullOrderRefund =
    customerPaidTotal > MONEY_EPS &&
    cumulativeRefunded + MONEY_EPS >= customerPaidTotal;
  const membershipOnlyRefund =
    membershipChargeTotal > MONEY_EPS &&
    cumulativeRefunded + MONEY_EPS >= membershipChargeTotal &&
    cumulativeRefunded <= membershipChargeTotal + MONEY_EPS &&
    cumulativeRefunded + MONEY_EPS < customerPaidTotal;
  const isMembershipFeeRefunded =
    isFullOrderRefund ||
    membershipOnlyRefund ||
    (membershipChargeTotal > MONEY_EPS &&
      cumulativeRefunded > nonMembershipPaid + MONEY_EPS);

  return {
    orderHadMembershipCheckout: true,
    isFullOrderRefund,
    isMembershipFeeRefunded,
    shouldRevokeMembership: isMembershipFeeRefunded,
    nonMembershipPaid,
  };
}

export { MONEY_EPS };
