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
import { AppState, type AppStateStatus } from "react-native";
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
import { prefetchMerchantTimelineEnrichment } from "@/lib/merchantTimelineEnrichmentCache";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { useMerchantOrdersRealtime } from "@/hooks/useMerchantOrdersRealtime";
import {
  mapApiOrder,
  stageTransitionToApi,
  type OrderCounts,
  type OrderRecord,
  type OrderStage,
} from "@/lib/orderRecord";
import { isActiveMerchantOrderStage } from "@/lib/merchantActiveOrders";

const POLL_FAST_MS = 3_000;
const POLL_NORMAL_MS = 5_000;

type OrdersContextValue = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Upsert a single order into the live board (notification / push deep-link path). */
  upsertOrder: (order: OrderRecord) => void;
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
  const refetchInFlightRef = useRef<Promise<void> | null>(null);
  const transitionInFlightRef = useRef<Set<string>>(new Set());
  const fastFetchInFlightRef = useRef<Set<number>>(new Set());
  /** Orders inserted optimistically from realtime, kept alive across a stale full refetch. */
  const pendingOptimisticRef = useRef<Map<number, { order: OrderRecord; at: number }>>(new Map());

  /**
   * A full-list refetch may have started BEFORE an optimistic realtime insert and
   * therefore not include the new order. Re-attach any recent optimistic CREATED
   * order the fetched list is still missing, so it isn't dropped (which would close
   * the incoming modal). Entries self-prune once the list catches up, the order
   * leaves CREATED, or after a short grace window.
   */
  const mergePendingOptimistic = useCallback((list: OrderRecord[]): OrderRecord[] => {
    const pending = pendingOptimisticRef.current;
    if (pending.size === 0) return list;
    const now = Date.now();
    const coreIdsInList = new Set(list.map((o) => o.ordersCoreId));
    const extra: OrderRecord[] = [];
    for (const [coreId, entry] of pending) {
      if (coreIdsInList.has(coreId) || entry.order.status !== "created" || now - entry.at > 15_000) {
        pending.delete(coreId);
        continue;
      }
      extra.push(entry.order);
    }
    return extra.length > 0 ? [...extra, ...list] : list;
  }, []);

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
        if (__DEV__) {
          console.log(`[orders] fetching food-orders store=${storeId}`);
        }
        const list = await fetchFoodOrders(storeId, token, { limit: 80 });
        if (__DEV__) {
          console.log(`[orders] food-orders ok count=${list.length}`);
        }
        const mapped = list.map(mapApiOrder);
        setOrders(mergePendingOptimistic(mapped));
        prefetchMenuItemsForOrders(
          storeId,
          token,
          mapped.flatMap((o) => o.lineItems)
        );
        for (const row of mapped) {
          if (row.id.startsWith("core-")) continue;
          const foodId = parseInt(row.id, 10);
          if (Number.isFinite(foodId)) {
            prefetchOrderTimeline(storeId, foodId, token);
            if (row.status !== "delivered" && row.status !== "rejected" && row.status !== "rto") {
              prefetchMerchantTimelineEnrichment(storeId, foodId, token);
            }
          }
        }
      } catch (e) {
        // Keep the last good board visible — a transient API blip must not wipe
        // CREATED orders (and close the incoming sheet) to an empty New/Active list.
        const msg = e instanceof Error ? e.message : "Failed to load orders";
        if (__DEV__) {
          console.warn(`[orders] food-orders failed store=${storeId}:`, msg);
        }
        setError(msg);
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
  }, [token, storeId, mergePendingOptimistic]);

  /**
   * Fast path: a single orders_food row changed in realtime. Fetch just that
   * order and upsert it into the list immediately, so the incoming-order modal
   * opens (new CREATED) or closes (accepted/rejected from either platform)
   * without waiting for the debounced full-list refetch. This mirrors the
   * Partner Site, which opens from a targeted fetch off the same realtime event.
   * The debounced `refetch()` still runs afterwards for silent reconciliation.
   */
  const applyRealtimeFoodRow = useCallback(
    async (foodId: number) => {
      if (!token || !storeId) return;
      if (!Number.isFinite(foodId) || foodId <= 0) return;
      // Don't fight an in-progress local Accept/Reject on this order.
      if (transitionInFlightRef.current.has(String(foodId))) return;
      if (fastFetchInFlightRef.current.has(foodId)) return;
      fastFetchInFlightRef.current.add(foodId);
      try {
        const updated = await fetchFoodOrder(storeId, foodId, token);
        const mapped = mapApiOrder(updated);
        // A late fast-fetch must not resurrect an order the user just actioned.
        if (transitionInFlightRef.current.has(String(foodId))) return;
        // Keep this optimistic row alive across a stale full refetch (see mergePendingOptimistic).
        if (mapped.status === "created" && !mapped.id.startsWith("core-")) {
          pendingOptimisticRef.current.set(mapped.ordersCoreId, { order: mapped, at: Date.now() });
        } else {
          pendingOptimisticRef.current.delete(mapped.ordersCoreId);
        }
        setOrders((list) => {
          const idx = list.findIndex(
            (o) => o.id === mapped.id || o.ordersCoreId === mapped.ordersCoreId
          );
          if (idx < 0) return [mapped, ...list];
          const next = list.slice();
          next[idx] = mapped;
          return next;
        });
      } catch {
        // Targeted fetch failed — the debounced full refetch will reconcile.
      } finally {
        fastFetchInFlightRef.current.delete(foodId);
      }
    },
    [token, storeId]
  );

  const upsertOrder = useCallback((order: OrderRecord) => {
    if (order.status === "created" && !order.id.startsWith("core-")) {
      pendingOptimisticRef.current.set(order.ordersCoreId, {
        order,
        at: Date.now(),
      });
    }
    setOrders((list) => {
      const idx = list.findIndex(
        (o) => o.id === order.id || o.ordersCoreId === order.ordersCoreId
      );
      if (idx < 0) return [order, ...list];
      const next = list.slice();
      next[idx] = order;
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  const hasPendingAccept = useMemo(
    () => orders.some((o) => o.status === "created" && !o.id.startsWith("core-")),
    [orders]
  );

  const hasActivePipeline = useMemo(
    () => orders.some((o) => isActiveMerchantOrderStage(o.status)),
    [orders]
  );

  const pollIntervalMs =
    hasPendingAccept || hasActivePipeline ? POLL_FAST_MS : POLL_NORMAL_MS;

  useMerchantOrdersRealtime({
    storeId,
    enabled: Boolean(token && storeId),
    authToken: token,
    onOrdersStale: () => {
      void refetch();
    },
    onFoodRowChange: (foodId) => {
      void applyRealtimeFoodRow(foodId);
    },
  });

  useEffect(() => {
    const id = setInterval(() => {
      void refetch();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refetch]);

  // Read-only freshness sync when app is resumed.
  useEffect(() => {
    if (!token || !storeId) return;
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") void refetch();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [token, storeId, refetch]);

  useEffect(() => {
    if (!hasPendingAccept) return undefined;
    const id = setInterval(() => setOrderNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasPendingAccept]);

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
      upsertOrder,
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
      upsertOrder,
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
