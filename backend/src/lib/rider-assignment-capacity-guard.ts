/**
 * Atomic per-rider capacity guard (§43/§80). The accept path already claims each ORDER with a
 * conditional `UPDATE ... WHERE rider_id IS NULL` (which prevents two riders taking the same order,
 * §45). But per-RIDER capacity was only checked at OFFER time — so a single rider accepting TWO
 * different orders near-simultaneously could exceed the configured max (each claim is a different
 * row). This guard, run as the FIRST statement inside each accept transaction, closes that race:
 *
 *   1. pg_advisory_xact_lock(riderId) — serialises this rider's concurrent capacity-consuming
 *      accepts for the life of the transaction (released on commit/rollback). Different riders never
 *      contend; the SELECT count on other connections never takes this lock, so no deadlock.
 *   2. Re-count the rider's CURRENT active orders (committed state) and evaluate them against the
 *      authoritative limits engine (capacity + cross-service + person-exclusive).
 *   3. If ineligible, throw 409 → the transaction rolls back and the claim never happens.
 *
 * Because the lock is held until commit, a second concurrent accept for the same rider blocks until
 * the first commits, then re-counts and sees the first's committed claim — so the max can never be
 * exceeded. This is defence-in-depth; the offer-time check still runs first for a fast rejection.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  countRiderActiveAssignments,
  evaluateRiderAssignmentEligibility,
  fetchServiceAssignmentLimitsConfig,
} from "./rider-assignment-control.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

type TxLike = { execute: (query: SQL) => Promise<unknown> };

export class RiderCapacityExceededError extends Error {
  statusCode = 409;
  code = "assignment_capacity";
  constructor(message: string) {
    super(message);
    this.name = "RiderCapacityExceededError";
  }
}

/**
 * Serialise + re-check capacity inside an open accept transaction. MUST be the first statement in
 * the transaction (before the claim), so a rollback is clean. Throws RiderCapacityExceededError
 * (409) when adding one more `serviceType` order would break the configured limits.
 */
export async function assertRiderServiceCapacityInTx(
  tx: TxLike,
  riderId: number,
  serviceType: DispatchServiceType
): Promise<void> {
  // 1. Per-rider serialization for the life of the transaction.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${riderId})`);

  // 2. Authoritative current counts (committed-visible) + configured limits.
  const [counts, config] = await Promise.all([
    countRiderActiveAssignments(riderId),
    fetchServiceAssignmentLimitsConfig(),
  ]);

  // 3. Would accepting one more of this service be allowed?
  const result = evaluateRiderAssignmentEligibility(counts, serviceType, config);
  if (!result.eligible) {
    throw new RiderCapacityExceededError(
      result.blockReason ?? `Active order capacity reached for ${serviceType}`
    );
  }
}
