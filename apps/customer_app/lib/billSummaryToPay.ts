/**
 * Bill Summary payable reconciliation — keeps Grand Total − discounts = To pay
 * without inventing an "Other savings" balancing row.
 */

import {
  computeCheckoutToPayAmount,
  roundCheckoutMoney,
  type CheckoutToPayInput,
} from "@/lib/checkoutToPayAmount";

/** Prop matches server within this epsilon (tip/rounding). */
export const BILL_SUMMARY_TO_PAY_MATCH_EPS = 0.05;

export type BillSummaryServerToPayInput = {
  serverFinalAmount: number;
  tipAmountServer: number;
  donationAmountServer: number;
  tipAmountLive: number;
  donationAmountLive: number;
  deliveryType: CheckoutToPayInput["deliveryType"];
  deliveryFeePending: boolean;
  pendingDeliveryFee: number;
  gatiCashApplyAmount: number;
  missedOfferUnlockDiscount: number;
  missedOfferWalletPendingAmount: number;
};

/** Live tip/donation on top of the last settled server finalAmount. */
export function billSummaryLiveFinalAmount(input: {
  serverFinalAmount: number;
  tipAmountServer: number;
  donationAmountServer: number;
  tipAmountLive: number;
  donationAmountLive: number;
}): number {
  return roundCheckoutMoney(
    input.serverFinalAmount -
      Math.max(0, input.tipAmountServer) -
      Math.max(0, input.donationAmountServer) +
      Math.max(0, input.tipAmountLive) +
      Math.max(0, input.donationAmountLive)
  );
}

export function computeBillSummaryServerToPay(input: BillSummaryServerToPayInput): number {
  const finalAmount = billSummaryLiveFinalAmount(input);
  return computeCheckoutToPayAmount({
    finalAmount,
    deliveryType: input.deliveryType,
    deliveryFeePending: input.deliveryFeePending,
    pendingDeliveryFee: input.pendingDeliveryFee,
    gatiCashApplyAmount: input.gatiCashApplyAmount,
    missedOfferUnlockDiscount: input.missedOfferUnlockDiscount,
    missedOfferWalletPendingAmount: input.missedOfferWalletPendingAmount,
  });
}

export type ResolveBillSummaryToPayInput = BillSummaryServerToPayInput & {
  /**
   * Optional overlay from checkout (optimistic qty total). Used only when it
   * matches the authoritative server figure — otherwise the sheet stays on the
   * server amount so discount rows reconcile (no fabricated "Other savings").
   */
  toPayAmountProp?: number | null;
};

export type ResolveBillSummaryToPayResult = {
  toPayDisplay: number;
  serverToPay: number;
  /** True when the checkout prop was ignored because it diverged from the bill. */
  ignoredDivergentProp: boolean;
};

/**
 * Authoritative To pay for Bill Summary line math.
 * Never invents a discount to bridge an optimistic footer vs settled bill gap.
 */
export function resolveBillSummaryToPay(
  input: ResolveBillSummaryToPayInput
): ResolveBillSummaryToPayResult {
  const serverToPay = computeBillSummaryServerToPay(input);
  const prop = input.toPayAmountProp;
  if (prop != null && Number.isFinite(prop)) {
    const rounded = Math.max(0, roundCheckoutMoney(prop));
    if (Math.abs(rounded - serverToPay) <= BILL_SUMMARY_TO_PAY_MATCH_EPS) {
      return { toPayDisplay: rounded, serverToPay, ignoredDivergentProp: false };
    }
    return { toPayDisplay: serverToPay, serverToPay, ignoredDivergentProp: true };
  }
  return { toPayDisplay: serverToPay, serverToPay, ignoredDivergentProp: false };
}

/**
 * Residual of server `discountTotal` not already shown as named discount rows.
 * This is real engine savings — never a Grand-Total−To-pay balancing figure.
 */
export function computeUnlistedDiscountTotal(input: {
  discountTotal: number;
  listedDiscountAmount: number;
  bogoDiscountTotal?: number;
  suppressedDeliveryDiscount?: number;
  missedOfferUnlockDiscount?: number;
}): number {
  const gap =
    Math.max(0, input.discountTotal) -
    Math.max(0, input.bogoDiscountTotal ?? 0) -
    Math.max(0, input.listedDiscountAmount) -
    Math.max(0, input.suppressedDeliveryDiscount ?? 0) -
    Math.max(0, input.missedOfferUnlockDiscount ?? 0);
  return gap > 0.05 ? roundCheckoutMoney(gap) : 0;
}

/**
 * After named discounts (+ unlisted server remainder) and wallet lines, how much
 * of Grand Total is still unexplained vs To pay.
 *
 * Positive leftover used to be labelled "Other savings" — that was a fabricated
 * bridge for optimistic To pay / stale bill mismatch. Callers must NOT render it
 * as a discount; at most surface a non-discount "Bill updating" state.
 */
export function computeGrandToPayLeftover(input: {
  grandTotalShown: number;
  toPayDisplay: number;
  listedPayDeductions: number;
}): number {
  return roundCheckoutMoney(
    input.grandTotalShown - input.toPayDisplay - input.listedPayDeductions
  );
}
