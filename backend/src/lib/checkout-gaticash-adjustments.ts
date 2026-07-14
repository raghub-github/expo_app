/**
 * Checkout GatiCash + missed-offer wallet adjustments applied on top of billing final_amount.
 *
 * Client sends in checkout_metadata:
 * - gatiCashAmount: wallet applied toward this order (deducted from to-pay)
 * - missedOfferCompensation.amountInr: gap added to to-pay; credited to wallet after order
 * - missedOfferCompensation.discountInr: offer savings subtracted from to-pay
 */

export type MissedOfferCompensationMeta = {
  amountInr: number;
  discountInr: number;
  offerKey: string;
  offerId?: number | null;
  offerSource?: "platform" | "merchant" | null;
  offerKind?: string;
  offerTitle?: string;
};

export type CheckoutGatiCashAdjustments = {
  gatiCashApplied: number;
  missedOfferDiscount: number;
  missedOfferWalletAdd: number;
  missedOfferCompensation: MissedOfferCompensationMeta | null;
  baseGrandTotal: number;
  adjustedGrandTotal: number;
};

const MAX_MISSED_OFFER_WALLET_ADD = 500;

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePositiveInr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return roundInr(n);
}

function parseMissedOfferCompensation(
  raw: unknown
): MissedOfferCompensationMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amountInr = parsePositiveInr(o.amountInr, 0);
  const discountInr = parsePositiveInr(o.discountInr, 0);
  const offerKey = typeof o.offerKey === "string" ? o.offerKey.trim() : "";
  if (amountInr <= 0 && discountInr <= 0) return null;
  if (!offerKey) return null;

  const offerSource =
    o.offerSource === "platform" || o.offerSource === "merchant" ? o.offerSource : null;
  const offerKind = typeof o.offerKind === "string" ? o.offerKind : undefined;
  const offerTitle = typeof o.offerTitle === "string" ? o.offerTitle : undefined;

  // Merchant store precision / cart offers cannot be unlocked via GatiCash — platform only.
  if (offerSource === "merchant") {
    const kind = String(offerKind ?? "").toUpperCase().replace(/[-\s]+/g, "_");
    const title = String(offerTitle ?? "").toLowerCase();
    const isPrecisionLike =
      kind === "PRECISION" ||
      kind === "CART_PERCENTAGE" ||
      kind === "CART_FLAT" ||
      kind === "PERCENTAGE" ||
      kind === "FLAT" ||
      kind === "DISCOUNT" ||
      kind === "COUPON" ||
      kind === "" ||
      /\bprecision\b/.test(title);
    if (isPrecisionLike) return null;
  }

  return {
    amountInr: Math.min(amountInr, MAX_MISSED_OFFER_WALLET_ADD),
    discountInr,
    offerKey,
    offerId: typeof o.offerId === "number" && o.offerId > 0 ? o.offerId : null,
    offerSource,
    offerKind,
    offerTitle,
  };
}

/** Read gatiCash + missed-offer fields from checkout metadata (and optional top-level gatiCashAmount). */
export function parseCheckoutGatiCashAdjustments(
  checkoutMetadata: Record<string, unknown> | null | undefined,
  baseGrandTotal: number,
  topLevelGatiCashAmount?: number | null
): CheckoutGatiCashAdjustments {
  const meta = checkoutMetadata && typeof checkoutMetadata === "object" ? checkoutMetadata : {};
  const fromMeta = parsePositiveInr(meta.gatiCashAmount, 0);
  const fromTop = parsePositiveInr(topLevelGatiCashAmount, 0);
  const gatiCashApplied = fromMeta > 0 ? fromMeta : fromTop;

  const missedOfferCompensation = parseMissedOfferCompensation(meta.missedOfferCompensation);
  const missedOfferDiscount = missedOfferCompensation?.discountInr ?? 0;
  const missedOfferWalletAdd = missedOfferCompensation?.amountInr ?? 0;

  const adjustedGrandTotal = roundInr(
    Math.max(0.01, baseGrandTotal - gatiCashApplied - missedOfferDiscount + missedOfferWalletAdd)
  );

  return {
    gatiCashApplied,
    missedOfferDiscount,
    missedOfferWalletAdd,
    missedOfferCompensation,
    baseGrandTotal: roundInr(baseGrandTotal),
    adjustedGrandTotal,
  };
}

/** Merge checkout adjustment lines into billing snapshot for order history / support. */
export function enrichBillingSnapshotWithCheckoutAdjustments(
  billingSnapshot: Record<string, unknown> | null | undefined,
  adj: CheckoutGatiCashAdjustments
): Record<string, unknown> {
  const base =
    billingSnapshot && typeof billingSnapshot === "object" ? { ...billingSnapshot } : {};

  base.baseFinalAmount = adj.baseGrandTotal;
  base.final_amount = adj.adjustedGrandTotal;

  const checkoutLines: Array<{ label: string; amount: number; kind: string }> = [];
  if (adj.gatiCashApplied > 0) {
    checkoutLines.push({
      label: "GatiCash wallet",
      amount: -adj.gatiCashApplied,
      kind: "gati_cash_applied",
    });
  }
  if (adj.missedOfferDiscount > 0) {
    checkoutLines.push({
      label: adj.missedOfferCompensation?.offerTitle?.trim() || "Offer unlocked",
      amount: -adj.missedOfferDiscount,
      kind: "missed_offer_discount",
    });
  }
  if (adj.missedOfferWalletAdd > 0) {
    checkoutLines.push({
      label: "Add to GatiCash wallet",
      amount: adj.missedOfferWalletAdd,
      kind: "missed_offer_wallet_add",
    });
  }

  base.checkoutAdjustments = {
    gatiCashApplied: adj.gatiCashApplied,
    missedOfferDiscount: adj.missedOfferDiscount,
    missedOfferWalletAdd: adj.missedOfferWalletAdd,
    lines: checkoutLines,
    ...(adj.missedOfferCompensation
      ? { missedOfferCompensation: adj.missedOfferCompensation }
      : {}),
  };

  return base;
}
