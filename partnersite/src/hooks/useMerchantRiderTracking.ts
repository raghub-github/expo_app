'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MERCHANT_RIDER_TRACKING_POLL_MS,
  type MerchantRiderTrackingPayload,
} from '@/lib/merchant-rider-tracking';
import { prefetchTrackingDrivingRoute } from '@/lib/merchant-mapbox-route-cache';

type CacheEntry = {
  data: MerchantRiderTrackingPayload;
  fetchedAt: number;
};

const trackingCache = new Map<number, CacheEntry>();

export function invalidateMerchantRiderTrackingCache(orderFoodId?: number) {
  if (orderFoodId == null) trackingCache.clear();
  else trackingCache.delete(orderFoodId);
}

export function useMerchantRiderTracking(
  orderFoodId: number,
  options: {
    enabled: boolean;
    /** Poll while order is selected / modal open. */
    poll: boolean;
    trackingUrl?: string | null;
    merchantStoreLat?: number | null;
    merchantStoreLon?: number | null;
  }
) {
  const { enabled, poll, trackingUrl, merchantStoreLat, merchantStoreLon } = options;
  const resolvedUrl =
    trackingUrl ??
    (orderFoodId > 0 ? `/api/food-orders/${orderFoodId}/rider-tracking` : '');

  const cached = orderFoodId > 0 ? trackingCache.get(orderFoodId) : undefined;
  const [data, setData] = useState<MerchantRiderTrackingPayload | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGenRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const applyPayload = useCallback(
    (payload: MerchantRiderTrackingPayload, opts?: { keepSelfie?: boolean }) => {
      const prev = trackingCache.get(orderFoodId)?.data;
      const next: MerchantRiderTrackingPayload =
        opts?.keepSelfie && !payload.rider.selfie_url && prev?.rider.selfie_url
          ? {
              ...payload,
              rider: { ...payload.rider, selfie_url: prev.rider.selfie_url },
            }
          : payload;
      trackingCache.set(orderFoodId, { data: next, fetchedAt: Date.now() });
      setData(next);
      setError(null);
      prefetchTrackingDrivingRoute(next, merchantStoreLat, merchantStoreLon);
    },
    [orderFoodId, merchantStoreLat, merchantStoreLon]
  );

  const loadTracking = useCallback(
    async (silent = false) => {
      if (orderFoodId <= 0 || !resolvedUrl) return;
      if (inFlightRef.current) {
        await inFlightRef.current;
        return;
      }

      const gen = ++requestGenRef.current;
      if (!silent && !trackingCache.has(orderFoodId)) setLoading(true);

      const url =
        silent && !resolvedUrl.includes('?')
          ? `${resolvedUrl}?lite=1`
          : silent && resolvedUrl.includes('?')
            ? `${resolvedUrl}&lite=1`
            : resolvedUrl;

      const run = (async () => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          const json = (await res.json()) as MerchantRiderTrackingPayload & { error?: string };
          if (gen !== requestGenRef.current) return;

          if (json.error) {
            setError(json.error);
            if (!silent) setData(null);
          } else {
            applyPayload(json as MerchantRiderTrackingPayload, { keepSelfie: silent });
          }
        } catch {
          if (gen !== requestGenRef.current) return;
          if (!silent) setError('Could not load rider location');
        } finally {
          if (gen === requestGenRef.current) setLoading(false);
        }
      })();

      inFlightRef.current = run.finally(() => {
        if (inFlightRef.current === run) inFlightRef.current = null;
      });
      await inFlightRef.current;
    },
    [orderFoodId, resolvedUrl, applyPayload]
  );

  useEffect(() => {
    if (!enabled || orderFoodId <= 0) return;

    const hit = trackingCache.get(orderFoodId);
    if (hit) {
      setData(hit.data);
      setError(null);
      setLoading(false);
      prefetchTrackingDrivingRoute(hit.data, merchantStoreLat, merchantStoreLon);
    }
    void loadTracking(hit ? true : false);
  }, [enabled, orderFoodId, loadTracking, merchantStoreLat, merchantStoreLon]);

  useEffect(() => {
    if (!poll || !enabled || orderFoodId <= 0) return;
    const id = window.setInterval(() => void loadTracking(true), MERCHANT_RIDER_TRACKING_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll, enabled, orderFoodId, loadTracking]);

  return { data, loading, error, refresh: loadTracking };
}
