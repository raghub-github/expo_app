import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderService, type OrderSummary, type OrderDetail } from "@/services/order.service";
import { isActivePersonRideOrder } from "@/lib/person-ride-orders";
import { isOutstandingRideFareOrder } from "@/lib/ride-fare-gate";
import {
  forgetActivePersonRide,
  readActivePersonRideIds,
  rememberActivePersonRide,
} from "@/lib/active-person-ride-persist";
import {
  getMyOrdersCachedAt,
  readSyncMyOrders,
  writeCachedMyOrders,
} from "@/lib/myOrdersCache";
import { useOrderStore } from "@/store/orderStore";

function orderDetailToSummary(detail: OrderDetail): OrderSummary {
  return {
    orderId: detail.orderId,
    coreOrderId: detail.coreOrderId ?? null,
    formattedOrderId: detail.formattedOrderId ?? null,
    status: detail.status,
    merchantName: detail.merchantName ?? undefined,
    merchantPublicName: detail.merchantPublicName ?? null,
    merchantPublicStoreId: detail.merchantPublicStoreId ?? null,
    merchantAddress: detail.merchantAddress ?? null,
    deliveryAddress: detail.deliveryAddress ?? null,
    merchantStoreId: detail.merchantStoreId ?? null,
    orderType: detail.orderType ?? "person_ride",
    rideType: detail.rideType ?? null,
    totalAmount: detail.totalAmount,
    createdAt: detail.createdAt,
    paymentStatus: detail.paymentStatus ?? null,
    paymentMethod: detail.paymentMethod ?? null,
    checkoutMetadata: detail.checkoutMetadata ?? null,
    pickupLat: detail.pickupLat ?? null,
    pickupLng: detail.pickupLng ?? null,
    distanceKm: detail.distanceKm ?? null,
  };
}

/** Active + due-fare person rides for ride booking screens. */
export function useActivePersonRideOrders(enabled = true) {
  const cachedOrders = readSyncMyOrders() as OrderSummary[] | undefined;
  // Primitive snapshot — never return a fresh array from the zustand selector
  // (that triggers "getSnapshot should be cached" → infinite re-render).
  const storeRideIdsKey = useOrderStore((s) =>
    s.activeOrders
      .filter((o) => o.serviceType === "ride")
      .map((o) => o.orderId)
      .sort()
      .join(",")
  );
  const storeRideIds = useMemo(
    () => (storeRideIdsKey ? storeRideIdsKey.split(",") : []),
    [storeRideIdsKey]
  );

  const { data, isLoading, refetch } = useQuery({
    // Share cache with hydration / Orders tab so force-close cold start paints faster.
    queryKey: ["my-orders"],
    queryFn: async () => {
      const list = await orderService.getMyOrders({ limit: 50 });
      void writeCachedMyOrders(list);
      return list;
    },
    enabled,
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    initialData: cachedOrders,
    initialDataUpdatedAt: getMyOrdersCachedAt(),
    placeholderData: (previous) => previous ?? cachedOrders,
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const rememberedIds = useMemo(() => {
    const fromDisk = readActivePersonRideIds();
    const fromList = rows.filter(isActivePersonRideOrder).map((o) => o.orderId);
    return [...new Set([...fromDisk, ...storeRideIds, ...fromList])];
  }, [rows, storeRideIds]);

  // Keep disk memory of active rides in sync with the latest list.
  useEffect(() => {
    for (const ride of rows.filter(isActivePersonRideOrder)) {
      rememberActivePersonRide(ride.orderId);
      if (ride.formattedOrderId) rememberActivePersonRide(ride.formattedOrderId);
    }
    for (const id of readActivePersonRideIds()) {
      const match = rows.find(
        (o) => o.orderId === id || (o.formattedOrderId?.trim() ?? "") === id
      );
      if (match && !isActivePersonRideOrder(match) && !isOutstandingRideFareOrder(match)) {
        forgetActivePersonRide(id);
      }
    }
  }, [rows]);

  const missingRememberedIds = useMemo(() => {
    return rememberedIds.filter((id) => {
      const inList = rows.some(
        (o) => o.orderId === id || (o.formattedOrderId?.trim() ?? "") === id
      );
      return !inList;
    });
  }, [rememberedIds, rows]);

  const missingKey = missingRememberedIds.slice().sort().join(",");

  const { data: hydratedFromDetail = [] } = useQuery({
    queryKey: ["my-orders", "active-ride-extras", missingKey],
    queryFn: async () => {
      const results = await Promise.all(
        missingRememberedIds.map((id) =>
          orderService.getOrder(id).catch(() => null)
        )
      );
      return results
        .filter((d): d is OrderDetail => d != null)
        .map(orderDetailToSummary);
    },
    enabled: enabled && missingRememberedIds.length > 0,
    staleTime: 4_000,
  });

  const mergedRows = useMemo(() => {
    const byId = new Map<string, OrderSummary>();
    for (const row of rows) byId.set(row.orderId, row);
    for (const row of hydratedFromDetail) {
      if (!byId.has(row.orderId)) byId.set(row.orderId, row);
    }
    return [...byId.values()];
  }, [rows, hydratedFromDetail]);

  const dueFareRide = useMemo(
    () =>
      mergedRows
        .filter(isOutstandingRideFareOrder)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ??
      null,
    [mergedRows]
  );

  const activeRides = useMemo(
    () =>
      mergedRows
        .filter(isActivePersonRideOrder)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [mergedRows]
  );

  const trackingRide = dueFareRide ?? activeRides[0] ?? null;
  const hasDueFare = dueFareRide != null;

  return {
    orders: rows,
    activeRides,
    dueFareRide,
    trackingRide,
    hasDueFare,
    isLoading,
    refetch,
  };
}
