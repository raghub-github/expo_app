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

  const lines: RiderEarningBreakdownLine[] = [];
  if (baseEarning > 0) {
    lines.push({
      label: baseLabel,
      amount: baseEarning,
    });
  }
  if (waitingEarning > 0) {
    lines.push({
      label: t?.("orders.rideSuccess.waitingCharge", "Waiting charge") ?? "Waiting charge",
      amount: waitingEarning,
    });
  }
  if (appliedSurges.length > 0) {
    for (const surge of appliedSurges) {
      lines.push({ label: surge.name, amount: surge.amount });
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
    t?.("orders.ridePaymentWait.baseFare", "Base fare") ?? "Base fare",
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
