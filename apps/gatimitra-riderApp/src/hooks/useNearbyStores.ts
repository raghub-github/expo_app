import { useQuery } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import type { NearbyStore } from "@/src/lib/nearby-stores";

export const RIDER_NEARBY_STORES_QUERY_KEY = ["rider", "nearby-stores"] as const;

type NearbyStoresResponse = {
  success: boolean;
  radiusKm: number;
  count: number;
  stores: NearbyStore[];
};

/**
 * Nearby food stores within `radiusKm` (default 20km) of the rider's LATEST GPS, from
 * GET /v1/rider/nearby-stores. Independent of Hot Zones and only fetched when the rider turns
 * the "Nearby Stores" map layer ON (a store discovery aid, not permanently on the map).
 * Slow refetch — store locations barely change; re-queries when the rider moves ~>1 cell.
 */
export function useNearbyStores({
  riderLat,
  riderLng,
  enabled = false,
  radiusKm = 20,
}: {
  riderLat?: number;
  riderLng?: number;
  enabled?: boolean;
  radiusKm?: number;
}): { stores: NearbyStore[]; isLoading: boolean } {
  const accessToken = useSessionStore((s) => s.session?.accessToken);
  const hasFix =
    riderLat != null &&
    riderLng != null &&
    Number.isFinite(riderLat) &&
    Number.isFinite(riderLng);
  const canFetch = Boolean(enabled && hasFix && accessToken);

  const query = useQuery({
    queryKey: [
      ...RIDER_NEARBY_STORES_QUERY_KEY,
      hasFix ? riderLat!.toFixed(2) : null, // ~1.1km granularity — avoid refetch on tiny GPS jitter
      hasFix ? riderLng!.toFixed(2) : null,
      radiusKm,
    ],
    queryFn: async (): Promise<NearbyStore[]> => {
      const base = getRiderAppConfig().apiBaseUrl;
      const qs = new URLSearchParams({
        lat: String(riderLat),
        lng: String(riderLng),
        radiusKm: String(radiusKm),
      });
      const res = await getJson<NearbyStoresResponse>(`${base}/v1/rider/nearby-stores?${qs}`, {
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      });
      return res.stores ?? [];
    },
    enabled: canFetch,
    staleTime: 120_000,
    refetchInterval: canFetch ? 120_000 : false,
    refetchOnWindowFocus: canFetch,
    refetchOnMount: canFetch,
  });

  return {
    stores: enabled && hasFix ? query.data ?? [] : [],
    isLoading: Boolean(enabled && (!hasFix || (canFetch && query.isLoading))),
  };
}
