import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { isActivePersonRideOrder } from "@/lib/person-ride-orders";
import { isOutstandingRideFareOrder } from "@/lib/ride-fare-gate";

/** Active + due-fare person rides for ride booking screens. */
export function useActivePersonRideOrders(enabled = true) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-orders", "active-rides"],
    queryFn: () => orderService.getMyOrders({ limit: 30 }),
    enabled,
    staleTime: 4000,
    refetchInterval: enabled ? 5000 : false,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const dueFareRide = useMemo(
    () =>
      rows
        .filter(isOutstandingRideFareOrder)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null,
    [rows]
  );

  const activeRides = useMemo(
    () =>
      rows
        .filter(isActivePersonRideOrder)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [rows]
  );

  const trackingRide = dueFareRide ?? activeRides[0] ?? null;
  const hasDueFare = dueFareRide != null;

  return {
    activeRides,
    dueFareRide,
    trackingRide,
    hasDueFare,
    isLoading,
    refetch,
  };
}
