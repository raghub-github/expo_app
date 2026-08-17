/**
 * In-memory cache for GET /api/food-orders/:id/riders-log so the Old rider's log
 * sidesheet can open instantly (no long "Loading…" flash).
 */

import type { RiderLogEntry } from '@/components/orders/OrderRidersHistorySidesheet';

export type RidersLogPayload = {
  riders: RiderLogEntry[];
  summary?: {
    total_assignments?: number;
    distinct_riders?: number;
  };
};

const cache = new Map<number, RidersLogPayload>();
const inflight = new Map<number, Promise<RidersLogPayload>>();

const EMPTY: RidersLogPayload = { riders: [], summary: { total_assignments: 0, distinct_riders: 0 } };

function normalize(data: unknown): RidersLogPayload {
  const d = (data ?? {}) as RidersLogPayload;
  const riders = Array.isArray(d.riders) ? d.riders : [];
  return {
    riders,
    summary: d.summary ?? {
      total_assignments: riders.length,
      distinct_riders: new Set(riders.map((r) => r.rider_id)).size,
    },
  };
}

export function getCachedRidersLog(foodOrderId: number): RidersLogPayload | undefined {
  if (!Number.isFinite(foodOrderId) || foodOrderId <= 0) return undefined;
  return cache.get(foodOrderId);
}

export function setCachedRidersLog(foodOrderId: number, payload: RidersLogPayload): void {
  if (!Number.isFinite(foodOrderId) || foodOrderId <= 0) return;
  cache.set(foodOrderId, payload);
}

export function prefetchRidersLog(foodOrderId: number): void {
  if (!Number.isFinite(foodOrderId) || foodOrderId <= 0) return;
  if (cache.has(foodOrderId) || inflight.has(foodOrderId)) return;
  void fetchRidersLogCached(foodOrderId);
}

/** Returns cached data immediately when present; otherwise fetches (deduped). */
export async function fetchRidersLogCached(
  foodOrderId: number,
  options?: { force?: boolean }
): Promise<RidersLogPayload> {
  if (!Number.isFinite(foodOrderId) || foodOrderId <= 0) return EMPTY;

  if (!options?.force) {
    const hit = cache.get(foodOrderId);
    if (hit) return hit;
    const pending = inflight.get(foodOrderId);
    if (pending) return pending;
  }

  const p = fetch(`/api/food-orders/${foodOrderId}/riders-log`, { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return EMPTY;
      return normalize(await res.json());
    })
    .catch(() => EMPTY)
    .then((payload) => {
      cache.set(foodOrderId, payload);
      return payload;
    })
    .finally(() => {
      inflight.delete(foodOrderId);
    });

  inflight.set(foodOrderId, p);
  return p;
}

/**
 * Cancelled / rejected / unassigned only — merchant-app parity.
 * Do NOT treat delivered/completed (or is_active=false after delivery) as “old”.
 */
export function isInactiveRiderLogEntry(r: {
  assignment_status?: string | null;
  cancelled_at?: string | null;
  rejected_at?: string | null;
  unassigned_at?: string | null;
  delivered_at?: string | null;
  is_active?: boolean | null;
}): boolean {
  if ((r.cancelled_at ?? '').trim() || (r.rejected_at ?? '').trim() || (r.unassigned_at ?? '').trim()) {
    return true;
  }
  const st = String(r.assignment_status ?? '').toUpperCase();
  // Completed delivery is never “old log” history for reassignment UI.
  if (st === 'DELIVERED' || st === 'COMPLETED' || (r.delivered_at ?? '').trim()) {
    return false;
  }
  // Explicitly deactivated assignment (reassigned away) counts as past.
  if (r.is_active === false) return true;

  if (
    st === 'PICKED_UP' ||
    st === 'ACCEPTED' ||
    st === 'REACHED_STORE' ||
    st === 'REACHED_MERCHANT' ||
    st === 'ASSIGNED'
  ) {
    return false;
  }
  return (
    st === 'CANCELLED' ||
    st === 'REJECTED' ||
    st === 'UNASSIGNED' ||
    st === 'EXPIRED' ||
    st === 'FAILED' ||
    st === 'TIMEOUT'
  );
}

/** Past assignments only — current live / delivered assignee excluded. */
export function pastRidersFromLog(riders: RiderLogEntry[]): RiderLogEntry[] {
  return riders.filter((r) => isInactiveRiderLogEntry(r));
}

/**
 * Show “View Old Rider's Log” only when this order actually had reassignment history:
 * - at least one cancelled / rejected / unassigned / expired assignment, or
 * - more than one distinct rider.
 * A single live assignee alone must never show the button.
 */
export function isEligibleForOldRidersLog(payload: RidersLogPayload | null | undefined): boolean {
  if (!payload) return false;
  const riders = Array.isArray(payload.riders) ? payload.riders : [];
  if (riders.length === 0) return false;

  const past = pastRidersFromLog(riders);
  const distinct = new Set(
    riders.map((r) => Number(r.rider_id)).filter((id) => Number.isFinite(id) && id > 0)
  ).size;

  // Lone current assignment (one rider, nothing cancelled) → hide
  if (riders.length === 1 && past.length === 0) return false;

  // Prior cancelled/unassigned (even if still searching for the next rider)
  if (past.length > 0) return true;

  // Multiple different riders on the same order
  return distinct > 1;
}
