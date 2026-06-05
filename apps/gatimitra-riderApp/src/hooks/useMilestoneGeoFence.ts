import { useMemo } from "react";
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
  const query = useQuery({
    queryKey: [
      "rider-milestone-geo-fence",
      orderId,
      gps?.lat != null ? Math.round(gps.lat * 1e5) : null,
      gps?.lng != null ? Math.round(gps.lng * 1e5) : null,
    ],
    queryFn: async () => {
      if (!orderId) throw new Error("orderId required");
      return riderApi.getMilestoneGeoFence(orderId, gps);
    },
    enabled: Boolean(orderId),
    refetchInterval: 10_000,
    staleTime: 8_000,
    /** Keep last geo while GPS / background refetch runs (same as food — no “checking” flash). */
    placeholderData: (previous) => previous,
    refetchOnMount: false,
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
