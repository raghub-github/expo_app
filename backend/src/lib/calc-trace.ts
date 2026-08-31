/**
 * calc_trace — the per-order, per-engine record of HOW a fare/payout was
 * resolved: which geo node, which rule, at what basis. Stamped onto the order's
 * frozen snapshot so any disputed order can be fully reconstructed later without
 * re-deriving from live (mutable) rules. Additive and immutable — one entry per
 * engine; the first authoritative resolution wins (see appendCalcTrace).
 *
 * See the Order Calculation Blueprint reference for the full flow.
 */

export type CalcTraceEngine = "rider_payout" | "customer_billing";

export type CalcTraceEntry = {
  engine: CalcTraceEngine;
  /** ride | food | parcel */
  service: string;
  /** The geo node the rule was resolved at (after nearest-ancestor inheritance). */
  resolvedGeo: { level: string; refId: string } | null;
  /** Identity of the rule row that priced this leg. */
  ruleId: number | null;
  rulePriority: number | null;
  /** Rider share % applied against the gross basis (rider_payout only). */
  riderPct: number | null;
  /** Gross (pre-discount) basis the split was computed from. */
  grossBasis: number | null;
  /** A rule existed at resolution time (service effectively ON for this leg). */
  serviceOn: boolean;
  vehicleType: string | null;
  ts: string;
};

/** Fields the rider payout resolver exposes for tracing. */
export type RiderPayoutTrace = {
  level: string;
  refId: string;
  ruleId: number | null;
  rulePriority: number | null;
  riderPercentage: number | null;
  grossBasis: number;
  vehicleType: string | null;
};

export function buildRiderCalcTraceEntry(
  service: string,
  trace: RiderPayoutTrace | null | undefined
): CalcTraceEntry | null {
  if (!trace) return null;
  return {
    engine: "rider_payout",
    service,
    resolvedGeo: trace.level && trace.refId ? { level: trace.level, refId: trace.refId } : null,
    ruleId: trace.ruleId ?? null,
    rulePriority: trace.rulePriority ?? null,
    riderPct: trace.riderPercentage ?? null,
    grossBasis: Number.isFinite(trace.grossBasis) ? trace.grossBasis : null,
    serviceOn: true, // a rule resolved → the service was ON at this node
    vehicleType: trace.vehicleType ?? null,
    ts: new Date().toISOString(),
  };
}

/**
 * Immutably fold a calc_trace entry into a billing_snapshot. calc_trace is an
 * object keyed by engine; the first authoritative entry per engine is frozen and
 * never overwritten (idempotent on completion retries / app restart).
 */
export function appendCalcTrace(
  billingSnapshot: unknown,
  entry: CalcTraceEntry | null
): Record<string, unknown> {
  const snap =
    billingSnapshot != null && typeof billingSnapshot === "object"
      ? { ...(billingSnapshot as Record<string, unknown>) }
      : {};
  if (!entry) return snap;

  const prior =
    snap.calc_trace != null && typeof snap.calc_trace === "object"
      ? { ...(snap.calc_trace as Record<string, unknown>) }
      : {};
  // Freeze-once per engine — keep the first authoritative resolution.
  if (prior[entry.engine] == null) {
    prior[entry.engine] = entry;
  }
  snap.calc_trace = prior;
  return snap;
}

export function readCalcTrace(
  billingSnapshot: unknown,
  engine: CalcTraceEngine
): CalcTraceEntry | null {
  if (billingSnapshot == null || typeof billingSnapshot !== "object") return null;
  const ct = (billingSnapshot as Record<string, unknown>).calc_trace;
  if (ct == null || typeof ct !== "object") return null;
  const e = (ct as Record<string, unknown>)[engine];
  return e != null && typeof e === "object" ? (e as CalcTraceEntry) : null;
}
