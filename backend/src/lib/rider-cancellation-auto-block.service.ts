/**
 * Rider-fault cancellation SLAB auto-block engine (backend side effects).
 *
 * Applies the Super-Admin per-service slab policy: at a rider's CUMULATIVE accepted-order
 * count for a service, pick the matching slab; if that slab blocks and the rider's lifetime
 * RIDER-FAULT cancellation rate reaches its threshold, block the rider for that service only.
 * The decision itself is the shared, integer-safe engine in @gatimitra/financial-rules
 * (evaluateCancellationSlabPolicy) — identical to what the dashboard shows.
 *
 * Blocks are presence rows in rider_cancellation_service_blocks (merged into
 * getRiderAccountRestrictions → assignment-engine exclusion). Every transition is logged to
 * rider_service_block_history with slab + policy_version for audit. Duty re-syncs so a newly
 * blocked service drops immediately. Manual blacklist blocks are a separate system and are
 * never touched here; releasing is rule-governed only (re-evaluation under the current policy).
 */

import {
  evaluateCancellationSlabPolicy,
  type CancellationSlab,
  type CancellationSlabPolicy,
} from "@gatimitra/financial-rules";
import { getSql } from "../db/client.js";
import {
  AUTO_BLOCK_SERVICES,
  getRiderFaultStatsByService,
  getRidersWithServiceCancellations,
  type AutoBlockService,
  type ServiceFaultStats,
} from "./rider-cancellation-fault-stats.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Load per-service slab policy (defaults to disabled/empty if rows are missing). */
export async function loadCancellationSlabPolicy(): Promise<
  Map<AutoBlockService, CancellationSlabPolicy>
> {
  const sql = getSql();
  const map = new Map<AutoBlockService, CancellationSlabPolicy>();
  for (const s of AUTO_BLOCK_SERVICES) {
    map.set(s, { enabled: false, policyVersion: 1, slabs: [] });
  }
  try {
    const [headers, slabRows] = await Promise.all([
      sql`
        SELECT service_type, enabled, policy_version
        FROM rider_cancellation_policy
        WHERE service_type IN ('food','parcel','person_ride')
      ` as unknown as Promise<
        { service_type: AutoBlockService; enabled: boolean; policy_version: number }[]
      >,
      sql`
        SELECT service_type, slab_number, min_accepted, max_accepted,
               blocking_enabled, threshold_pct::float8 AS threshold_pct
        FROM rider_cancellation_policy_slabs
        WHERE service_type IN ('food','parcel','person_ride')
        ORDER BY service_type, min_accepted
      ` as unknown as Promise<
        {
          service_type: AutoBlockService;
          slab_number: number;
          min_accepted: number;
          max_accepted: number | null;
          blocking_enabled: boolean;
          threshold_pct: number;
        }[]
      >,
    ]);

    const slabsByService = new Map<AutoBlockService, CancellationSlab[]>();
    for (const r of slabRows) {
      const list = slabsByService.get(r.service_type) ?? [];
      list.push({
        slabNumber: Number(r.slab_number),
        minAccepted: Number(r.min_accepted),
        maxAccepted: r.max_accepted == null ? null : Number(r.max_accepted),
        blockingEnabled: r.blocking_enabled === true,
        thresholdPct: Number(r.threshold_pct),
      });
      slabsByService.set(r.service_type, list);
    }
    for (const h of headers) {
      map.set(h.service_type, {
        enabled: h.enabled === true,
        policyVersion: Number(h.policy_version) || 1,
        slabs: slabsByService.get(h.service_type) ?? [],
      });
    }
  } catch (err) {
    console.warn("[cancellation-auto-block] policy load failed; treating as disabled", err);
  }
  return map;
}

async function isBlocked(riderId: number, service: AutoBlockService): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 AS ok FROM rider_cancellation_service_blocks
    WHERE rider_id = ${riderId} AND service_type = ${service} LIMIT 1
  `) as unknown as { ok: number }[];
  return rows.length > 0;
}

async function logHistory(input: {
  riderId: number;
  service: AutoBlockService;
  action: "blocked" | "unblocked";
  stats: ServiceFaultStats;
  rate: number;
  slabNumber: number | null;
  thresholdPct: number | null;
  policyVersion: number;
  reason: string;
}): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      INSERT INTO rider_service_block_history
        (rider_id, service_type, action, reason, performed_by, metadata)
      VALUES (
        ${input.riderId}, ${input.service}, ${input.action},
        ${input.reason}, 'system',
        ${JSON.stringify({
          source: "cancellation_rate_auto_block",
          policyVersion: input.policyVersion,
          slab: input.slabNumber,
          riderFaultRate: round2(input.rate),
          thresholdPct: input.thresholdPct,
          accepted: input.stats.accepted,
          cancelled: input.stats.cancelled,
          riderFault: input.stats.riderFault,
        })}::text::jsonb
      )
    `;
  } catch (err) {
    console.warn("[cancellation-auto-block] history log failed", err);
  }
}

/** Re-sync duty so a newly blocked service is dropped (or restored) without waiting. */
async function resyncDuty(riderId: number): Promise<void> {
  try {
    const { syncRiderDutyWithRestrictions } = await import("./rider-account-restrictions.js");
    await syncRiderDutyWithRestrictions(riderId);
  } catch (err) {
    console.warn("[cancellation-auto-block] duty resync failed", err);
  }
}

export type ServiceEvaluationResult = {
  service: AutoBlockService;
  changed: boolean;
  blocked: boolean;
  riderFaultRate: number;
  slabNumber: number | null;
};

