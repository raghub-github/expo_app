import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { isActivePersonRideOrder } from "@/lib/person-ride-orders";

/** Active person-ride orders for bottom-sheet tracking on ride booking screens. */
export function useActivePersonRideOrders(enabled = true) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-orders", "active-rides"],
    queryFn: () => orderService.getMyOrders({ limit: 30 }),
    enabled,
    staleTime: 4000,
    refetchInterval: enabled ? 5000 : false,
  });

  const activeRides = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return rows
      .filter(isActivePersonRideOrder)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [data]);

  return { activeRides, isLoading, refetch };
}
