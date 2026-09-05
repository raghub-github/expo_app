import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";
import { useSessionStore } from "@/src/stores/sessionStore";
import { logSlideActionLatency, markSlideAction } from "@/src/lib/slideActionLatency";
import {
  fetchAvailableOrdersForDispatch,
  fetchPendingOffersForDispatch,
} from "@/src/lib/riderDispatchFetch";
import { executeRiderAction } from "@/src/lib/riderActionRuntime";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const fromAvailable = available?.find((o) => orderRefMatches(o, orderRef));
  if (fromAvailable) return fromAvailable;

  const pending = queryClient.getQueryData<RiderOrderSummary[]>(RIDER_PENDING_OFFERS_QUERY_KEY);
  return pending?.find((o) => orderRefMatches(o, orderRef));
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

/** Cache first; list refetch must not delay mutation settlement or slider unlock. */
function cacheOrderThenRefreshLists(
  queryClient: QueryClient,
  orderId: string,
  data: RiderOrderSummary
) {
  queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
  void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
}

function applySlideOrderSuccess(
  queryClient: QueryClient,
  orderId: string,
  data: RiderOrderSummary
) {
  markSlideAction("T7_UI_SUCCESS");
  logSlideActionLatency();
  cacheOrderThenRefreshLists(queryClient, orderId, data);
}

export const RIDER_AVAILABLE_ORDERS_QUERY_KEY = ["rider", "orders", "available"] as const;
export const RIDER_PENDING_OFFERS_QUERY_KEY = ["rider", "orders", "pending-offers"] as const;

/**
 * Hook to fetch available orders
 */
export function useAvailableOrders() {
  return useQuery({
    queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY,
    queryFn: async () => fetchAvailableOrdersForDispatch(),
    // Cache observers only — a mount fetch raced the lifecycle poll and aborted
    // the 15s /available scan, leaving idle Home with an empty pool.
    enabled: false,
    networkMode: "always",
    // Session-layer RiderDispatchLifecycle owns polling so idle Home / unfocused
    // tabs cannot pause recovery. These observers only read the shared cache.
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 3_000,
    placeholderData: (prev) => prev,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_500 * 2 ** attempt, 12_000),
  });
}

export function usePendingOffers() {
  return useQuery({
    queryKey: RIDER_PENDING_OFFERS_QUERY_KEY,
    queryFn: async () => fetchPendingOffersForDispatch(),
    enabled: false,
    networkMode: "always",
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: 3_000,
    placeholderData: (prev) => prev,
    retry: 2,
  });
}

export const RIDER_ACTIVE_ORDERS_QUERY_KEY = ["rider", "orders", "active"] as const;
export const RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY = ["rider", "orders", "ride-payment-holds"] as const;

const LAST_ACTIVE_ORDERS_KEY = "gm.rider.lastActiveOrders.v1";

export function persistLastActiveOrders(orders: RiderOrderSummary[]): void {
  void AsyncStorage.setItem(LAST_ACTIVE_ORDERS_KEY, JSON.stringify(orders.slice(0, 4))).catch(
    () => {}
  );
}

export async function hydrateLastActiveOrders(queryClient: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVE_ORDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as RiderOrderSummary[]) : [];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    if (queryClient.getQueryData(RIDER_ACTIVE_ORDERS_QUERY_KEY)) return;
    queryClient.setQueryData(RIDER_ACTIVE_ORDERS_QUERY_KEY, parsed);
    for (const order of parsed) {
      seedRiderOrderDetailCache(queryClient, order);
    }
  } catch {
    /* ignore corrupt cache */
  }
}

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
    queryFn: async () => {
      const data = await riderApi.getActiveOrders();
      persistLastActiveOrders(data);
      return data;
    },
    enabled: !!session?.accessToken,
    refetchInterval: (query) => {
      const n = Array.isArray(query.state.data) ? query.state.data.length : 0;
      // Navigation already polls order detail; /active is only a safety net.
      return n > 0 ? 20_000 : 30_000;
    },
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    retry: 2,
  });
}

export function useRidePaymentHolds() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY,
    queryFn: () => riderApi.getRidePaymentHolds(),
    enabled: !!session?.accessToken,
    refetchInterval: (query) => {
      const n = Array.isArray(query.state.data) ? query.state.data.length : 0;
      return n > 0 ? 12_000 : 30_000;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
    retry: 2,
  });
}

/**
 * Hook to accept an order
 */
export function useAcceptOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) =>
      executeRiderAction({
        orderId,
        actionType: "accept",
        send: (actionId) => riderApi.acceptOrder(orderId, { actionId }),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, orderId) => {
      seedRiderOrderDetailCache(queryClient, data, [orderId]);
      queryClient.setQueryData<RiderOrderSummary[]>(RIDER_ACTIVE_ORDERS_QUERY_KEY, (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((o) => o.id === data.id)) {
          return list.map((o) => (o.id === data.id ? data : o));
        }
        return [data, ...list];
      });
      const drop = (list: RiderOrderSummary[] | undefined) =>
        Array.isArray(list)
          ? list.filter(
              (o) =>
                o.id !== data.id &&
                o.id !== orderId &&
                (!data.formattedOrderId || o.formattedOrderId !== data.formattedOrderId)
            )
          : list;
      queryClient.setQueryData(RIDER_AVAILABLE_ORDERS_QUERY_KEY, drop);
      queryClient.setQueryData(RIDER_PENDING_OFFERS_QUERY_KEY, drop);
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
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
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
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
      void queryClient.invalidateQueries({ queryKey: ["rider", "dispatch-offer-stats"] });
    },
  });
}

