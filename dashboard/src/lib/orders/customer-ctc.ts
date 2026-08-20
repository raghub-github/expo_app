/**
 * Customer CTC (Cost To Customer) = Cashin + GatiCash.
 *
 * `orders_core.grand_total` is the gateway / to-pay remainder AFTER GatiCash
 * settlement. Treating that alone as CTC makes full-wallet orders show ₹0 and
 * blocks refunds. GatiCash is a payment instrument, never a discount.
 */

export function roundCtcMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Read GatiCash applied from billing snapshot / checkout metadata. */
export function extractGatiCashAppliedFromBilling(
  billing: Record<string, unknown> | null | undefined,
  checkoutMeta?: Record<string, unknown> | null
): number {
  if (billing && typeof billing === "object") {
    const direct =
      asNum(billing.gati_cash_applied) ||
      asNum(billing.gatiCashApplied) ||
      asNum(billing.gati_cash_amount) ||
      asNum(billing.gatiCashAmount);
    if (direct > 0.005) return roundCtcMoney(direct);

    const adj = billing.checkout_adjustments ?? billing.checkoutAdjustments;
    if (adj && typeof adj === "object") {
      const a = adj as Record<string, unknown>;
      const fromAdj = asNum(a.gatiCashApplied) || asNum(a.gati_cash_applied);
      if (fromAdj > 0.005) return roundCtcMoney(fromAdj);
      const lines = Array.isArray(a.lines) ? a.lines : [];
      let sum = 0;
      for (const line of lines) {
        if (!line || typeof line !== "object") continue;
        const row = line as Record<string, unknown>;
        if (String(row.kind ?? "") !== "gati_cash_applied") continue;
        sum += Math.abs(asNum(row.amount));
      }
      if (sum > 0.005) return roundCtcMoney(sum);
    }

    const meta = billing.checkout_metadata ?? billing.checkoutMetadata;
    if (meta && typeof meta === "object") {
      const fromMeta =
        asNum((meta as Record<string, unknown>).gatiCashAmount) ||
        asNum((meta as Record<string, unknown>).gati_cash_amount);
      if (fromMeta > 0.005) return roundCtcMoney(fromMeta);
    }
  }

  if (checkoutMeta && typeof checkoutMeta === "object") {
    const fromMeta =
      asNum(checkoutMeta.gatiCashAmount) || asNum(checkoutMeta.gati_cash_amount);
    if (fromMeta > 0.005) return roundCtcMoney(fromMeta);
  }

  return 0;
}

/**
 * Full amount paid by the customer.
 * CTC = Cashin (gateway/COD remainder) + GatiCash used.
 */
export function resolveCustomerCtcPaidAmount(args: {
  /** Post-wallet payable (`orders_core.grand_total`). */
  netPayable?: number | null;
  gatiCashUsed?: number | null;
  /** Optional payment-row amount when net+gati is still empty. */
  capturedAmount?: number | null;
}): {
  ctc: number;
  cashin: number;
  gatiCashUsed: number;
} {
  const gati = roundCtcMoney(Math.max(0, asNum(args.gatiCashUsed)));
  const net = roundCtcMoney(Math.max(0, asNum(args.netPayable)));
  let ctc = roundCtcMoney(net + gati);
  const captured = roundCtcMoney(Math.max(0, asNum(args.capturedAmount)));
  if (ctc <= 0.005 && captured > 0.005) {
    ctc = captured;
  }
  const cashin = roundCtcMoney(Math.max(0, ctc - gati));
  return { ctc, cashin, gatiCashUsed: gati };
}

/**
 * Refund amount split into cash/card + GatiCash, matching CTC icon row.
 * Prefers recorded refund split columns; otherwise uses original payment mix.
 */
export function resolveRefundCoinCashSplit(args: {
  refundAmount: number;
  originalCashin: number;
  originalGatiCash: number;
  refunds?: Array<{
    splitWalletAmount?: number | null;
    splitRazorpayAmount?: number | null;
  }>;
}): { cashin: number; gatiCashUsed: number } {
  const total = roundCtcMoney(Math.max(0, asNum(args.refundAmount)));
  let wallet = 0;
  let gateway = 0;
  for (const row of args.refunds ?? []) {
    wallet += Math.max(0, asNum(row.splitWalletAmount));
    gateway += Math.max(0, asNum(row.splitRazorpayAmount));
  }
  wallet = roundCtcMoney(wallet);
  gateway = roundCtcMoney(gateway);
  if (wallet > 0.005 || gateway > 0.005) {
    const recorded = roundCtcMoney(wallet + gateway);
    if (recorded < total - 0.005) {
      const missing = roundCtcMoney(total - recorded);
      if (wallet <= 0.005) gateway = roundCtcMoney(gateway + missing);
      else if (gateway <= 0.005) wallet = roundCtcMoney(wallet + missing);
      else gateway = roundCtcMoney(gateway + missing);
    }
    const coins = roundCtcMoney(Math.min(total, wallet));
    return { cashin: roundCtcMoney(Math.max(0, total - coins)), gatiCashUsed: coins };
  }
  const origGati = roundCtcMoney(Math.max(0, asNum(args.originalGatiCash)));
  const coins = roundCtcMoney(Math.min(total, origGati));
  return { cashin: roundCtcMoney(Math.max(0, total - coins)), gatiCashUsed: coins };
}

/** Prefer icon split UI (`CustomerCtcIconSplit`) over this string helper. */
export function formatCustomerCtcWithSplit(
  ctc: number,
  cashin: number,
  gatiCashUsed: number,
  formatCurrency: (n: number) => string
): string {
  const total = formatCurrency(ctc);
  if (gatiCashUsed <= 0.005) return total;
  return total;
}
