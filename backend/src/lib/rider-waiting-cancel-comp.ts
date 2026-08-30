/**
 * Rider waiting cancellation compensation tiers (Step 5 / §11).
 *
 * Your rule: if the rider CANCELS after waiting (order still not ready), they get the
 * FIRST-MILE (pre-pickup) only — never the waiting. If the rider CONTINUES and the order
 * then completes, they get first-mile + waiting + the order fare. Pure + unit-testable; the
 * cancel flow feeds it the amounts and applies the result via the existing wallet-credit path.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type WaitingOutcome = "rider_cancel" | "continue_completed";

export type WaitingCompensation = {
  firstMile: number;
  waiting: number;
  fare: number;
  total: number;
  reason: string;
};

export function resolveWaitingCancellationCompensation(args: {
  outcome: WaitingOutcome;
  /** Pre-pickup / first-mile allowance already earned by reaching the store. */
  prePickupAmount: number;
  /** Waiting earned so far (only paid if the rider stays and completes). */
  waitingAmount: number;
  /** Post-pickup order fare (only when the order actually completes). */
  orderFareAmount: number;
}): WaitingCompensation {
  const firstMile = Math.max(0, Number(args.prePickupAmount) || 0);

  if (args.outcome === "rider_cancel") {
    // Cancelled after waiting → first-mile ONLY. No waiting, no fare (order not delivered).
    return {
      firstMile: round2(firstMile),
      waiting: 0,
      fare: 0,
      total: round2(firstMile),
      reason: "cancel_first_mile_only",
    };
  }

  // Rider continued and the order completed → first-mile + waiting + fare.
  const waiting = Math.max(0, Number(args.waitingAmount) || 0);
  const fare = Math.max(0, Number(args.orderFareAmount) || 0);
  return {
    firstMile: round2(firstMile),
    waiting: round2(waiting),
    fare: round2(fare),
    total: round2(firstMile + waiting + fare),
    reason: "completed_first_mile_plus_waiting_plus_fare",
  };
}
