'use client';

import { useEffect, useState } from 'react';

type RidersLogSummary = {
  total_assignments?: number;
  distinct_riders?: number;
};

/**
 * True when an order had more than one rider assignment (re-assign / past riders).
 */
export function usePastRidersEligibility(
  foodOrderId: number | null | undefined,
  enabled = true
): boolean {
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    if (!enabled || foodOrderId == null || !Number.isFinite(foodOrderId)) {
      setEligible(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/food-orders/${foodOrderId}/riders-log`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          if (!cancelled) setEligible(false);
          return;
        }
        const data = (await res.json()) as { summary?: RidersLogSummary };
        const distinct = Number(data.summary?.distinct_riders ?? 0);
        const total = Number(data.summary?.total_assignments ?? 0);
        if (!cancelled) {
          setEligible(distinct > 1 || total > 1);
        }
      } catch {
        if (!cancelled) setEligible(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [foodOrderId, enabled]);

  return eligible;
}
