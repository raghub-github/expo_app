/**
 * Canonical payment breakdown persisted with every placed food order.
 *
 * One order can be settled by a gateway charge, by the GatiCash wallet, or by both. This
 * builds a single self-describing record — total bill, every discount that reduced it, the
 * wallet amount consumed, and the amount that actually moved through the gateway — so
 * reconciliation and support never have to re-derive money from the billing snapshot.
 */

export type OrderPaymentSettlement = "gateway" | "gati_cash" | "mixed";

export type OrderPaymentBreakdown = {
  currency: string;
  /** Bill the customer agreed to, before GatiCash / wallet settlement. */
  totalBillAmount: number;
  itemTotal: number;
  addonTotal: number;
  tipAmount: number;
  donationAmount: number;
  /** GMitra Plus (subscription) savings: waived delivery + SUBSCRIPTION_BENEFIT offers. */
  gmitraPlusDiscount: number;
  couponCode: string | null;
  couponDiscount: number;
  offerDiscount: number;
  totalDiscount: number;
  /** GatiCash wallet balance consumed by this order. */
  gatiCashUsed: number;
  missedOfferDiscount: number;
  missedOfferWalletCredit: number;
  /** What the customer still had to pay after all discounts and wallet usage. */
  finalPayableAmount: number;
  /** Amount that actually moved through the payment gateway (0 for wallet-only orders). */
  gatewayAmount: number;
  settlement: OrderPaymentSettlement;
  paymentStatus: "PAID";
  /** Every instrument that contributed, e.g. ["gati_cash"] or ["gati_cash", "upi"]. */
  paymentMethods: string[];
};

export type PendingRowForBreakdown = {
  itemTotal?: unknown;
  addonTotal?: unknown;
  tipAmount?: unknown;
  donationAmount?: unknown;
  grandTotal?: unknown;
  currency?: string | null;
  couponCode?: string | null;
  gatiCashApplied?: unknown;
  missedOfferDiscount?: unknown;
  missedOfferWalletAdd?: unknown;
  billingSnapshot?: unknown;
};

