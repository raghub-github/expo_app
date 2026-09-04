import { useQuery } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import type { HotZoneCell } from "@/src/lib/hot-zones";

export const RIDER_HOT_ZONES_QUERY_KEY = ["rider", "hot-zones"] as const;

type HotZonesResponse = {
  success: boolean;
  zones: HotZoneCell[];
  services: string[];
  resolution: number | null;
  validUntilSeconds: number;
};

/**
 * Backend-authoritative hot zones near the rider (GET /v1/rider/hot-zones). Disabled
 * while OFF duty — the backend already filters to the rider's enabled + vehicle-eligible
 * services (Part 32/37/38), so the app just renders what it returns. Periodic refetch
 * for now; realtime push (Part 30) is a follow-up.
 */
export function useHotZones({
  riderLat,
  riderLng,
  enabled = false,
}: {
  riderLat?: number;
  riderLng?: number;
  enabled?: boolean;
}): { zones: HotZoneCell[]; isLoading: boolean } {
  const accessToken = useSessionStore((s) => s.session?.accessToken);
  const hasFix =
    riderLat != null &&
    riderLng != null &&
    Number.isFinite(riderLat) &&
    Number.isFinite(riderLng);
  const canFetch = Boolean(enabled && hasFix && accessToken);

  const query = useQuery({
    queryKey: [
      ...RIDER_HOT_ZONES_QUERY_KEY,
      hasFix ? riderLat!.toFixed(3) : null,
      hasFix ? riderLng!.toFixed(3) : null,
    ],
    queryFn: async (): Promise<HotZoneCell[]> => {
      const base = getRiderAppConfig().apiBaseUrl;
      const qs = new URLSearchParams({ lat: String(riderLat), lng: String(riderLng) });
      const res = await getJson<HotZonesResponse>(`${base}/v1/rider/hot-zones?${qs}`, {
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      });
      return res.zones ?? [];
    },
    enabled: canFetch,
    staleTime: 60_000,
    refetchInterval: canFetch ? 60_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return {
    zones: enabled && hasFix ? query.data ?? [] : [],
    isLoading: Boolean(enabled && (!hasFix || (canFetch && query.isLoading))),
  };
}
