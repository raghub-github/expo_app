/** Keep in sync with backend `ride-rider-payout-snapshot.ts` (display helpers only). */

export type RiderPayoutSnapshot = {
  totalEarning: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  return { totalEarning: round2(total) };
}

function readStandalonePayoutSnapshot(raw: unknown): RiderPayoutSnapshot | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const total = Number(obj.totalEarning);
  if (!Number.isFinite(total) || total <= 0) return null;
  return { totalEarning: round2(total) };
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
