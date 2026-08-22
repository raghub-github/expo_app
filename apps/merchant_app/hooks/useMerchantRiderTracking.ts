import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import { useAuth } from "@/context/AuthContext";
import type { MerchantTrackingMapPayload } from "@/lib/merchant-rider-tracking-html";

/** Poll cadence while the tracking view is open (matches the partnersite). */
export const MERCHANT_RIDER_TRACKING_POLL_MS = 2000;

type ApiPin = { latitude: number; longitude: number } | null;
type ApiLocation = {
  latitude: number;
  longitude: number;
  heading_degrees: number | null;
  updated_at: string;
  source: "order_tracking" | "live_location";
} | null;

type ApiPayload = {
  rider: { name: string | null; mobile: string | null; selfie_url: string | null; assignment_status: string | null };
  location: ApiLocation;
  trail: Array<{ latitude: number; longitude: number; created_at: string }>;
  store: ApiPin;
  store_name: string | null;
  pickup: ApiPin;
  drop: ApiPin;
  approach: { distanceMeters?: number | null; etaMinutes?: number | null } | null;
  error?: string;
};

export type MerchantRiderTracking = {
  map: MerchantTrackingMapPayload;
  center: { latitude: number; longitude: number } | null;
  rider: ApiPayload["rider"];
  storeName: string | null;
  approach: ApiPayload["approach"];
  /** Age (s) of the live fix — for a "live · Xs ago" chip; null when no fix. */
  fixAgeSeconds: number | null;
  source: ApiLocation extends null ? null : "order_tracking" | "live_location" | null;
};

const EMPTY_MAP: MerchantTrackingMapPayload = {
  riderLat: null,
  riderLng: null,
  riderHeading: null,
  storeLat: null,
  storeLng: null,
  pickupLat: null,
  pickupLng: null,
  dropLat: null,
  dropLng: null,
  route: [],
  ended: false,
};

/**
 * Backend-authoritative merchant rider tracking. Polls
 * GET /v1/merchant-partner/stores/{storeId}/food-orders/{orderId}/rider-tracking (the
 * SAME endpoint + logic the partnersite uses) and maps it to the WebView payload. The
 * backend owns ownership + freshness; the app only renders. Disabled when not `enabled`
 * (view closed) so there is zero network/CPU when the merchant isn't watching.
 */
export function useMerchantRiderTracking(args: {
  storeId: number | null | undefined;
  ordersFoodId: number | null | undefined;
  enabled: boolean;
}): {
  data: MerchantRiderTracking | null;
  loading: boolean;
  error: string | null;
} {
  const { storeId, ordersFoodId, enabled } = args;
  const { token } = useAuth();
  const canFetch = Boolean(
    enabled && token && storeId != null && storeId > 0 && ordersFoodId != null && ordersFoodId > 0
  );

  const query = useQuery({
    queryKey: ["merchant", "rider-tracking", storeId ?? null, ordersFoodId ?? null],
    enabled: canFetch,
    refetchInterval: canFetch ? MERCHANT_RIDER_TRACKING_POLL_MS : false,
    refetchOnWindowFocus: canFetch,
    staleTime: MERCHANT_RIDER_TRACKING_POLL_MS,
    queryFn: async (): Promise<ApiPayload> => {
      const { apiBaseUrl } = getConfig();
      const res = await fetch(
        `${apiBaseUrl}/v1/merchant-partner/stores/${storeId}/food-orders/${ordersFoodId}/rider-tracking`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = (await res.json()) as ApiPayload;
      if (!res.ok || json?.error) throw new Error(json?.error || `http_${res.status}`);
      return json;
    },
  });

  const data = useMemo<MerchantRiderTracking | null>(() => {
    const p = query.data;
    if (!p) return null;
    const loc = p.location;
    const map: MerchantTrackingMapPayload = {
      riderLat: loc?.latitude ?? null,
      riderLng: loc?.longitude ?? null,
      riderHeading: loc?.heading_degrees ?? null,
      storeLat: p.store?.latitude ?? null,
      storeLng: p.store?.longitude ?? null,
      pickupLat: p.pickup?.latitude ?? null,
      pickupLng: p.pickup?.longitude ?? null,
      dropLat: p.drop?.latitude ?? null,
      dropLng: p.drop?.longitude ?? null,
      route: (p.trail ?? []).map((t) => ({ latitude: t.latitude, longitude: t.longitude })),
      ended: false,
    };
    const center =
      loc != null
        ? { latitude: loc.latitude, longitude: loc.longitude }
        : p.store != null
          ? { latitude: p.store.latitude, longitude: p.store.longitude }
          : p.pickup != null
            ? { latitude: p.pickup.latitude, longitude: p.pickup.longitude }
            : null;
    const fixAgeSeconds =
      loc?.updated_at != null
        ? Math.max(0, Math.round((Date.now() - new Date(loc.updated_at).getTime()) / 1000))
        : null;
    return {
      map,
      center,
      rider: p.rider,
      storeName: p.store_name,
      approach: p.approach,
      fixAgeSeconds,
      source: loc?.source ?? null,
    };
  }, [query.data]);

  return {
    data,
    loading: canFetch && query.isLoading,
    error: query.error ? String((query.error as Error).message ?? "tracking_failed") : null,
  };
}
