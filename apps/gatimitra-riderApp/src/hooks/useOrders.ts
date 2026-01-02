import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { useDutyStore } from "@/src/stores/dutyStore";

/**
 * Hook to fetch available orders
 */
export function useAvailableOrders() {
  const isOnDuty = useDutyStore((s) => s.isOnDuty);

  return useQuery({
    queryKey: ["rider", "orders", "available"],
    queryFn: () => riderApi.getAvailableOrders(),
    enabled: isOnDuty, // Only fetch when on duty
    refetchInterval: 10000, // Refetch every 10 seconds when on duty
    staleTime: 5000,
  });
}

/**
 * Hook to fetch active orders
 */
export function useActiveOrders() {
  return useQuery({
    queryKey: ["rider", "orders", "active"],
    queryFn: () => riderApi.getActiveOrders(),
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 3000,
  });
}

/**
 * Hook to accept an order
 */
export function useAcceptOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => riderApi.acceptOrder(orderId),
    onSuccess: () => {
      // Invalidate and refetch orders
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

/**
 * Hook to reject an order
 */
export function useRejectOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => riderApi.rejectOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