type DiscountLine = {
  amount?: unknown;
  label?: unknown;
  hidden?: boolean;
  meta?: Record<string, unknown>;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function snapshotOf(pending: PendingRowForBreakdown): Record<string, unknown> {
  const snap = pending.billingSnapshot;
  return snap && typeof snap === "object" ? (snap as Record<string, unknown>) : {};
}

function discountLines(snapshot: Record<string, unknown>): DiscountLine[] {
  const raw = snapshot.discounts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((line): line is DiscountLine => line != null && typeof line === "object");
}

function isSubscriptionLine(line: DiscountLine): boolean {
  const meta = line.meta ?? {};
  const kind = String(meta.offerKind ?? "").toUpperCase().replace(/[-\s]+/g, "_");
  if (kind === "SUBSCRIPTION_BENEFIT") return true;
  return /subscription/i.test(String(meta.source ?? ""));
}

function isCouponLine(line: DiscountLine): boolean {
  const meta = line.meta ?? {};
  if (meta.source === "coupon") return true;
  if (typeof meta.couponCode === "string" && meta.couponCode.trim()) return true;
  if (typeof meta.code === "string" && meta.code.trim()) return true;
  return /^coupon\b/i.test(String(line.label ?? "").trim());
}

/** Delivery fee waived by an active GMitra Plus membership. */
function subscriptionDeliveryWaived(snapshot: Record<string, unknown>): number {
  const stored = num(snapshot.deliveryFeeWaivedInr);
  if (stored > 0.005) return Math.abs(stored);

  const charges = Array.isArray(snapshot.charges) ? snapshot.charges : [];
  for (const raw of charges) {
    if (raw == null || typeof raw !== "object") continue;
    const charge = raw as { amount?: unknown; meta?: Record<string, unknown> };
    if (charge.meta?.source === "customer_subscription_delivery_waived_marker") {
      return Math.abs(num(charge.amount));
    }
  }

  for (const line of discountLines(snapshot)) {
    if (line.meta?.source === "customer_subscription_free_delivery") {
      return Math.abs(num(line.amount));
    }
  }

  return 0;
}

/**
 * `finalPayableAmount` is the pending row's grand total, which GatiCash has already been
 * subtracted from. The bill the customer agreed to is that plus whatever the wallet and
 * missed-offer adjustments took off (minus any wallet top-up that was added on).
 */
export function resolveBaseBillAmount(pending: PendingRowForBreakdown): number {
  return round2(
    num(pending.grandTotal) +
      num(pending.gatiCashApplied) +
      num(pending.missedOfferDiscount) -
      num(pending.missedOfferWalletAdd)
  );
}

export function buildOrderPaymentBreakdown(
  pending: PendingRowForBreakdown,
  args: {
    gatewayAmount: number;
    /** Gateway instrument (upi / card / wallet / …), omitted for wallet-only orders. */
    gatewayMethod?: string | null;
  }
): OrderPaymentBreakdown {
  const snapshot = snapshotOf(pending);
  const lines = discountLines(snapshot);

  let gmitraPlusDiscount = subscriptionDeliveryWaived(snapshot);
  let couponDiscount = 0;
  let offerDiscount = 0;
  let couponCode = pending.couponCode?.trim() ? pending.couponCode.trim().toUpperCase() : null;

  for (const line of lines) {
    const amount = Math.abs(num(line.amount));
    if (amount <= 0.005) continue;

    if (isSubscriptionLine(line)) {
      gmitraPlusDiscount += amount;
      continue;
    }
    if (isCouponLine(line)) {
      couponDiscount += amount;
      const meta = line.meta ?? {};
      const metaCode =
        (typeof meta.couponCode === "string" && meta.couponCode.trim()) ||
        (typeof meta.code === "string" && meta.code.trim()) ||
        null;
      if (!couponCode && metaCode) couponCode = metaCode.toUpperCase();
      continue;
    }
    offerDiscount += amount;
  }

  const gatiCashUsed = round2(num(pending.gatiCashApplied));
  const missedOfferDiscount = round2(num(pending.missedOfferDiscount));
  const missedOfferWalletCredit = round2(num(pending.missedOfferWalletAdd));
  const finalPayableAmount = round2(num(pending.grandTotal));
  const gatewayAmount = round2(Math.max(0, num(args.gatewayAmount)));

  const gatewayMethod = args.gatewayMethod?.trim().toLowerCase() || null;
  const paymentMethods: string[] = [];
  if (gatiCashUsed > 0.005) paymentMethods.push("gati_cash");
  if (gatewayAmount > 0.005 && gatewayMethod) paymentMethods.push(gatewayMethod);
  if (paymentMethods.length === 0) paymentMethods.push(gatiCashUsed > 0 ? "gati_cash" : "online");

  const usedWallet = gatiCashUsed > 0.005;
  const usedGateway = gatewayAmount > 0.005;
  const settlement: OrderPaymentSettlement = usedWallet && usedGateway
    ? "mixed"
    : usedWallet
      ? "gati_cash"
      : "gateway";

  return {
    currency: pending.currency ?? "INR",
    totalBillAmount: resolveBaseBillAmount(pending),
    itemTotal: round2(num(pending.itemTotal)),
    addonTotal: round2(num(pending.addonTotal)),
    tipAmount: round2(num(pending.tipAmount)),
    donationAmount: round2(num(pending.donationAmount)),
    gmitraPlusDiscount: round2(gmitraPlusDiscount),
    couponCode,
    couponDiscount: round2(couponDiscount),
    offerDiscount: round2(offerDiscount),
    totalDiscount: round2(gmitraPlusDiscount + couponDiscount + offerDiscount),
    gatiCashUsed,
    missedOfferDiscount,
    missedOfferWalletCredit,
    finalPayableAmount,
    gatewayAmount,
    settlement,
    paymentStatus: "PAID",
    paymentMethods,
  };
}
