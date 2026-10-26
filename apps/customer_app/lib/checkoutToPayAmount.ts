/**
 * Single source of truth for the checkout "To pay" / Place Order amount.
 * Bill Summary, Total Bill row, sticky footer, and order payload adjustments
 * must all derive from this (plus an optional cart-qty optimistic overlay).
 */

export function roundCheckoutMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Delivery-fee waivers that are not valid until a saved address locks the quote. */
export function isDeliverySpecificDiscount(line: {
  label?: string;
  meta?: Record<string, unknown> | null;
}): boolean {
  const meta = line.meta ?? {};
  const source = String(meta.source ?? "");
  const kind = String(meta.offerKind ?? "").toUpperCase();
  const applies = String(meta.appliesOn ?? meta.discountAppliesOn ?? "").toUpperCase();
  if (source === "customer_subscription_free_delivery") return true;
  if (kind === "FREE_DELIVERY" || kind.includes("DELIVERY")) return true;
  if (applies === "DELIVERY_FEE" || applies === "DELIVERY") return true;
  return /free\s*delivery|delivery\s*(fee|discount|partner)/i.test(String(line.label ?? ""));
}

/**
 * Grand Total before an address is chosen must not contain a GPS or cached delivery fee,
 * and must not add that fee back through a delivery waiver.
 */
export function grandTotalWithoutUnconfirmedDelivery(input: {
  grandTotalBeforeDiscounts: number;
  deliveryFeePending: boolean;
  deliveryType: "delivery" | "self_pickup";
  pendingDeliveryFee: number;
  deliverySpecificDiscount: number;
}): number {
  if (!input.deliveryFeePending || input.deliveryType !== "delivery") {
    return roundCheckoutMoney(input.grandTotalBeforeDiscounts);
  }
  return roundCheckoutMoney(
    input.grandTotalBeforeDiscounts -
      Math.max(0, input.pendingDeliveryFee) -
      Math.max(0, input.deliverySpecificDiscount)
  );
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

export type CheckoutStrikethroughInput = {
  toPayAmount: number;
  gatiCashApplyAmount: number;
  /** Applied promo savings on the settled bill (coupons, membership delivery, item deals). */
  checkoutSavingsTotal: number;
  missedOfferWalletPending: boolean;
  missedOfferWalletPendingAmount: number;
};

/**
 * Strikethrough amount for Total Bill + Place Order CTA.
 * - With GatiCash: strike net payable before wallet (discounts already in that total).
 * - Without GatiCash: strike pre-discount list when savings apply.
 */
export function computeCheckoutStrikethroughTotal(
  input: CheckoutStrikethroughInput
): number | null {
  const toPay = input.toPayAmount;
  if (!Number.isFinite(toPay)) return null;

  const walletAdd =
    input.missedOfferWalletPending && input.missedOfferWalletPendingAmount > 0.005
      ? input.missedOfferWalletPendingAmount
      : 0;
  if (walletAdd > 0.005) return null;

  const gatiCash = Math.max(0, input.gatiCashApplyAmount);
  const savings = Math.max(0, input.checkoutSavingsTotal);
  const preWalletTotal = roundCheckoutMoney(toPay + gatiCash);

  if (gatiCash > 0.005 && preWalletTotal > toPay + 0.005) {
    return preWalletTotal;
  }

  if (savings > 0.005) {
    const list = roundCheckoutMoney(preWalletTotal + savings);
    if (list > toPay + 0.005) return list;
  }

  return null;
}
