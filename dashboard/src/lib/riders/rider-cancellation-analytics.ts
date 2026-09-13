/**
 * Pure rider cancellation-analytics engine.
 *
 * Consumes already-aggregated, rider-scoped, deduplicated counts (one unique
 * rider-accepted order counted once) and produces the full service-wise + overall
 * cancellation model. No DB access, no I/O — fully unit-testable.
 *
 * Denominators (never mixed — see spec §6/§7):
 *   - Cancellation Rate       = cancelled / accepted
 *   - Rider-Fault Rate        = riderFault / accepted
 *   - Rider-Fault Share       = riderFault / cancelled
 *   - Rider-Fault Pre Rate    = riderFaultPre / accepted
 *   - Rider-Fault Pre Share   = riderFaultPre / riderFault
 *
 * Rates are computed at full precision from raw counts and rounded to 2dp ONLY on
 * output. A zero denominator yields `null` (render as "N/A"), never NaN / Infinity / 100%.
 * Overall figures are computed from summed counts, never by averaging service rates (§12/§13).
 */

import {
  CANCELLATION_RESPONSIBILITIES,
  type CancellationResponsibility,
} from "./cancellation-responsibility";

export type PickupStage = "PRE_PICKUP" | "POST_PICKUP";

/** One aggregated cancellation bucket for a service. */
export type CancellationCountRow = {
  service: string;
  stage: PickupStage;
  responsibility: CancellationResponsibility;
  count: number;
};

/** Accepted-order totals per service (the primary denominator). */
export type AcceptedCountRow = {
  service: string;
  accepted: number;
};

export type FaultBreakdown = Record<CancellationResponsibility, number>;

export type StageBreakdown = {
  total: number;
  byFault: FaultBreakdown;
};

export type ServiceCancellationAnalytics = {
  service: string;
  accepted: number;
  cancelled: number;
  /** cancelled / accepted × 100, or null when accepted = 0. */
  cancellationRate: number | null;

  prePickup: number;
  postPickup: number;

  riderFault: number;
  /** riderFault / accepted × 100, or null when accepted = 0. */
  riderFaultRate: number | null;
  /** riderFault / cancelled × 100, or null when cancelled = 0. */
  riderFaultShare: number | null;

  riderFaultPrePickup: number;
  riderFaultPostPickup: number;
  /** riderFaultPre / accepted × 100 (null when accepted = 0). */
  riderFaultPrePickupRate: number | null;
  riderFaultPostPickupRate: number | null;
  /** riderFaultPre / riderFault × 100 (null when riderFault = 0). */
  riderFaultPrePickupShare: number | null;
  riderFaultPostPickupShare: number | null;

  /** Full responsibility matrix, reconciling to `cancelled`. */
  byFault: FaultBreakdown;
  breakdown: {
    prePickup: StageBreakdown;
    postPickup: StageBreakdown;
  };
};

export type OverallCancellationAnalytics = {
  accepted: number;
  cancelled: number;
  cancellationRate: number | null;
  prePickup: number;
  postPickup: number;
  riderFault: number;
  riderFaultRate: number | null;
  riderFaultShare: number | null;
  riderFaultPrePickup: number;
  riderFaultPostPickup: number;
  byFault: FaultBreakdown;
};

export type RiderCancellationAnalytics = {
  overall: OverallCancellationAnalytics;
  services: Record<string, ServiceCancellationAnalytics>;
  /** Present when totals fail an internal reconciliation invariant (should never happen). */
  reconciliationErrors?: string[];
};

function emptyFaultBreakdown(): FaultBreakdown {
  return {
    RIDER_FAULT: 0,
    CUSTOMER_FAULT: 0,
    MERCHANT_FAULT: 0,
    COMPANY_FAULT: 0,
    SYSTEM_FAULT: 0,
    UNKNOWN: 0,
  };
}

/** Safe percentage: null when denominator is 0 (renders as N/A). Full precision, rounded 2dp. */
export function percentage(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  const pct = (numerator / denominator) * 100;
  return Math.round(pct * 100) / 100;
}

function toCount(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.trunc(v);
}

type ServiceAccumulator = {
  service: string;
  accepted: number;
  pre: FaultBreakdown;
  post: FaultBreakdown;
};

function buildServiceAnalytics(acc: ServiceAccumulator): ServiceCancellationAnalytics {
  const byFault = emptyFaultBreakdown();
  let prePickup = 0;
  let postPickup = 0;
  for (const r of CANCELLATION_RESPONSIBILITIES) {
    byFault[r] = acc.pre[r] + acc.post[r];
    prePickup += acc.pre[r];
    postPickup += acc.post[r];
  }
  const cancelled = prePickup + postPickup;
  const riderFaultPre = acc.pre.RIDER_FAULT;
  const riderFaultPost = acc.post.RIDER_FAULT;
  const riderFault = riderFaultPre + riderFaultPost;

  return {
    service: acc.service,
    accepted: acc.accepted,
    cancelled,
    cancellationRate: percentage(cancelled, acc.accepted),
    prePickup,
    postPickup,
    riderFault,
    riderFaultRate: percentage(riderFault, acc.accepted),
    riderFaultShare: percentage(riderFault, cancelled),
    riderFaultPrePickup: riderFaultPre,
    riderFaultPostPickup: riderFaultPost,
    riderFaultPrePickupRate: percentage(riderFaultPre, acc.accepted),
    riderFaultPostPickupRate: percentage(riderFaultPost, acc.accepted),
    riderFaultPrePickupShare: percentage(riderFaultPre, riderFault),
    riderFaultPostPickupShare: percentage(riderFaultPost, riderFault),
    byFault,
    breakdown: {
      prePickup: { total: prePickup, byFault: { ...acc.pre } },
      postPickup: { total: postPickup, byFault: { ...acc.post } },
    },
  };
}

