import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import { buildDemandZones, type DemandZone, type DemandZonePoint } from "@/src/lib/demand-zones";

export const RIDER_DEMAND_ZONES_QUERY_KEY = ["rider", "demand-zones"] as const;

type NearbyStoreRow = {
  id: string;
  lat: number;
  lng: number;
  distance_km?: number;
};

type Props = {
  riderLat?: number;
  riderLng?: number;
  /** Extra density points (e.g. food order pickups). */
  extraPoints?: DemandZonePoint[];
  /** Must be true only while rider is ON duty. */
  enabled?: boolean;
};

async function fetchNearbyStores(
  lat: number,
  lng: number,
  accessToken?: string | null
): Promise<DemandZonePoint[]> {
  const base = getRiderAppConfig().apiBaseUrl;
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    maxDistanceKm: "6",
    mapboxLimit: "15",
  });
  const headers = accessToken ? { authorization: `Bearer ${accessToken}` } : undefined;
  try {
    const rows = await getJson<NearbyStoreRow[]>(`${base}/v1/stores/nearby?${qs}`, {
      headers,
    });
    return (rows ?? [])
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({ lat: r.lat, lng: r.lng }));
  } catch {
    return [];
  }
}

/**
 * High-demand zones near the rider. Query is disabled while OFF duty —
 * no network, no polling, empty result (no layout reservation).
 */
export function useDemandZones({
  riderLat,
  riderLng,
  extraPoints = [],
  enabled = false,
}: Props): {
  zones: DemandZone[];
  isLoading: boolean;
} {
  const accessToken = useSessionStore((s) => s.session?.accessToken);
  const hasFix =
    riderLat != null &&
    riderLng != null &&
    Number.isFinite(riderLat) &&
    Number.isFinite(riderLng);

  const canFetch = Boolean(enabled && hasFix);

  const query = useQuery({
    queryKey: [
      ...RIDER_DEMAND_ZONES_QUERY_KEY,
      hasFix ? riderLat!.toFixed(3) : null,
      hasFix ? riderLng!.toFixed(3) : null,
    ],
    queryFn: () => fetchNearbyStores(riderLat!, riderLng!, accessToken),
    enabled: canFetch,
    staleTime: 90_000,
    refetchInterval: canFetch ? 90_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const zones = useMemo(() => {
    if (!enabled || !hasFix) return [];
    const stores = [...(query.data ?? []), ...extraPoints];
    return buildDemandZones({ lat: riderLat!, lng: riderLng! }, stores);
  }, [enabled, hasFix, riderLat, riderLng, query.data, extraPoints]);

  return {
    zones,
    // Show loading copy while ON duty but GPS / first fetch not ready yet.
    isLoading: Boolean(enabled && (!hasFix || (canFetch && query.isLoading))),
  };
}
