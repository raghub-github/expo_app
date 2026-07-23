import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStatus } from "@/src/hooks/useDutyStatus";
import {
  isRiderFullyDispatchBlocked,
  mergeRiderBlockedServices,
} from "@/src/lib/rider-blocked-services";
import { isRiderDispatchRealtimeActive } from "@/src/stores/riderWsStore";

export const RIDER_ORDER_DETAIL_QUERY_KEY = (orderId: string) =>
  ["rider", "orders", "detail", orderId] as const;

function orderRefMatches(order: RiderOrderSummary, orderRef: string): boolean {
  const ref = orderRef.trim();
  if (!ref) return false;
  return order.id === ref || order.formattedOrderId?.trim() === ref;
}

/** Match active/available list entries so navigation can render before detail fetch. */
export function findRiderOrderInQueryCache(
  queryClient: QueryClient,
  orderRef: string
): RiderOrderSummary | undefined {
  const active = queryClient.getQueryData<RiderOrderSummary[]>(RIDER_ACTIVE_ORDERS_QUERY_KEY);
  const fromActive = active?.find((o) => orderRefMatches(o, orderRef));
  if (fromActive) return fromActive;

  const available = queryClient.getQueryData<RiderOrderSummary[]>(RIDER_AVAILABLE_ORDERS_QUERY_KEY);
  return available?.find((o) => orderRefMatches(o, orderRef));
}

export function seedRiderOrderDetailCache(
  queryClient: QueryClient,
  order: RiderOrderSummary,
  extraRefs: string[] = []
) {
  const keys = new Set<string>();
  if (order.id?.trim()) keys.add(order.id.trim());
  if (order.formattedOrderId?.trim()) keys.add(order.formattedOrderId.trim());
  for (const ref of extraRefs) {
    const trimmed = ref.trim();
    if (trimmed) keys.add(trimmed);
  }
  for (const key of keys) {
    queryClient.setQueryData(RIDER_ORDER_DETAIL_QUERY_KEY(key), order);
  }
}

export const RIDER_AVAILABLE_ORDERS_QUERY_KEY = ["rider", "orders", "available"] as const;

/**
 * Hook to fetch available orders
 */
export function useAvailableOrders() {
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: dutyStatus } = useDutyStatus();
  const blockedServices = mergeRiderBlockedServices(dutyStatus?.blockedServiceTypes);
  const dispatchBlocked = isRiderFullyDispatchBlocked({
    accountRestricted: dutyStatus?.accountRestricted,
    allServicesBlacklisted: dutyStatus?.allServicesBlacklisted,
    blockedServices,
  });

  return useQuery({
    queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY,
    queryFn: () => riderApi.getAvailableOrders(),
    // Do NOT gate `enabled` on dispatchBlocked: a stale/optimistic block flag from
    // useDutyStatus would otherwise disable the query entirely, turning the WS
    // `dispatch_offer` invalidate into a no-op and permanently dropping offers with
    // no polling safety net. The server (getAvailableOrdersForRider) is the SSOT and
    // returns [] for a genuinely blocked rider, so we keep polling — just slowly.
    enabled: sessionHydrated && Boolean(session?.accessToken) && isOnDuty,
    refetchInterval: (query) => {
      // Genuinely-blocked riders still poll, but at a floor so a stale flag
      // self-heals within 30s instead of never; WS-invalidate stays instant.
      if (dispatchBlocked) return 30_000;
      if (isRiderDispatchRealtimeActive()) return 12_000;
      const err = query.state.error as { status?: number } | null;
      if (err?.status === 503 || err?.status === 429) return 12_000;
      return 4_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 3000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_500 * 2 ** attempt, 12_000),
  });
}

export const RIDER_ACTIVE_ORDERS_QUERY_KEY = ["rider", "orders", "active"] as const;
export const RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY = ["rider", "orders", "ride-payment-holds"] as const;

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

export function useRidePaymentHolds() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY,
    queryFn: () => riderApi.getRidePaymentHolds(),
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
    onSuccess: (data, orderId) => {
      seedRiderOrderDetailCache(queryClient, data, [orderId]);
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

/** Record dispatch offer missed when rider does not accept before timer expires. */
export function useMissOrderOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { orderId: string; reason?: string }) =>
      riderApi.missOrderOffer(args.orderId, args.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "dispatch-offer-stats"] });
    },
  });
}

export function useRideOrder(
  orderId: string | undefined,
  opts?: { refetchInterval?: number | false }
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: RIDER_ORDER_DETAIL_QUERY_KEY(orderId ?? ""),
    queryFn: () => riderApi.getRideOrder(orderId!),
    enabled: !!orderId,
    staleTime: 5000,
    refetchInterval: opts?.refetchInterval,
    retry: 2,
    placeholderData: () =>
      orderId ? findRiderOrderInQueryCache(queryClient, orderId) : undefined,
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
      messages?: string[];
      skipped?: boolean;
    }) =>
      riderApi.submitMerchantPickupFeedback(args.orderId, {
        rating: args.rating,
        tags: args.tags,
        messages: args.messages,
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
      messages?: string[];
      comment?: string;
      skipped?: boolean;
    }) =>
      riderApi.submitCustomerDeliveryFeedback(args.orderId, {
        rating: args.rating,
        tags: args.tags,
        messages: args.messages,
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
      queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["rider", "ledger"] });
    },
  });
}

export function syncRiderOrderDetailCache(
  queryClient: ReturnType<typeof useQueryClient>,
  orderId: string,
  data: RiderOrderSummary
) {
  seedRiderOrderDetailCache(queryClient, data, [orderId]);
  void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
}

const VERIFY_PICKUP_OTP_TIMEOUT_MS = 15_000;

export function useVerifyPickupOtp() {
  return useMutation({
    mutationFn: async (args: {
      orderId: string;
      otp: string;
      lat?: number;
      lng?: number;
      deviceTimestamp?: string;
    }) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          riderApi.verifyPickupOtp(args.orderId, args),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("Request timed out. Check your network and try again.")),
              VERIFY_PICKUP_OTP_TIMEOUT_MS
            );
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
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

export function useAcknowledgeFoodPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => riderApi.acknowledgeFoodPickup(orderId),
    onSuccess: (data, orderId) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
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

const VERIFY_DELIVERY_OTP_TIMEOUT_MS = 30_000;

export function useVerifyDeliveryOtp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      orderId: string;
      otp: string;
      lat?: number;
      lng?: number;
      deliveryImageUrl?: string;
      deliveryImageR2Key?: string;
    }) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          riderApi.verifyDeliveryOtp(args.orderId, args),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () =>
                reject(
                  new Error("Request timed out. Check your network and API URL.")
                ),
              VERIFY_DELIVERY_OTP_TIMEOUT_MS
            );
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
    onSuccess: (data, { orderId }) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
    },
  });
}

