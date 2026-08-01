/** Keep in sync with backend `ride-rider-payout-snapshot.ts` (display helpers only). */

export type RiderPayoutSnapshot = {
  baseEarning: number;
  waitingEarning: number;
  surgeEarning: number;
  totalEarning: number;
  pickupDistanceKm: number | null;
  tripDistanceKm: number | null;
  totalDistanceKm: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function readRiderPayoutSnapshotFromBilling(
  billingSnapshot: unknown
): RiderPayoutSnapshot | null {
  if (billingSnapshot == null || typeof billingSnapshot !== "object") return null;
  const snap = billingSnapshot as Record<string, unknown>;
  const raw = snap.rider_payout_snapshot;
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const total = Number(obj.totalEarning);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    baseEarning: round2(Math.max(0, Number(obj.baseEarning) || 0)),
    waitingEarning: round2(Math.max(0, Number(obj.waitingEarning) || 0)),
    surgeEarning: round2(Math.max(0, Number(obj.surgeEarning) || 0)),
    totalEarning: round2(total),
    pickupDistanceKm: numOrNull(obj.pickupDistanceKm),
    tripDistanceKm: numOrNull(obj.tripDistanceKm),
    totalDistanceKm: numOrNull(obj.totalDistanceKm),
  };
}

function readStandalonePayoutSnapshot(raw: unknown): RiderPayoutSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const total = Number(obj.totalEarning);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    baseEarning: round2(Math.max(0, Number(obj.baseEarning) || 0)),
    waitingEarning: round2(Math.max(0, Number(obj.waitingEarning) || 0)),
    surgeEarning: round2(Math.max(0, Number(obj.surgeEarning) || 0)),
    totalEarning: round2(total),
    pickupDistanceKm: numOrNull(obj.pickupDistanceKm),
    tripDistanceKm: numOrNull(obj.tripDistanceKm),
    totalDistanceKm: numOrNull(obj.totalDistanceKm),
  };
}

/** Prefer billing snapshot (includes waiting updates); merge accept surge when both exist. */
export function resolveRiderPayoutTotalForDisplay(input: {
  billingSnapshot?: unknown;
  acceptPayoutSnapshot?: unknown;
}): number | null {
  const billing = readRiderPayoutSnapshotFromBilling(input.billingSnapshot);
  const accept = readStandalonePayoutSnapshot(input.acceptPayoutSnapshot);
  if (billing) return billing.totalEarning;
  if (accept) return accept.totalEarning;
  return null;
}
