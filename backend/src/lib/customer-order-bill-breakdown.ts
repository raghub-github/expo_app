/**
 * Parse billing_snapshot for order summary receipt (mirrors customer app orderBillBreakdown).
 */

export type OrderBillBreakdown = {
  itemTotal: number;
  gstAndPackaging: number;
  deliveryFee: number;
  deliveryFeeOriginal: number | null;
  platformFee: number;
  donation: number;
  tipAmount: number;
  surgeFee: number;
  smallOrderFee: number;
  convenienceFee: number;
  miscFee: number;
  subscriptionLabel: string | null;
  subscriptionFee: number;
  grandTotal: number;
  couponCode: string | null;
  couponDiscount: number;
  gatiCashApplied: number;
  missedOfferDiscount: number;
  missedOfferWalletAdd: number;
  paid: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function pickSubscriptionFromCharges(snapshot: Record<string, unknown>): {
  label: string | null;
  amount: number;
} {
  const charges = Array.isArray(snapshot.charges) ? snapshot.charges : [];
  const visible = charges.filter((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const c = raw as { amount?: unknown; hidden?: boolean; meta?: Record<string, unknown> };
    if (c.hidden) return false;
    if (num(c.amount) <= 0.005) return false;
    if (c.meta?.source === "customer_subscription_delivery_waived_marker") return false;
    return true;
  });

  const checkout = visible.find((raw) => {
    const c = raw as { meta?: Record<string, unknown> };
    return c.meta?.source === "customer_subscription_checkout";
  });
  if (checkout && typeof checkout === "object") {
    const c = checkout as { label?: unknown; amount?: unknown };
    return {
      label: String(c.label ?? "Membership").trim() || "Membership",
      amount: num(c.amount),
    };
  }

  const subscription = visible.find((raw) => {
    const c = raw as { label?: unknown; meta?: Record<string, unknown> };
    const lbl = String(c.label ?? "").toLowerCase();
    return (
      lbl.includes("gmitra") ||
      lbl.includes("plus") ||
      lbl.includes("gold") ||
      lbl.includes("subscription")
    );
  });
  if (subscription && typeof subscription === "object") {
    const c = subscription as { label?: unknown; amount?: unknown };
    return {
      label: String(c.label ?? "Membership").trim() || "Membership",
      amount: num(c.amount),
    };
  }

  return { label: null, amount: 0 };
}

function sumDiscountLines(snapshot: Record<string, unknown>): number {
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts : [];
  return discounts.reduce((sum, raw) => {
    if (!raw || typeof raw !== "object") return sum;
    return sum + Math.abs(num((raw as { amount?: unknown }).amount));
  }, 0);
}

function extractCouponFromDiscounts(snapshot: Record<string, unknown>): {
  code: string | null;
  amount: number;
} {
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts : [];
  let code: string | null = null;
  let amount = 0;
  for (const raw of discounts) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as { amount?: unknown; label?: unknown; meta?: Record<string, unknown> };
    const label = String(line.label ?? "").trim();
    const meta = line.meta ?? {};
    const metaCode =
      (typeof meta.couponCode === "string" && meta.couponCode.trim()) ||
      (typeof meta.code === "string" && meta.code.trim()) ||
      null;
    const isCoupon =
      meta.source === "coupon" ||
      !!metaCode ||
      /^coupon\b/i.test(label);
    if (!isCoupon) continue;
    const lineAmount = Math.abs(num(line.amount));
    amount += lineAmount;
    if (!code) {
      if (metaCode) code = metaCode.toUpperCase();
      else {
        const match = label.match(/coupon\s+(\S+)/i);
        code = match?.[1]?.toUpperCase() ?? "COUPON";
      }
    }
  }
  return { code, amount };
}

export function parseOrderBillFromSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  fallbackTotal: number | null | undefined,
  fallbackTipAmount?: number | null
): OrderBillBreakdown {
  const snap = snapshot ?? {};
  const itemTotal = num(snap.item_total) + num(snap.addon_total);
  const packagingFee = num(snap.packaging_fee);
  const taxTotal = num(snap.tax_total);
  const gstAndPackaging = packagingFee + taxTotal;

  const deliveryFee = num(snap.delivery_fee);
  const deliveryFeeQuoted = num(snap.deliveryFeeQuotedInr);
  const deliveryFeeOriginal =
    deliveryFeeQuoted > deliveryFee + 0.005
      ? deliveryFeeQuoted
      : deliveryFee > 0.005
        ? deliveryFee
        : null;

  const platformFee = num(snap.platform_fee);
  const donation = num(snap.donation_amount);
  const tipAmount =
    num(snap.tip_amount) > 0.005 ? num(snap.tip_amount) : num(fallbackTipAmount);
  const surgeFee = num(snap.surge_fee);
  const smallOrderFee = num(snap.small_order_fee);
  const convenienceFee = num(snap.convenience_fee);
  const miscFee = num(snap.misc_fee);
  const { label: subscriptionLabel, amount: subscriptionFee } = pickSubscriptionFromCharges(snap);

  const checkoutAdj =
    snap.checkoutAdjustments && typeof snap.checkoutAdjustments === "object"
      ? (snap.checkoutAdjustments as Record<string, unknown>)
      : null;
  const gatiCashApplied = num(checkoutAdj?.gatiCashApplied);
  const missedOfferDiscount = num(checkoutAdj?.missedOfferDiscount);
  const missedOfferWalletAdd = num(checkoutAdj?.missedOfferWalletAdd);

  const paid = num(snap.final_amount) || fallbackTotal || 0;
  const baseFinalAmount = num(snap.baseFinalAmount);

  const discountTotal = num(snap.discount_total);
  const discountFromLines = sumDiscountLines(snap);
  const totalDiscount =
    discountTotal > 0.005 ? discountTotal : discountFromLines > 0.005 ? discountFromLines : 0;

  const { code: couponCode, amount: couponFromLines } = extractCouponFromDiscounts(snap);
  const couponDiscount =
    couponFromLines > 0.005
      ? couponFromLines
      : totalDiscount > 0.005 && couponCode
        ? totalDiscount
        : totalDiscount > 0.005
          ? totalDiscount
          : 0;

  const deliveryForGrand = deliveryFeeOriginal ?? deliveryFee;
  const componentGrand =
    itemTotal +
    gstAndPackaging +
    deliveryForGrand +
    platformFee +
    donation +
    tipAmount +
    surgeFee +
    smallOrderFee +
    convenienceFee +
    miscFee +
    subscriptionFee;

  const grandTotal =
    baseFinalAmount > 0.005
      ? baseFinalAmount
      : componentGrand > 0.005
        ? componentGrand
        : paid + couponDiscount + gatiCashApplied + missedOfferDiscount - missedOfferWalletAdd;

  return {
    itemTotal,
    gstAndPackaging,
    deliveryFee,
    deliveryFeeOriginal,
    platformFee,
    donation,
    tipAmount,
    surgeFee,
    smallOrderFee,
    convenienceFee,
    miscFee,
    subscriptionLabel,
    subscriptionFee,
    grandTotal,
    couponCode,
    couponDiscount,
    gatiCashApplied,
    missedOfferDiscount,
    missedOfferWalletAdd,
    paid,
  };
}
