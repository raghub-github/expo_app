/**
 * How much the customer actually paid (and can therefore be refunded).
 * Ride / parcel fare is collected after the trip — "Online" is a planned
 * method, not proof of capture. Never treat unpaid grand_total as GatiCash.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isPostTripCollectedOrderType(orderType: unknown): boolean {
  const t = String(orderType ?? "").trim().toLowerCase();
  return t === "person_ride" || t === "ride" || t === "parcel" || t === "cab";
}

export function looksLikeWalletPaymentChannel(args: {
  gateway?: unknown;
  method?: unknown;
  coreMethod?: unknown;
}): boolean {
  const gw = String(args.gateway ?? "").trim().toLowerCase();
  const method = String(args.method ?? "").trim().toLowerCase();
  const core = String(args.coreMethod ?? "").trim().toLowerCase();
  return (
    gw === "gati_cash" ||
    gw === "wallet" ||
    method === "wallet" ||
    method === "gati_cash" ||
    core === "wallet" ||
    core === "gati_cash"
  );
}

export function customerFareWasCaptured(args: {
  razorpayPaymentId?: string | null;
  gatiCashTxnId?: string | null;
  gatiCashUsed?: number;
  gatewayAmount?: number;
  capturedPaymentAmount?: number;
}): boolean {
  if (String(args.razorpayPaymentId ?? "").trim()) return true;
  if (String(args.gatiCashTxnId ?? "").trim()) return true;
  if ((args.gatiCashUsed ?? 0) > 0.005) return true;
  if ((args.gatewayAmount ?? 0) > 0.005) return true;
  if ((args.capturedPaymentAmount ?? 0) > 0.005) return true;
  return false;
}

export type RefundPaidAmountFacts = {
  grandTotal: number;
  corePaymentMethod: string;
  corePaymentStatus: string;
  /** Amount from a captured / pay_* payments row only. */
  capturedPaidAmount: number;
  paymentGateway: string;
  paymentMethod: string;
  gatiCashFromBreakdown: number;
  gatewayAmtFromBreakdown: number;
  pendingGatiCash: number;
  orderType: string;
};

/**
 * Refundable rupees: captured gateway + real GatiCash debit.
 * Unpaid post-trip fare (ride/parcel Online) returns 0.
 */
export function resolveRefundablePaidAmountFromFacts(r: RefundPaidAmountFacts): number {
  const num = (v: number) => (Number.isFinite(v) ? v : 0);
  let gatiCash = Math.max(0, num(r.gatiCashFromBreakdown));
  let gatewayAmt = Math.max(0, num(r.gatewayAmtFromBreakdown));
  if (gatiCash <= 0.005) gatiCash = Math.max(0, num(r.pendingGatiCash));

  const paidRow = Math.max(0, num(r.capturedPaidAmount));
  const gw = String(r.paymentGateway ?? "").toLowerCase();
  const methodCore = String(r.corePaymentMethod ?? "").toLowerCase();
  const methodPay = String(r.paymentMethod ?? "").toLowerCase();
  const postTrip = isPostTripCollectedOrderType(r.orderType);

  if (gatewayAmt <= 0.005 && paidRow > 0.005 && (gw === "razorpay" || gw === "upi" || gw === "card")) {
    gatewayAmt = paidRow;
  }
  if (gatiCash <= 0.005 && paidRow > 0.005 && (gw === "gati_cash" || gw === "wallet")) {
    gatiCash = paidRow;
  }
  if (
    gatiCash <= 0.005 &&
    gatewayAmt <= 0.005 &&
    paidRow > 0.005 &&
    (gw === "online" ||
      gw === "mixed" ||
      methodCore === "wallet" ||
      methodCore === "gati_cash" ||
      methodPay === "wallet" ||
      methodPay === "gati_cash" ||
      !gw)
  ) {
    gatiCash = paidRow;
  }

  const fromBreakdown = round2(gatiCash + gatewayAmt);
  if (fromBreakdown > 0.005) return fromBreakdown;
  if (paidRow > 0.005) return round2(paidRow);

  const gross = num(r.grandTotal);
  const corePayStatus = String(r.corePaymentStatus ?? "").toUpperCase();
  const coreMarkedPaid = ["PAID", "CAPTURED", "SUCCESS", "COMPLETED"].includes(corePayStatus);
  // Post-trip "PAID" without a capture row is still unpaid fare.
  if (coreMarkedPaid && gross > 0.005 && !postTrip) return round2(gross);
  if (postTrip) return 0;

  const methodLooksPrepaid =
    methodCore === "wallet" ||
    methodCore === "gati_cash" ||
    methodCore === "online" ||
    methodCore === "upi" ||
    methodCore === "card" ||
    methodCore === "prepaid" ||
    methodPay === "wallet" ||
    methodPay === "gati_cash" ||
    methodPay === "upi" ||
    methodPay === "card" ||
    gw === "razorpay" ||
    gw === "online" ||
    gw === "mixed" ||
    gw === "upi" ||
    gw === "card";
  if (methodLooksPrepaid && gross > 0.005) return round2(gross);

  if (gw === "cod" || gw === "cash" || methodCore === "cod" || methodCore === "cash") return 0;
  return gross > 0.005 ? round2(gross) : 0;
}
