/**
 * Parse persisted billing_snapshot from orders_core into display lines for order details.
 */

export type OrderBillBreakdown = {
  itemTotal: number;
  gstAndPackaging: number;
  deliveryFee: number;
  deliveryFeeOriginal: number | null;
  platformFee: number;
  donation: number;
  tipAmount: number;
  grandTotal: number;
  couponCode: string | null;
  couponDiscount: number;
  paid: number;
  totalSavings: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
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
  const extraFees =
    num(snap.surge_fee) +
    num(snap.small_order_fee) +
    num(snap.convenience_fee) +
    num(snap.misc_fee);

  const paid = num(snap.final_amount) || fallbackTotal || 0;

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
  const grandTotal =
    itemTotal + gstAndPackaging + deliveryForGrand + platformFee + donation + tipAmount + extraFees;

  let deliverySavings = 0;
  if (deliveryFeeQuoted > deliveryFee + 0.005) {
    deliverySavings = deliveryFeeQuoted - deliveryFee;
  }

  const totalSavings = Math.max(0, totalDiscount + deliverySavings);

  return {
    itemTotal,
    gstAndPackaging,
    deliveryFee,
    deliveryFeeOriginal,
    platformFee,
    donation,
    tipAmount,
    grandTotal,
    couponCode,
    couponDiscount,
    paid,
    totalSavings,
  };
}
