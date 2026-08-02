/**
 * Parse persisted billing_snapshot from orders_core into display lines for order details.
 *
 * Grand total / savings mirror checkout BillSummarySheet:
 *   grandTotal = paid − tip − donation + discount_total + checkout wallet adjustments
 *   totalSavings = discount_total + GatiCash + missed-offer discount (not delivery quote delta)
 */

export type OrderBillDiscountLine = {
  label: string;
  amount: number;
  code: string | null;
};

export type OrderBillBreakdown = {
  itemTotal: number;
  gstAndPackaging: number;
  /** Customer delivery fee after benefits (0 when subscription free delivery applies). */
  deliveryFee: number;
  /** Pre-benefit delivery for strikethrough (subscription waiver or partial discount). */
  deliveryFeeOriginal: number | null;
  /** When true, delivery row shows strikethrough + FREE (not a reduced ₹ amount). */
  deliveryDisplayFree: boolean;
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
  discountLines: OrderBillDiscountLine[];
  gatiCashApplied: number;
  missedOfferDiscount: number;
  missedOfferWalletAdd: number;
  paid: number;
  totalSavings: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

function roundBill(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumDiscountLines(snapshot: Record<string, unknown>): number {
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts : [];
  return discounts.reduce((sum, raw) => {
    if (!raw || typeof raw !== "object") return sum;
    const line = raw as { amount?: unknown; hidden?: boolean };
    if (line.hidden) return sum;
    return sum + Math.abs(num(line.amount));
  }, 0);
}

function extractVisibleDiscountLines(snapshot: Record<string, unknown>): OrderBillDiscountLine[] {
  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts : [];
  const lines: OrderBillDiscountLine[] = [];

  for (const raw of discounts) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as {
      amount?: unknown;
      label?: unknown;
      hidden?: boolean;
      meta?: Record<string, unknown>;
    };
    if (line.hidden) continue;
    if (line.meta?.source === "customer_subscription_delivery_waived_marker") continue;

    const amount = Math.abs(num(line.amount));
    if (amount <= 0.005) continue;

    const label = String(line.label ?? "Discount").trim() || "Discount";
    const meta = line.meta ?? {};
    const code =
      (typeof meta.couponCode === "string" && meta.couponCode.trim()) ||
      (typeof meta.code === "string" && meta.code.trim()) ||
      null;

    lines.push({
      label,
      amount,
      code: code ? code.toUpperCase() : null,
    });
  }

  return lines;
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
    const line = raw as { amount?: unknown; label?: unknown; hidden?: boolean; meta?: Record<string, unknown> };
    if (line.hidden) continue;
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

function pickSubscriptionDeliveryWaived(snapshot: Record<string, unknown>): number {
  const stored = num(snapshot.deliveryFeeWaivedInr);
  if (stored > 0.005) return stored;

  const charges = Array.isArray(snapshot.charges) ? snapshot.charges : [];
  for (const raw of charges) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as { amount?: unknown; meta?: Record<string, unknown> };
    if (c.meta?.source === "customer_subscription_delivery_waived_marker") {
      return Math.abs(num(c.amount));
    }
  }

  const discounts = Array.isArray(snapshot.discounts) ? snapshot.discounts : [];
  for (const raw of discounts) {
    if (!raw || typeof raw !== "object") continue;
    const line = raw as { amount?: unknown; hidden?: boolean; meta?: Record<string, unknown> };
    if (line.hidden) continue;
    if (line.meta?.source === "customer_subscription_free_delivery") {
      return Math.abs(num(line.amount));
    }
  }

  return 0;
}

function resolveDeliveryDisplay(snapshot: Record<string, unknown>): {
  deliveryFee: number;
  deliveryFeeOriginal: number | null;
  deliveryDisplayFree: boolean;
} {
  const rawDeliveryFee = num(snapshot.delivery_fee);
  const beforeBenefits =
    num(snapshot.deliveryFeeBeforeBenefitsInr) > 0.005
      ? num(snapshot.deliveryFeeBeforeBenefitsInr)
      : num(snapshot.deliveryFeeQuotedInr);
  const subscriptionWaived = pickSubscriptionDeliveryWaived(snapshot);

  if (subscriptionWaived > 0.005) {
    return {
      deliveryFee: 0,
      deliveryFeeOriginal: subscriptionWaived,
      deliveryDisplayFree: true,
    };
  }

  if (beforeBenefits > rawDeliveryFee + 0.005) {
    return {
      deliveryFee: rawDeliveryFee,
      deliveryFeeOriginal: beforeBenefits,
      deliveryDisplayFree: rawDeliveryFee <= 0.005,
    };
  }

  if (rawDeliveryFee <= 0.005 && beforeBenefits > 0.005) {
    return {
      deliveryFee: 0,
      deliveryFeeOriginal: beforeBenefits,
      deliveryDisplayFree: true,
    };
  }

  return {
    deliveryFee: rawDeliveryFee,
    deliveryFeeOriginal: null,
    deliveryDisplayFree: false,
  };
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

  const {
    deliveryFee,
    deliveryFeeOriginal,
    deliveryDisplayFree,
  } = resolveDeliveryDisplay(snap);

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

  const discountTotal = num(snap.discount_total);
  const discountFromLines = sumDiscountLines(snap);
  const totalDiscount =
    discountTotal > 0.005 ? discountTotal : discountFromLines > 0.005 ? discountFromLines : 0;

  const discountLines = extractVisibleDiscountLines(snap);
  const { code: couponCode, amount: couponFromLines } = extractCouponFromDiscounts(snap);
  const couponDiscount =
    couponFromLines > 0.005
      ? couponFromLines
      : totalDiscount > 0.005 && couponCode
        ? totalDiscount
        : totalDiscount > 0.005
          ? totalDiscount
          : 0;

  /** Pre-discount bill total — same formula as checkout BillSummarySheet grandTotalBeforeDiscounts. */
  const grandTotal = roundBill(
    Math.max(
      0,
      paid -
        tipAmount -
        donation +
        totalDiscount +
        gatiCashApplied +
        missedOfferDiscount -
        missedOfferWalletAdd
    )
  );

  const totalSavings = roundBill(
    Math.max(0, totalDiscount + gatiCashApplied + missedOfferDiscount)
  );

  return {
    itemTotal,
    gstAndPackaging,
    deliveryFee,
    deliveryFeeOriginal,
    deliveryDisplayFree,
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
    discountLines,
    gatiCashApplied,
    missedOfferDiscount,
    missedOfferWalletAdd,
    paid,
    totalSavings,
  };
}

/**
 * Amount the customer actually paid (Cashin + GatiCash).
 *
 * `orders_core.grand_total` / billing `final_amount` are post-wallet Cashin.
 * GatiCash is a payment instrument — never use reconstructed `grandTotal`
 * (pre-discount bill) for refunds; that inflates the amount when Cashin is ₹0.
 */
export function resolveOrderCustomerPaidAmount(order: {
  totalAmount?: number | null;
  gatiCashUsed?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
  tipAmount?: number | null;
}): number {
  const bill = parseOrderBillFromSnapshot(
    order.billingSnapshot,
    order.totalAmount ?? null,
    order.tipAmount ?? null
  );
  const fromApi = num(order.gatiCashUsed);
  const gati =
    fromApi > 0.005 ? roundBill(fromApi) : bill.gatiCashApplied > 0.005 ? bill.gatiCashApplied : 0;
  const netRaw = order.totalAmount;
  const net =
    netRaw != null && Number.isFinite(Number(netRaw))
      ? roundBill(Math.max(0, Number(netRaw)))
      : roundBill(Math.max(0, bill.paid));

  let ctc = roundBill(net + gati);
  if (ctc <= 0.005 && gati > 0.005) return gati;
  if (ctc <= 0.005 && bill.paid > 0.005) return bill.paid;
  return ctc;
}
