/**
 * PURE rider cancellation-rate auto-block policy.
 *
 * A rider is blocked for a service when ALL hold:
 *   - the service rule is enabled,
 *   - the rider has at least `minAccepted` accepted orders for the service,
 *   - the rider has at least one rider-fault cancellation (a 0% rate never blocks,
 *     even at a 0% threshold — you cannot be "at fault" with no fault cancellations),
 *   - the rider-fault cancellation rate is >= the admin threshold ("reaching it blocks").
 *
 * Only rider-fault cancellations feed the rate — customer / merchant / system / unknown
 * cancellations never count toward a block. The rate is computed at full precision from
 * counts; no rounding is applied before the comparison.
 */

export type RiderCancellationBlockConfig = {
  enabled: boolean;
  thresholdPct: number;
  minAccepted: number;
};

export type RiderServiceFaultStats = {
  accepted: number;
  riderFault: number;
};

export type CancellationBlockDecision = {
  shouldBlock: boolean;
  riderFaultRate: number;
  reason:
    | "rate_at_or_above_threshold"
    | "below_threshold"
    | "below_min_accepted"
    | "no_rider_fault"
    | "disabled";
};

function safeInt(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.trunc(v);
}

/** Full-precision rider-fault rate (percent). 0 when no accepted orders. */
export function riderFaultRate(stats: RiderServiceFaultStats): number {
  const accepted = safeInt(stats.accepted);
  const riderFault = safeInt(stats.riderFault);
  if (accepted <= 0) return 0;
  return (riderFault / accepted) * 100;
}

export function evaluateCancellationBlock(
  config: RiderCancellationBlockConfig,
  stats: RiderServiceFaultStats
): CancellationBlockDecision {
  const accepted = safeInt(stats.accepted);
  const riderFault = safeInt(stats.riderFault);
  const rate = riderFaultRate({ accepted, riderFault });

  if (!config.enabled) {
    return { shouldBlock: false, riderFaultRate: rate, reason: "disabled" };
  }
  if (riderFault <= 0) {
    return { shouldBlock: false, riderFaultRate: rate, reason: "no_rider_fault" };
  }
  if (accepted < Math.max(0, safeInt(config.minAccepted))) {
    return { shouldBlock: false, riderFaultRate: rate, reason: "below_min_accepted" };
  }
  // "Reaching it blocks" — rate >= threshold.
  if (rate >= Number(config.thresholdPct)) {
    return { shouldBlock: true, riderFaultRate: rate, reason: "rate_at_or_above_threshold" };
  }
  return { shouldBlock: false, riderFaultRate: rate, reason: "below_threshold" };
}
