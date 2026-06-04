'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NearbyDispatchRiderSummary } from '@/lib/fetch-nearby-dispatch-riders';

const POLL_MS = 12_000;

export function useNearbyDispatchRiders(
  ordersFoodId: number | null | undefined,
  enabled: boolean
) {
  const [summary, setSummary] = useState<NearbyDispatchRiderSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [riderAssigned, setRiderAssigned] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!ordersFoodId || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/food-orders/${ordersFoodId}/nearby-riders`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setSummary(null);
        return;
      }
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
      setSummary(json.summary ?? null);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [ordersFoodId, enabled]);

  useEffect(() => {
    if (!enabled || !ordersFoodId) {
      setSummary(null);
      setRiderAssigned(false);
      return;
    }
    void fetchSummary();
    const timer = window.setInterval(() => void fetchSummary(), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, ordersFoodId, fetchSummary]);

  return { summary, loading, riderAssigned, refresh: fetchSummary };
}
