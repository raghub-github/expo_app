import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchFoodOrder,
  fetchFoodOrders,
  patchFoodOrderStatus,
  postFoodOrderPrepDelay,
} from "@/services/ordersApi";
import { prefetchMenuItemsForOrders } from "@/lib/menuItemCache";
import { prefetchOrderTimeline } from "@/lib/orderTimelineCache";
import { getStoreSettings } from "@/services/storeSettingsApi";
import {
  acceptSecondsLeft,
  AUTO_CANCEL_REASON,
  claimAutoCancelFoodOrder,
  releaseAutoCancelFoodOrder,
} from "@/lib/orderAcceptanceWindow";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import {
  apiStatusToStage,
  mapApiOrder,
  stageTransitionToApi,
  type OrderCounts,
  type OrderRecord,
  type OrderStage,
} from "@/hooks/useOrders";

const POLL_FAST_MS = 4_000;
const POLL_NORMAL_MS = 8_000;

type OrdersContextValue = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  transitionOrder: (
    orderId: string,
    nextStatus: OrderStage,
    opts?: { rejectedReason?: string }
  ) => Promise<void>;
  extendPrepDelay: (orderId: string, additionalMinutes: number) => Promise<void>;
  counts: OrderCounts;
  formatRelativeTime: (iso: string) => string;
  acceptanceWindowMinutes: number;
  orderNowMs: number;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