/**
 * Build the full analytics model.
 *
 * @param services  ordered service keys to always emit (e.g. food, parcel, person_ride),
 *                  so a rider with zero orders in a service still gets a zeroed card.
 */
export function computeRiderCancellationAnalytics(input: {
  services: string[];
  accepted: AcceptedCountRow[];
  cancellations: CancellationCountRow[];
}): RiderCancellationAnalytics {
  const accumulators = new Map<string, ServiceAccumulator>();
  const ensure = (service: string): ServiceAccumulator => {
    let a = accumulators.get(service);
    if (!a) {
      a = { service, accepted: 0, pre: emptyFaultBreakdown(), post: emptyFaultBreakdown() };
      accumulators.set(service, a);
    }
    return a;
  };

  // Seed the requested services so zero-order services still render.
  for (const s of input.services) ensure(s);

  for (const row of input.accepted) {
    ensure(row.service).accepted += toCount(row.accepted);
  }
  for (const row of input.cancellations) {
    const a = ensure(row.service);
    const target = row.stage === "POST_PICKUP" ? a.post : a.pre;
    target[row.responsibility] += toCount(row.count);
  }

  // Keep declared services first, then any extra services present only in data.
  const orderedKeys = [
    ...input.services,
    ...[...accumulators.keys()].filter((k) => !input.services.includes(k)),
  ];

  const services: Record<string, ServiceCancellationAnalytics> = {};
  const overallByFault = emptyFaultBreakdown();
  let oAccepted = 0;
  let oPre = 0;
  let oPost = 0;
  for (const key of orderedKeys) {
    const svc = buildServiceAnalytics(ensure(key));
    services[key] = svc;
    oAccepted += svc.accepted;
    oPre += svc.prePickup;
    oPost += svc.postPickup;
    for (const r of CANCELLATION_RESPONSIBILITIES) overallByFault[r] += svc.byFault[r];
  }

  const oCancelled = oPre + oPost;
  const oRiderFaultPre = orderedKeys.reduce((s, k) => s + services[k].riderFaultPrePickup, 0);
  const oRiderFaultPost = orderedKeys.reduce((s, k) => s + services[k].riderFaultPostPickup, 0);
  const oRiderFault = oRiderFaultPre + oRiderFaultPost;

  const overall: OverallCancellationAnalytics = {
    accepted: oAccepted,
    cancelled: oCancelled,
    cancellationRate: percentage(oCancelled, oAccepted),
    prePickup: oPre,
    postPickup: oPost,
    riderFault: oRiderFault,
    riderFaultRate: percentage(oRiderFault, oAccepted),
    riderFaultShare: percentage(oRiderFault, oCancelled),
    riderFaultPrePickup: oRiderFaultPre,
    riderFaultPostPickup: oRiderFaultPost,
    byFault: overallByFault,
  };

  const reconciliationErrors = collectReconciliationErrors(services, overall);

  return {
    overall,
    services,
    ...(reconciliationErrors.length ? { reconciliationErrors } : {}),
  };
}

/** Internal invariant checks (spec §9/§27). Should always pass; surfaced for auditability. */
function collectReconciliationErrors(
  services: Record<string, ServiceCancellationAnalytics>,
  overall: OverallCancellationAnalytics
): string[] {
  const errors: string[] = [];
  let sumAccepted = 0;
  let sumCancelled = 0;
  let sumRiderFault = 0;
  for (const [key, s] of Object.entries(services)) {
    if (s.cancelled > s.accepted) {
      errors.push(`${key}: cancelled (${s.cancelled}) > accepted (${s.accepted})`);
    }
    if (s.prePickup + s.postPickup !== s.cancelled) {
      errors.push(`${key}: pre+post (${s.prePickup}+${s.postPickup}) != cancelled (${s.cancelled})`);
    }
    const faultSum = CANCELLATION_RESPONSIBILITIES.reduce((n, r) => n + s.byFault[r], 0);
    if (faultSum !== s.cancelled) {
      errors.push(`${key}: fault sum (${faultSum}) != cancelled (${s.cancelled})`);
    }
    if (s.riderFaultPrePickup + s.riderFaultPostPickup !== s.riderFault) {
      errors.push(`${key}: riderFault pre+post != riderFault (${s.riderFault})`);
    }
    sumAccepted += s.accepted;
    sumCancelled += s.cancelled;
    sumRiderFault += s.riderFault;
  }
  if (sumAccepted !== overall.accepted) {
    errors.push(`overall accepted (${overall.accepted}) != sum services (${sumAccepted})`);
  }
  if (sumCancelled !== overall.cancelled) {
    errors.push(`overall cancelled (${overall.cancelled}) != sum services (${sumCancelled})`);
  }
  if (sumRiderFault !== overall.riderFault) {
    errors.push(`overall riderFault (${overall.riderFault}) != sum services (${sumRiderFault})`);
  }
  return errors;
}
