'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NearbyDispatchRiderSummary } from '@/lib/fetch-nearby-dispatch-riders';

const POLL_MS = 12_000;

export function useNearbyDispatchRiders(
  ordersFoodId: number | null | undefined,
  enabled: boolean
) {
  const [summary, setSummary] = useState<NearbyDispatchRiderSummary | null>(null);
  const [riderAssigned, setRiderAssigned] = useState(false);
  const inFlightRef = useRef(false);

  const fetchSummary = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!ordersFoodId || !enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/food-orders/${ordersFoodId}/nearby-riders`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok?: boolean;
          summary?: NearbyDispatchRiderSummary | null;
          riderAssigned?: boolean;
        };
        if (json.riderAssigned) {
          setRiderAssigned(true);
          setSummary(null);
          return;
        }
        setRiderAssigned(false);
        if (json.summary) {
          setSummary(json.summary);
        }
      } catch {
        /* keep last summary on background refresh errors */
      } finally {
        inFlightRef.current = false;
      }
    },
    [ordersFoodId, enabled]
  );

  useEffect(() => {
    if (!enabled || !ordersFoodId) {
      setSummary(null);
      setRiderAssigned(false);
      return;
    }
    void fetchSummary();
    const timer = window.setInterval(() => void fetchSummary({ background: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, ordersFoodId, fetchSummary]);

  return { summary, riderAssigned, refresh: fetchSummary };
}
