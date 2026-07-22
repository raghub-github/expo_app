/**
 * Single source of truth for the checkout "To pay" / Place Order amount.
 * Bill Summary, Total Bill row, sticky footer, and order payload adjustments
 * must all derive from this (plus an optional cart-qty optimistic overlay).
 */

export function roundCheckoutMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CheckoutToPayInput = {
  /** Authoritative server bill grand total (after discounts, tip, donation). */
  finalAmount: number;
  deliveryType: "delivery" | "self_pickup";
  /**
   * True only before a delivery address is selected — excludes unsettled delivery
   * from the visible payable until the address quote is locked in.
   */
  deliveryFeePending: boolean;
  /** Delivery fee to exclude while pending (taxable delivery line). */
  pendingDeliveryFee: number;
  gatiCashApplyAmount: number;
  missedOfferUnlockDiscount: number;
  /** Wallet top-up amount when unlocking a missed offer (added to payable). */
  missedOfferWalletPendingAmount: number;
};

/**
 * Payable amount shown across checkout UI and used when applying wallet / unlocks
 * on top of `serverBill.finalAmount`.
 */
export function computeCheckoutToPayAmount(input: CheckoutToPayInput): number {
  const pendingDelivery =
    input.deliveryFeePending && input.deliveryType === "delivery"
      ? Math.max(0, input.pendingDeliveryFee)
      : 0;
  const walletAdd =
    input.missedOfferWalletPendingAmount > 0.005
      ? input.missedOfferWalletPendingAmount
      : 0;
  return Math.max(
    0,
    roundCheckoutMoney(
      input.finalAmount -
        pendingDelivery -
        input.gatiCashApplyAmount -
        input.missedOfferUnlockDiscount +
        walletAdd
    )
  );
}