function syncDetailIntoActiveList(queryClient: QueryClient, data: RiderOrderSummary) {
  queryClient.setQueryData<RiderOrderSummary[]>(RIDER_ACTIVE_ORDERS_QUERY_KEY, (prev) => {
    if (!Array.isArray(prev) || prev.length === 0) return prev;
    let changed = false;
    const next = prev.map((o) => {
      if (
        o.id === data.id ||
        (data.formattedOrderId && o.formattedOrderId === data.formattedOrderId)
      ) {
        changed = true;
        return data;
      }
      return o;
    });
    return changed ? next : prev;
  });
}

export function useRideOrder(
  orderId: string | undefined,
  opts?: { refetchInterval?: number | false }
) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: RIDER_ORDER_DETAIL_QUERY_KEY(orderId ?? ""),
    queryFn: async () => {
      const data = await riderApi.getRideOrder(orderId!);
      seedRiderOrderDetailCache(queryClient, data, [orderId!]);
      syncDetailIntoActiveList(queryClient, data);
      return data;
    },
    enabled: !!orderId,
    staleTime: 10_000,
    refetchInterval: opts?.refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: 2,
    // Prefer cached list/detail so Active Ride opens without a full-screen spinner.
    initialData: () =>
      orderId ? findRiderOrderInQueryCache(queryClient, orderId) : undefined,
    initialDataUpdatedAt: () =>
      orderId
        ? queryClient.getQueryState(RIDER_ORDER_DETAIL_QUERY_KEY(orderId))?.dataUpdatedAt
        : undefined,
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
      executeRiderAction({
        orderId: args.orderId,
        actionType: "reached_pickup",
        payload: { lat: args.lat, lng: args.lng },
        send: (actionId) =>
          riderApi.markReachedPickup(args.orderId, { lat: args.lat, lng: args.lng }, { actionId }),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, { orderId }) => {
      applySlideOrderSuccess(queryClient, orderId, data);
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
      cacheOrderThenRefreshLists(queryClient, orderId, data);
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
      cacheOrderThenRefreshLists(queryClient, orderId, data);
    },
  });
}

export function useReachedCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "reached_drop",
        payload: { lat: args.lat, lng: args.lng },
        send: (actionId) =>
          riderApi.markReachedCustomer(args.orderId, { lat: args.lat, lng: args.lng }, { actionId }),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, { orderId }) => {
      applySlideOrderSuccess(queryClient, orderId, data);
    },
  });
}

export function useCancelAssignedRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { orderId: string; reasonCode: string; reasonText?: string }) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "cancel_assigned",
        payload: { reasonCode: args.reasonCode, reasonText: args.reasonText },
        send: (actionId) =>
          riderApi.cancelAssignedRide(
            args.orderId,
            { reasonCode: args.reasonCode, reasonText: args.reasonText },
            { actionId }
          ),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: async () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rider", "orders"] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "wallet"] }),
        queryClient.invalidateQueries({ queryKey: ["rider", "duty"] }),
      ]);
      void queryClient.refetchQueries({ queryKey: ["rider", "ledger"], type: "active" });
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

export function useVerifyPickupOtp() {
  return useMutation({
    mutationFn: (args: {
      orderId: string;
      otp: string;
      lat?: number;
      lng?: number;
      deviceTimestamp?: string;
    }) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "verify_pickup_otp",
        payload: { otp: args.otp, lat: args.lat, lng: args.lng },
        send: (actionId) =>
          riderApi.verifyPickupOtp(
            args.orderId,
            {
              otp: args.otp,
              lat: args.lat,
              lng: args.lng,
              deviceTimestamp: args.deviceTimestamp,
            },
            { actionId }
          ),
      }),
    retry: false,
    networkMode: "always",
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
    }) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "mark_pickup",
        payload: { lat: args.lat, lng: args.lng },
        send: (actionId) => riderApi.markFoodPickup(args.orderId, args, { actionId }),
      }),
    retry: false,
    networkMode: "always",
  });
}

export function useAcknowledgeFoodPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => riderApi.acknowledgeFoodPickup(orderId),
    onSuccess: (data, orderId) => {
      queryClient.setQueryData(["rider", "orders", "detail", orderId], data);
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders"] });
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
      executeRiderAction({
        orderId: args.orderId,
        actionType: "complete_ride",
        payload: { lat: args.lat, lng: args.lng },
        send: (actionId) =>
          riderApi.completeRide(args.orderId, { lat: args.lat, lng: args.lng }, { actionId }),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, { orderId }) => {
      applySlideOrderSuccess(queryClient, orderId, data);
    },
  });
}

export function useStartRide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: OrderGpsArgs) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "start_ride",
        payload: { lat: args.lat, lng: args.lng },
        send: (actionId) =>
          riderApi.startRide(args.orderId, { lat: args.lat, lng: args.lng }, { actionId }),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, { orderId }) => {
      applySlideOrderSuccess(queryClient, orderId, data);
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
    }) =>
      executeRiderAction({
        orderId: args.orderId,
        actionType: "verify_delivery_otp",
        payload: {
          otp: args.otp,
          lat: args.lat,
          lng: args.lng,
          deliveryImageUrl: args.deliveryImageUrl,
          deliveryImageR2Key: args.deliveryImageR2Key,
        },
        send: (actionId) =>
          riderApi.verifyDeliveryOtp(
            args.orderId,
            {
              otp: args.otp,
              lat: args.lat,
              lng: args.lng,
              deliveryImageUrl: args.deliveryImageUrl,
              deliveryImageR2Key: args.deliveryImageR2Key,
            },
            { actionId }
          ),
      }),
    retry: false,
    networkMode: "always",
    onSuccess: (data, { orderId }) => {
      applySlideOrderSuccess(queryClient, orderId, data);
    },
  });
}

