'use client';

import { useEffect, useState } from 'react';
import {
  fetchRidersLogCached,
  getCachedRidersLog,
  isEligibleForOldRidersLog,
} from '@/lib/ridersLogCache';

/**
 * True when an order had a prior rider assignment (re-assign / cancelled / unassigned)
 * or multiple distinct riders — not for a single live assignee alone.
 * Prefetches riders-log into cache so the sidesheet can open instantly.
 */
export function usePastRidersEligibility(
  foodOrderId: number | null | undefined,
  enabled = true
): boolean {
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (!enabled || foodOrderId == null || !Number.isFinite(foodOrderId) || foodOrderId <= 0) {
      setEligible(false);
      return;
    }

    let cancelled = false;

    // Reset immediately so a previous order's "true" never flashes on a new order.
    const hit = getCachedRidersLog(foodOrderId);
    setEligible(isEligibleForOldRidersLog(hit));

    (async () => {
      const data = await fetchRidersLogCached(foodOrderId, { force: Boolean(hit) });
      if (cancelled) return;
      setEligible(isEligibleForOldRidersLog(data));
    })();

    return () => {
      cancelled = true;
    };
  }, [foodOrderId, enabled]);

  return eligible;
}
