'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatRiderToMerchantArrivalFromMeters } from '@/lib/rider-merchant-arrival-display';

const POLL_MS = 8_000;

type TrackingPayload = {
  approach?: {
    remaining_distance_m: number;
    eta_minutes: number;
    source?: string;
  } | null;
};

export function useRiderArrivalToMerchant(
  ordersFoodId: number | null | undefined,
  enabled: boolean
) {
  const [arrivalSubtitle, setArrivalSubtitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchEstimate = useCallback(async () => {
    if (!ordersFoodId || !enabled) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/food-orders/${ordersFoodId}/rider-tracking`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setArrivalSubtitle(null);
        return;
      }
      const json = (await res.json()) as TrackingPayload;
      const approach = json.approach;
      if (!approach?.remaining_distance_m) {
        setArrivalSubtitle(null);
        return;
      }
      setArrivalSubtitle(
        formatRiderToMerchantArrivalFromMeters(
          approach.remaining_distance_m,
          approach.eta_minutes
        )
      );
    } catch {
      setArrivalSubtitle(null);
    } finally {
      setLoading(false);
    }
  }, [ordersFoodId, enabled]);

  useEffect(() => {
    if (!enabled || !ordersFoodId) {
      setArrivalSubtitle(null);
      return;
    }
    void fetchEstimate();
    const timer = window.setInterval(() => void fetchEstimate(), POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, ordersFoodId, fetchEstimate]);

  return { arrivalSubtitle, loading, refresh: fetchEstimate };
}
