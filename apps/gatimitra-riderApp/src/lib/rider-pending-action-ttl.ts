/**
 * How long a queued rider action stays replayable.
 *
 * An "accept" is only meaningful while its dispatch offer is still open — a
 * minute or so. Past that, replaying it can only fail. The row used to live
 * forever: it survived app restarts in AsyncStorage, kept the offer's
 * `acceptPending` truthy, and so rendered the accept slider permanently busy
 * ("Accepting...") with gestures ignored. The rider could not accept, and
 * because the slider was busy the offer could not expire either.
 *
 * Progress actions (reached pickup, OTP, complete ride) are worth replaying for
 * far longer: they record work the rider actually did, on an order that stays
 * live for hours.
 */
import type { RiderActionType } from "@/src/lib/rider-action-kind";

export const ACCEPT_ACTION_TTL_MS = 2 * 60 * 1000;
export const DEFAULT_ACTION_TTL_MS = 24 * 60 * 60 * 1000;

export function riderActionTtlMs(actionType: RiderActionType): number {
  // Accept/reject only make sense while the offer window is open.
  if (actionType === "accept" || actionType === "reject") return ACCEPT_ACTION_TTL_MS;
  return DEFAULT_ACTION_TTL_MS;
}

export type ExpirableRiderAction = {
  actionType: RiderActionType;
  createdAt: number;
};

/** A row with a missing or nonsensical createdAt is treated as expired, not immortal. */
export function isRiderActionExpired(
  action: ExpirableRiderAction,
  now: number = Date.now()
): boolean {
  if (!action) return true;
  const createdAt = Number(action.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return true;
  return now - createdAt > riderActionTtlMs(action.actionType);
}
