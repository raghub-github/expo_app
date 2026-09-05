import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";

export type MilestoneGeoState = {
  withinRadius: boolean;
  distanceMeters: number;
  radiusMeters: number;
  blockedMessage: string | null;
};

export function useMilestoneGeoFence(
  orderId: string | undefined,
  gps?: { lat?: number; lng?: number }
) {
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const hasGps = gps?.lat != null && gps?.lng != null && Number.isFinite(gps.lat) && Number.isFinite(gps.lng);

  const query = useQuery({
    queryKey: ["rider-milestone-geo-fence", orderId],
    queryFn: async () => {
      if (!orderId) throw new Error("orderId required");
      return riderApi.getMilestoneGeoFence(orderId, gpsRef.current);
    },
    enabled: Boolean(orderId) && hasGps,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    /** Keep last geo while GPS / background refetch runs (same as food — no “checking” flash). */
    placeholderData: (previous) => previous,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const byMilestone = useMemo(() => {
    const map: Record<string, MilestoneGeoState> = {};
    for (const row of query.data?.milestones ?? []) {
      map[row.milestoneKey] = {
        withinRadius: row.withinRadius,
        distanceMeters: row.distanceMeters,
        radiusMeters: row.radiusMeters,
        blockedMessage: row.blockedMessage,
      };
    }
    return map;
  }, [query.data?.milestones]);

  return { ...query, byMilestone };
}

export function isMilestoneGeoBlocked(geo?: MilestoneGeoState): boolean {
  return geo != null && !geo.withinRadius;
}