function canTransition(order: OrderRecord, next: OrderStage): boolean {
  if (order.deliveryType === "GATIMITRA_RIDER") {
    if (next === "picked_up" || next === "delivered" || next === "rto") {
      return false;
    }
  }
  return true;
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { acceptanceWindowMinutes } = useOrderAcceptanceSettings();

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderNowMs, setOrderNowMs] = useState(() => Date.now());
  const autoAcceptedRef = useRef<Set<number>>(new Set());
  const autoAcceptTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const refetchInFlightRef = useRef<Promise<void> | null>(null);
  const transitionInFlightRef = useRef<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!token || !storeId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    if (refetchInFlightRef.current) {
      await refetchInFlightRef.current;
      return;
    }

    const run = (async () => {
      setError(null);
      try {
        const [list, storeSettings] = await Promise.all([
          fetchFoodOrders(storeId, token, { limit: 200 }),
          getStoreSettings(storeId, token).catch(() => null),
        ]);
        const mapped = list.map(mapApiOrder);
        setOrders(mapped);
        prefetchMenuItemsForOrders(
          storeId,
          token,
          mapped.flatMap((o) => o.lineItems)
        );
        for (const row of mapped) {
          if (row.id.startsWith("core-")) continue;
          const foodId = parseInt(row.id, 10);
          if (Number.isFinite(foodId)) prefetchOrderTimeline(storeId, foodId, token);
        }

        if (storeSettings?.auto_accept_orders) {
          const delayMs =
            Math.max(0, Math.min(600, storeSettings.auto_accept_time_seconds || 0)) * 1000;
          for (const row of list) {
            const st = apiStatusToStage(row.order_status);
            if (st !== "created" || row.core_only) continue;
            const fid = row.orders_food_id;
            if (autoAcceptedRef.current.has(fid)) continue;
            if (autoAcceptTimersRef.current.has(fid)) continue;
            const timer = setTimeout(() => {
              autoAcceptTimersRef.current.delete(fid);
              if (autoAcceptedRef.current.has(fid)) return;
              autoAcceptedRef.current.add(fid);
              void patchFoodOrderStatus(storeId, fid, token, "ACCEPTED", undefined, {
                action_source: "app",
                accept_mode: "auto",
              })
                .then((updated) => {
                  setOrders((prev) =>
                    prev.map((o) => (o.id === String(fid) ? mapApiOrder(updated) : o))
                  );
                })
                .catch(() => {
                  autoAcceptedRef.current.delete(fid);
                });
            }, delayMs);
            autoAcceptTimersRef.current.set(fid, timer);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load orders");
      } finally {
        setLoading(false);
      }
    })();

    refetchInFlightRef.current = run;
    try {
      await run;
    } finally {
      refetchInFlightRef.current = null;
    }
  }, [token, storeId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  const hasPendingAccept = useMemo(
    () => orders.some((o) => o.status === "created" && !o.id.startsWith("core-")),
    [orders]
  );

  const pollIntervalMs = hasPendingAccept ? POLL_FAST_MS : POLL_NORMAL_MS;

  useEffect(() => {
    const id = setInterval(() => {
      void refetch();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refetch]);

  useEffect(() => {
    if (!hasPendingAccept) return undefined;
    const id = setInterval(() => setOrderNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasPendingAccept]);

  useEffect(() => {
    if (!token || !storeId) return;
    for (const order of orders) {
      if (order.status !== "created" || order.id.startsWith("core-")) continue;
      const foodId = parseInt(order.id, 10);
      if (!Number.isFinite(foodId)) continue;
      const secondsLeft = acceptSecondsLeft(
        order.createdAt,
        acceptanceWindowMinutes,
        orderNowMs
      );
      if (secondsLeft > 0) continue;
      if (!claimAutoCancelFoodOrder(foodId)) continue;
      void patchFoodOrderStatus(storeId, foodId, token, "CANCELLED", AUTO_CANCEL_REASON, {
        action_source: "system",
        cancel_mode: "auto",
      })
        .then((updated) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? mapApiOrder(updated) : o))
          );
        })
        .catch(() => {
          releaseAutoCancelFoodOrder(foodId);
        });
    }
  }, [orders, orderNowMs, storeId, token, acceptanceWindowMinutes]);

  const transitionOrder = useCallback(
    async (
      orderId: string,
      nextStatus: OrderStage,
      opts?: { rejectedReason?: string }
    ) => {
      if (!token || !storeId) return;
      if (orderId.startsWith("core-")) {
        setError("Order is still syncing; refresh in a moment or use Partner Site.");
        return;
      }
      const order = orders.find((o) => o.id === orderId);
      if (!order || !canTransition(order, nextStatus)) return;

      const apiStatus = stageTransitionToApi(order.status, nextStatus);
      const pipeline = order.pipelineStatus.toUpperCase();
      if (pipeline === apiStatus) return;
      if (transitionInFlightRef.current.has(orderId)) return;

      const rejectedReason =
        nextStatus === "rejected" ? opts?.rejectedReason?.trim() : undefined;
      if (nextStatus === "rejected" && !rejectedReason) {
        setError("Select a cancellation reason.");
        return;
      }

      const prev = orders;
      transitionInFlightRef.current.add(orderId);
      setOrders((list) =>
        list.map((o) =>
          o.id === orderId ? { ...o, status: nextStatus, pipelineStatus: apiStatus } : o
        )
      );

      const patchOpts = {
        action_source: "app" as const,
        ...(apiStatus === "ACCEPTED" ? { accept_mode: "manual" as const } : {}),
        ...(apiStatus === "CANCELLED" ? { cancel_mode: "manual" as const } : {}),
      };

      try {
        if (apiStatus === "READY_FOR_PICKUP" && pipeline === "ACCEPTED") {
          try {
            await patchFoodOrderStatus(
              storeId,
              Number(orderId),
              token,
              "PREPARING",
              undefined,
              patchOpts
            );
          } catch (prepErr) {
            const msg = prepErr instanceof Error ? prepErr.message : "";
            if (!/invalid transition/i.test(msg)) throw prepErr;
          }
        }

        const updated = await patchFoodOrderStatus(
          storeId,
          Number(orderId),
          token,
          apiStatus,
          rejectedReason,
          patchOpts
        );
        setOrders((list) =>
          list.map((o) => (o.id === orderId ? mapApiOrder(updated) : o))
        );
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const alreadyAtTarget =
          /invalid transition/i.test(msg) &&
          new RegExp(`${apiStatus}:${apiStatus}`, "i").test(msg);
        if (alreadyAtTarget) {
          try {
            const updated = await fetchFoodOrder(storeId, Number(orderId), token);
            setOrders((list) =>
              list.map((o) => (o.id === orderId ? mapApiOrder(updated) : o))
            );
            setError(null);
            return;
          } catch {
            // fall through to rollback
          }
        }
        setOrders(prev);
        setError(msg || "Failed to update order");
        throw e;
      } finally {
        transitionInFlightRef.current.delete(orderId);
      }
    },
    [token, storeId, orders]
  );

  const extendPrepDelay = useCallback(
    async (orderId: string, additionalMinutes: number) => {
      if (!token || !storeId) return;
      if (orderId.startsWith("core-")) {
        setError("Order is still syncing; refresh in a moment.");
        return;
      }
      const foodId = Number(orderId);
      if (!Number.isFinite(foodId)) return;

      try {
        const updated = await postFoodOrderPrepDelay(
          storeId,
          foodId,
          token,
          additionalMinutes
        );
        setOrders((list) =>
          list.map((o) => (o.id === orderId ? mapApiOrder(updated) : o))
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to extend preparation time");
        throw e;
      }
    },
    [token, storeId]
  );

  const counts: OrderCounts = useMemo(() => {
    const base: OrderCounts = {
      all: orders.length,
      created: 0,
      preparing: 0,
      ready: 0,
      picked_up: 0,
      delivered: 0,
      rejected: 0,
      rto: 0,
    };
    for (const o of orders) {
      base[o.status] += 1;
    }
    return base;
  }, [orders]);

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      loading,
      error,
      refetch,
      transitionOrder,
      extendPrepDelay,
      counts,
      formatRelativeTime,
      acceptanceWindowMinutes,
      orderNowMs,
    }),
    [
      orders,
      loading,
      error,
      refetch,
      transitionOrder,
      extendPrepDelay,
      counts,
      acceptanceWindowMinutes,
      orderNowMs,
    ]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrdersContext(): OrdersContextValue {
  const ctx = useContext(OrdersContext);
  if (!ctx) {
    throw new Error("useOrdersContext must be used within OrdersProvider");
  }
  return ctx;
}
