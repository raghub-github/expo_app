import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";

export const RIDER_AVAILABLE_ORDERS_QUERY_KEY = ["rider", "orders", "available"] as const;

/**
 * Hook to fetch available orders
 */
export function useAvailableOrders() {
  const isOnDuty = useDutyStore((s) => s.isOnDuty);

  return useQuery({
    queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY,
    queryFn: () => riderApi.getAvailableOrders(),
    enabled: isOnDuty,
    refetchInterval: 5000,
    staleTime: 3000,
    retry: 2,
  });
}

export const RIDER_ACTIVE_ORDERS_QUERY_KEY = ["rider", "orders", "active"] as const;

export type RiderOrderHistoryFilter = "all" | "food" | "ride" | "parcel";

export const riderOrderHistoryQueryKey = (category: RiderOrderHistoryFilter) =>
  ["rider", "orders", "history", category] as const;

export function useRiderOrderHistory(category: RiderOrderHistoryFilter) {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: riderOrderHistoryQueryKey(category),
    queryFn: () =>
      riderApi.getOrderHistory({
        limit: 100,
        offset: 0,
        category: category === "all" ? "all" : category,
      }),
    enabled: !!session?.accessToken,
    staleTime: 60_000,
    retry: 2,
  });
}

/**
 * Hook to fetch active orders
 */
export function useActiveOrders() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY,
    queryFn: () => riderApi.getActiveOrders(),
    enabled: !!session?.accessToken,
    refetchInterval: 5000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 2000,
    retry: 2,
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
    mutationFn: (args: { orderId: string; reasonCode: string; reasonText?: string }) =>
      riderApi.rejectOrder(args.orderId, {
        reasonCode: args.reasonCode,
        reasonText: args.reasonText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useRideOrder(
  orderId: string | undefined,
  opts?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["rider", "orders", "detail", orderId],
    queryFn: () => riderApi.getRideOrder(orderId!),
    enabled: !!orderId,
    staleTime: 5000,
    refetchInterval: opts?.refetchInterval,
  });
}

type OrderGpsArgs = {
  orderId: string;
  lat?: number;
  lng?: number;
};

export function useReachedPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      riderApi.markReachedPickup(args.orderId, { lat: args.lat, lng: args.lng }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useSubmitMerchantPickupFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      orderId: string;
      rating?: number;
      tags?: string[];
      skipped?: boolean;
    }) =>
      riderApi.submitMerchantPickupFeedback(args.orderId, {
        rating: args.rating,
        tags: args.tags,
        skipped: args.skipped,
      }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useSubmitCustomerDeliveryFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      orderId: string;
      rating?: number;
      tags?: string[];
      comment?: string;
      skipped?: boolean;
    }) =>
      riderApi.submitCustomerDeliveryFeedback(args.orderId, {
        rating: args.rating,
        tags: args.tags,
        comment: args.comment,
        skipped: args.skipped,
      }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useReachedCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      riderApi.markReachedCustomer(args.orderId, { lat: args.lat, lng: args.lng }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useCancelAssignedRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { orderId: string; reasonCode: string; reasonText?: string }) =>
      riderApi.cancelAssignedRide(args.orderId, {
        reasonCode: args.reasonCode,
        reasonText: args.reasonText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function syncRiderOrderDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
  data: RiderOrderSummary
) {
  queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
  void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
}

export function useVerifyPickupOtp() {
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      otp: string;
      lat?: number;
      lng?: number;
      deviceTimestamp?: string;
    }) => riderApi.verifyPickupOtp(args.orderId, args),
  });
}

export function useFoodPickupVerificationSettings() {
  return useQuery({
    queryKey: ["rider", "food-pickup-verification-settings"],
    queryFn: () => riderApi.getFoodPickupVerificationSettings(),
    staleTime: 60_000,
  });
}

export function useMarkFoodPickup() {
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      lat?: number;
      lng?: number;
      deviceTimestamp?: string;
    }) => riderApi.markFoodPickup(args.orderId, args),
  });
}

export function useVerifyPickupBarcode() {
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      barcode: string;
      lat?: number;
      lng?: number;
      deviceTimestamp?: string;
    }) => riderApi.verifyPickupBarcode(args.orderId, args),
  });
}

export function useCompleteRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      riderApi.completeRide(args.orderId, { lat: args.lat, lng: args.lng }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useStartRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      riderApi.startRide(args.orderId, { lat: args.lat, lng: args.lng }),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

export function useVerifyDeliveryOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      orderId: string;
      otp: string;
      lat?: number;
      lng?: number;
      deliveryImageUrl?: string;
      deliveryImageR2Key?: string;
    }) => riderApi.verifyDeliveryOtp(args.orderId, args),
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