/** Evaluate + reconcile one rider+service against the current slab policy. */
export async function evaluateRiderServiceBlock(
  riderId: number,
  service: AutoBlockService,
  policy: CancellationSlabPolicy,
  stats: ServiceFaultStats
): Promise<ServiceEvaluationResult> {
  const sql = getSql();
  const decision = evaluateCancellationSlabPolicy({
    enabled: policy.enabled,
    slabs: policy.slabs,
    accepted: stats.accepted,
    riderFault: stats.riderFault,
  });
  const slabNumber = decision.currentSlab?.slabNumber ?? null;
  const currentlyBlocked = await isBlocked(riderId, service);

  if (decision.shouldBlock && !currentlyBlocked) {
    await sql`
      INSERT INTO rider_cancellation_service_blocks
        (rider_id, service_type, threshold_pct, rider_fault_rate, accepted_count,
         cancelled_count, rider_fault_count, slab_number, policy_version, reason)
      VALUES (
        ${riderId}, ${service}, ${decision.thresholdPct ?? 0}, ${round2(decision.ratePct)},
        ${stats.accepted}, ${stats.cancelled}, ${stats.riderFault},
        ${slabNumber}, ${policy.policyVersion}, 'cancellation_rate_exceeded'
      )
      ON CONFLICT (rider_id, service_type) DO NOTHING
    `;
    await logHistory({
      riderId, service, action: "blocked", stats,
      rate: decision.ratePct, slabNumber, thresholdPct: decision.thresholdPct,
      policyVersion: policy.policyVersion,
      reason: `slab_${slabNumber ?? "?"}_rate_${round2(decision.ratePct)}pct_ge_threshold_${decision.thresholdPct ?? "?"}pct`,
    });
    await resyncDuty(riderId);
    return { service, changed: true, blocked: true, riderFaultRate: decision.ratePct, slabNumber };
  }

  if (!decision.shouldBlock && currentlyBlocked) {
    await sql`
      DELETE FROM rider_cancellation_service_blocks
      WHERE rider_id = ${riderId} AND service_type = ${service}
    `;
    await logHistory({
      riderId, service, action: "unblocked", stats,
      rate: decision.ratePct, slabNumber, thresholdPct: decision.thresholdPct,
      policyVersion: policy.policyVersion,
      reason:
        decision.reason === "policy_disabled"
          ? "policy_disabled"
          : `slab_${slabNumber ?? "?"}_rate_${round2(decision.ratePct)}pct_below_threshold`,
    });
    await resyncDuty(riderId);
    return { service, changed: true, blocked: false, riderFaultRate: decision.ratePct, slabNumber };
  }

  return {
    service,
    changed: false,
    blocked: currentlyBlocked,
    riderFaultRate: decision.ratePct,
    slabNumber,
  };
}

/** Evaluate a rider across all services (used by the immediate post-cancellation hook). */
export async function evaluateRiderCancellationBlocks(
  riderId: number,
  onlyService?: AutoBlockService
): Promise<ServiceEvaluationResult[]> {
  const [policy, stats] = await Promise.all([
    loadCancellationSlabPolicy(),
    getRiderFaultStatsByService(riderId),
  ]);
  const services = onlyService ? [onlyService] : [...AUTO_BLOCK_SERVICES];
  const results: ServiceEvaluationResult[] = [];
  for (const service of services) {
    const pol = policy.get(service)!;
    const s = stats[service] ?? { accepted: 0, riderFault: 0, cancelled: 0 };
    results.push(await evaluateRiderServiceBlock(riderId, service, pol, s));
  }
  return results;
}

/**
 * Fire-and-forget immediate evaluation after a rider-fault cancellation. Never throws into
 * the caller — blocking must never break the cancel flow.
 */
export function evaluateRiderCancellationBlocksSafe(
  riderId: number,
  service?: AutoBlockService
): void {
  void evaluateRiderCancellationBlocks(riderId, service).catch((err) =>
    console.warn("[cancellation-auto-block] immediate evaluation failed", err)
  );
}

/** Re-evaluate every relevant rider for one service (config change or reconciler safety pass). */
export async function reevaluateServiceCancellationBlocks(
  service: AutoBlockService
): Promise<{ evaluated: number; blocked: number; unblocked: number }> {
  const policy = (await loadCancellationSlabPolicy()).get(service)!;
  const riderIds = await getRidersWithServiceCancellations(service);
  let blocked = 0;
  let unblocked = 0;
  for (const riderId of riderIds) {
    const stats = (await getRiderFaultStatsByService(riderId))[service] ?? {
      accepted: 0,
      riderFault: 0,
      cancelled: 0,
    };
    const res = await evaluateRiderServiceBlock(riderId, service, policy, stats);
    if (res.changed && res.blocked) blocked += 1;
    if (res.changed && !res.blocked) unblocked += 1;
  }
  return { evaluated: riderIds.length, blocked, unblocked };
}

/** Reconciler tick: re-evaluate all services (safety net + config-change catch-up). */
export async function runCancellationAutoBlockReconcile(): Promise<{
  evaluated: number;
  blocked: number;
  unblocked: number;
}> {
  let evaluated = 0;
  let blocked = 0;
  let unblocked = 0;
  for (const service of AUTO_BLOCK_SERVICES) {
    const r = await reevaluateServiceCancellationBlocks(service);
    evaluated += r.evaluated;
    blocked += r.blocked;
    unblocked += r.unblocked;
  }
  return { evaluated, blocked, unblocked };
}
