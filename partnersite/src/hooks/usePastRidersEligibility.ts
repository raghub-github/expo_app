'use client';

import { useEffect, useState } from 'react';
import {
  fetchRidersLogCached,
  getCachedRidersLog,
  isInactiveRiderLogEntry,
  prefetchRidersLog,
} from '@/lib/ridersLogCache';

/**
 * True when an order had a prior rider assignment (re-assign / cancelled / unassigned).
 * Prefetches riders-log into cache so the sidesheet can open instantly.
 */
export function usePastRidersEligibility(
  foodOrderId: number | null | undefined,
  enabled = true
): boolean {
  const cached = foodOrderId != null ? getCachedRidersLog(foodOrderId) : undefined;
  const [eligible, setEligible] = useState(() => {
    if (!cached) return false;
    const distinct = Number(cached.summary?.distinct_riders ?? 0);
    const total = Number(cached.summary?.total_assignments ?? cached.riders.length);
    const hasPast = cached.riders.some(isInactiveRiderLogEntry);
    return hasPast || distinct > 1 || total > 1;
  });

  useEffect(() => {
    if (!enabled || foodOrderId == null || !Number.isFinite(foodOrderId)) {
      setEligible(false);
      return;
    }

    let cancelled = false;

    const hit = getCachedRidersLog(foodOrderId);
    if (hit) {
      const distinct = Number(hit.summary?.distinct_riders ?? 0);
      const total = Number(hit.summary?.total_assignments ?? hit.riders.length);
      const hasPast = hit.riders.some(isInactiveRiderLogEntry);
      setEligible(hasPast || distinct > 1 || total > 1);
      // Soft refresh in background
      prefetchRidersLog(foodOrderId);
      return;
    }

    (async () => {
      const data = await fetchRidersLogCached(foodOrderId);
      if (cancelled) return;
      const distinct = Number(data.summary?.distinct_riders ?? 0);
      const total = Number(data.summary?.total_assignments ?? data.riders.length);
      const hasPast = data.riders.some(isInactiveRiderLogEntry);
      setEligible(hasPast || distinct > 1 || total > 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [foodOrderId, enabled]);

  return eligible;
}
