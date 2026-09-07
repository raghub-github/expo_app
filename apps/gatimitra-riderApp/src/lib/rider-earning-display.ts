import type { RiderOrderSummary } from "@/src/services/api/riderApi";

type RiderEarningLike = Pick<
  RiderOrderSummary,
  | "totalEarning"
  | "estimatedEarning"
  | "baseEarning"
  | "waitingEarning"
  | "surgeEarning"
  | "customerTipAmount"
  | "appliedSurges"
> & {
  totalEarning?: number | null;
};

export type RiderEarningBreakdownLine = {
  label: string;
  amount: number;
  emphasis?: boolean;
};

export type RiderEarningBreakdown = {
  baseEarning: number;
  waitingEarning: number;
  surgeEarning: number;
  tipAmount: number;
  totalEarning: number;
  appliedSurges: { name: string; amount: number }[];
  lines: RiderEarningBreakdownLine[];
};

function round0(n: number): number {
  return Math.round(n);
}

/** Rider-facing payout from backend slab engine — display only, never recalculate from distance. */
export function resolveRiderDisplayedEarning(
  order: RiderEarningLike | null | undefined
): number {
  if (!order) return 0;
  const total = Number(order.totalEarning);
  if (Number.isFinite(total) && total > 0) return round0(total);
  const estimated = Number(order.estimatedEarning);
  if (Number.isFinite(estimated) && estimated > 0) return round0(estimated);
  const base = round0(Number(order.baseEarning) || 0);
  const waiting = round0(Number(order.waitingEarning) || 0);
  const surge = round0(Number(order.surgeEarning) || 0);
  const tip = round0(Number(order.customerTipAmount) || 0);
  return base + waiting + surge + tip;
}

function buildRiderEarningBreakdownInternal(
  order: RiderEarningLike | null | undefined,
  baseLabel: string,
  t?: (key: string, fallback: string) => string
): RiderEarningBreakdown {
  const baseEarning = round0(Number(order?.baseEarning) || 0);
  const waitingEarning = round0(Number(order?.waitingEarning) || 0);
  const surgeEarning = round0(Number(order?.surgeEarning) || 0);
  const tipAmount = round0(Number(order?.customerTipAmount) || 0);
  const appliedSurges = (order?.appliedSurges ?? []).filter(
    (line) => line.name.trim().length > 0 && line.amount > 0
  );
  const totalEarning = resolveRiderDisplayedEarning(order);

  // Build a breakdown that ALWAYS sums to the total. The primary fare line is DERIVED as
  // total − (waiting + surge + tip), NOT the raw `baseEarning` field: that field carries the
  // legacy percentage-of-fare pool base, while `totalEarning` is the v3.2 distance-leg payout
  // (first-mile + trip distance, company-funded). Showing the raw base alongside the leg total
  // left an unexplained gap (e.g. "Base fare ₹39" but "Total ₹89"). The derived fare covers the
  // first-mile + distance earning and, with the extras below, adds up exactly to the total.
  const surgeShown = appliedSurges.length > 0
    ? appliedSurges.reduce((sum, s) => sum + round0(s.amount), 0)
    : surgeEarning;
  const primaryFare = Math.max(0, totalEarning - waitingEarning - surgeShown - tipAmount);

  const lines: RiderEarningBreakdownLine[] = [];
  lines.push({
    label: baseLabel,
    amount: primaryFare,
  });
  if (waitingEarning > 0) {
    lines.push({
      label: t?.("orders.rideSuccess.waitingCharge", "Waiting charge") ?? "Waiting charge",
      amount: waitingEarning,
    });
  }
  if (appliedSurges.length > 0) {
    for (const surge of appliedSurges) {
      lines.push({ label: surge.name, amount: round0(surge.amount) });
    }
  } else if (surgeEarning > 0) {
    lines.push({
      label: t?.("orders.rideSuccess.surgeBonus", "Surge bonus") ?? "Surge bonus",
      amount: surgeEarning,
    });
  }
  if (tipAmount > 0) {
    lines.push({
      label: t?.("orders.deliverySuccess.tip", "Customer tip") ?? "Customer tip",
      amount: tipAmount,
    });
  }
  lines.push({
    label: t?.("orders.ridePaymentWait.totalEarning", "Total earning") ?? "Total earning",
    amount: totalEarning,
    emphasis: true,
  });

  return {
    baseEarning,
    waitingEarning,
    surgeEarning,
    tipAmount,
    totalEarning,
    appliedSurges,
    lines,
  };
}

export function buildRiderRideEarningBreakdown(
  order: RiderEarningLike | null | undefined,
  t?: (key: string, fallback: string) => string
): RiderEarningBreakdown {
  return buildRiderEarningBreakdownInternal(
    order,
    t?.("orders.ridePaymentWait.rideFare", "Ride fare") ?? "Ride fare",
    t
  );
}

export function buildRiderDeliveryEarningBreakdown(
  order: RiderEarningLike | null | undefined,
  t?: (key: string, fallback: string) => string
): RiderEarningBreakdown {
  return buildRiderEarningBreakdownInternal(
    order,
    t?.("orders.deliverySuccess.deliveryFee", "Delivery Fee") ?? "Delivery Fee",
    t
  );
}

export function formatRiderDisplayedEarning(
  order: RiderEarningLike | null | undefined
): string {
  const amount = resolveRiderDisplayedEarning(order);
  if (amount <= 0) return "";
  return `₹${amount.toLocaleString("en-IN")}`;
}
