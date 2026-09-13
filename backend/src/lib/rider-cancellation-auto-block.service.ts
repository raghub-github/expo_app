/**
 * Rider cancellation-rate auto-block engine.
 *
 * Applies the Super-Admin per-service rule: when a rider's lifetime RIDER-FAULT cancellation
 * rate for a service reaches the threshold (and min accepted orders is met), block the rider
 * for that service only. The block lifts only when re-evaluation finds the rider under the
 * (possibly changed) threshold — the sole release path is an admin threshold change.
 *
 * Writes presence rows to rider_cancellation_service_blocks (merged into
 * getRiderAccountRestrictions for enforcement) and logs every transition to
 * rider_service_block_history. Duty is re-synced so a blocked service drops immediately.
 */

import { getSql } from "../db/client.js";
import {
  evaluateCancellationBlock,
  type RiderCancellationBlockConfig,
} from "./rider-cancellation-block-policy.js";
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

export type ServiceConfigRow = RiderCancellationBlockConfig & { serviceType: AutoBlockService };

/** Load per-service config (defaults to disabled if a row is missing). */
export async function loadCancellationBlockConfig(): Promise<Map<AutoBlockService, ServiceConfigRow>> {
  const sql = getSql();
  const map = new Map<AutoBlockService, ServiceConfigRow>();
  for (const s of AUTO_BLOCK_SERVICES) {
    map.set(s, { serviceType: s, enabled: false, thresholdPct: 0, minAccepted: 20 });
  }
  try {
    const rows = (await sql`
      SELECT service_type, threshold_pct::float8 AS threshold_pct, min_accepted, enabled
      FROM rider_cancellation_block_config
      WHERE service_type IN ('food','parcel','person_ride')
    `) as unknown as {
      service_type: AutoBlockService;
      threshold_pct: number;
      min_accepted: number;
      enabled: boolean;
    }[];
    for (const r of rows) {
      map.set(r.service_type, {
        serviceType: r.service_type,
        enabled: r.enabled === true,
        thresholdPct: Number(r.threshold_pct),
        minAccepted: Number(r.min_accepted),
      });
    }
  } catch (err) {
    console.warn("[cancellation-auto-block] config load failed; treating as disabled", err);
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
  thresholdPct: number;
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
          riderFaultRate: round2(input.rate),
          thresholdPct: input.thresholdPct,
          accepted: input.stats.accepted,
          cancelled: input.stats.cancelled,
          riderFault: input.stats.riderFault,
        })}::jsonb
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
};

/** Evaluate + reconcile one rider+service against the current config. */
export async function evaluateRiderServiceBlock(
  riderId: number,
  service: AutoBlockService,
  config: RiderCancellationBlockConfig,
  stats: ServiceFaultStats
): Promise<ServiceEvaluationResult> {
  const sql = getSql();
  const decision = evaluateCancellationBlock(config, stats);
  const currentlyBlocked = await isBlocked(riderId, service);

  if (decision.shouldBlock && !currentlyBlocked) {
    await sql`
      INSERT INTO rider_cancellation_service_blocks
        (rider_id, service_type, threshold_pct, rider_fault_rate, accepted_count, cancelled_count, rider_fault_count)
      VALUES (
        ${riderId}, ${service}, ${config.thresholdPct}, ${round2(decision.riderFaultRate)},
        ${stats.accepted}, ${stats.cancelled}, ${stats.riderFault}
      )
      ON CONFLICT (rider_id, service_type) DO NOTHING
    `;
    await logHistory({
      riderId, service, action: "blocked", stats,
      rate: decision.riderFaultRate, thresholdPct: config.thresholdPct,
      reason: `cancellation_rate_${round2(decision.riderFaultRate)}pct_ge_threshold_${config.thresholdPct}pct`,
    });
    await resyncDuty(riderId);
    return { service, changed: true, blocked: true, riderFaultRate: decision.riderFaultRate };
  }

  if (!decision.shouldBlock && currentlyBlocked) {
    await sql`
      DELETE FROM rider_cancellation_service_blocks
      WHERE rider_id = ${riderId} AND service_type = ${service}
    `;
    await logHistory({
      riderId, service, action: "unblocked", stats,
      rate: decision.riderFaultRate, thresholdPct: config.thresholdPct,
      reason:
        decision.reason === "disabled"
          ? "rule_disabled"
          : `cancellation_rate_${round2(decision.riderFaultRate)}pct_below_threshold_${config.thresholdPct}pct`,
    });
    await resyncDuty(riderId);
    return { service, changed: true, blocked: false, riderFaultRate: decision.riderFaultRate };
  }

  return { service, changed: false, blocked: currentlyBlocked, riderFaultRate: decision.riderFaultRate };
}

/** Evaluate a rider across all services (used by the immediate post-cancellation hook). */
export async function evaluateRiderCancellationBlocks(
  riderId: number,
  onlyService?: AutoBlockService
): Promise<ServiceEvaluationResult[]> {
  const [config, stats] = await Promise.all([
    loadCancellationBlockConfig(),
    getRiderFaultStatsByService(riderId),
  ]);
  const services = onlyService ? [onlyService] : [...AUTO_BLOCK_SERVICES];
  const results: ServiceEvaluationResult[] = [];
  for (const service of services) {
    const cfg = config.get(service)!;
    const s = stats[service] ?? { accepted: 0, riderFault: 0, cancelled: 0 };
    results.push(await evaluateRiderServiceBlock(riderId, service, cfg, s));
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
  const config = (await loadCancellationBlockConfig()).get(service)!;
  const riderIds = await getRidersWithServiceCancellations(service);
  let blocked = 0;
  let unblocked = 0;
  for (const riderId of riderIds) {
    const stats = (await getRiderFaultStatsByService(riderId))[service] ?? {
      accepted: 0,
      riderFault: 0,
      cancelled: 0,
    };
    const res = await evaluateRiderServiceBlock(riderId, service, config, stats);
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
