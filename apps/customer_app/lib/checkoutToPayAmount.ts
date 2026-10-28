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
 * Instant qty/add/remove estimate of the pre-wallet bill final.
 *
 * Fixed fees (packaging, platform, delivery, tip, …) stay put; the variable share
 * (food after discounts + item tax) scales with cart value so First Bite / % offers
 * do not get treated as a 1:1 add to "To pay" (which made TOTAL diverge from the
 * settled Bill Summary figure).
 */
export function estimateOptimisticPreWalletAmount(input: {
  settledPreWallet: number;
  settledCartValue: number;
  liveCartValue: number;
  settledFixedFees: number;
  settledTip: number;
  settledDonation: number;
  liveTip: number;
  liveDonation: number;
}): number {
  const settledCart = Math.max(0, input.settledCartValue);
  const liveCart = Math.max(0, input.liveCartValue);
  const settledPre = Math.max(0, input.settledPreWallet);
  const settledFixed = Math.max(0, Math.min(input.settledFixedFees, settledPre));
  const settledTip = Math.max(0, input.settledTip);
  const settledDonation = Math.max(0, input.settledDonation);
  const liveFixed = Math.max(
    0,
    settledFixed - settledTip - settledDonation + Math.max(0, input.liveTip) + Math.max(0, input.liveDonation)
  );

  if (settledCart <= 0.005) {
    return roundCheckoutMoney(Math.max(0, liveFixed + liveCart));
  }

  const variable = Math.max(0, settledPre - settledFixed);
  const marginal = variable / settledCart;
  return roundCheckoutMoney(Math.max(0, liveFixed + liveCart * marginal));
}

/**
 * Packaging / platform / delivery / surge / … + tip/donation — does not scale 1:1
 * with food qty. Used by {@link estimateOptimisticPreWalletAmount}.
 */
export function sumCheckoutFixedFeeComponents(input: {
  packaging?: number;
  platform?: number;
  delivery?: number;
  surge?: number;
  smallOrder?: number;
  convenience?: number;
  subscription?: number;
  tip?: number;
  donation?: number;
}): number {
  return roundCheckoutMoney(
    Math.max(0, input.packaging ?? 0) +
      Math.max(0, input.platform ?? 0) +
      Math.max(0, input.delivery ?? 0) +
      Math.max(0, input.surge ?? 0) +
      Math.max(0, input.smallOrder ?? 0) +
      Math.max(0, input.convenience ?? 0) +
      Math.max(0, input.subscription ?? 0) +
      Math.max(0, input.tip ?? 0) +
      Math.max(0, input.donation ?? 0)
  );
}

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
