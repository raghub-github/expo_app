import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@gatimitra/sdk";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  classifyRiderActionFailure,
  isRetryableRiderActionFailure,
  riderActionRetryDelayMs,
  RiderActionBusyError,
  type RiderActionType,
} from "@/src/lib/rider-action-kind";
import { riderActionLog } from "@/src/lib/rider-action-log";
import { isRiderNetworkOnline } from "@/src/stores/riderNetworkStore";
import { useRiderPendingActionStore } from "@/src/stores/riderPendingActionStore";
import { isOrderTakenByAnotherRiderError } from "@/src/lib/rider-dispatch-accept-errors";

const ACTIVE_KEY = ["rider", "orders", "active"] as const;
const detailKey = (orderId: string) => ["rider", "orders", "detail", orderId] as const;

const inflight = new Set<string>();
let queryClient: QueryClient | null = null;
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function bindRiderActionRuntime(qc: QueryClient): void {
  queryClient = qc;
}

function orderMatches(order: RiderOrderSummary, orderId: string): boolean {
  const id = orderId.trim();
  return (
    order.id === id ||
    order.formattedOrderId === id ||
    (order.formattedOrderId != null && order.formattedOrderId.trim() === id)
  );
}

async function loadAuthoritativeOrder(orderId: string): Promise<RiderOrderSummary | null> {
  try {
    return await riderApi.getRideOrder(orderId);
  } catch {
    try {
      const active = await riderApi.getActiveOrders();
      return active.find((o) => orderMatches(o, orderId)) ?? null;
    } catch {
      return null;
    }
  }
}

type ReconcileResult = {
  status: "success" | "retry" | "taken" | "unknown";
  order: RiderOrderSummary | null;
};

function seedOrderCaches(order: RiderOrderSummary): void {
  if (!queryClient) return;
  queryClient.setQueryData(detailKey(order.id), order);
  if (order.formattedOrderId) queryClient.setQueryData(detailKey(order.formattedOrderId), order);
  queryClient.setQueryData(ACTIVE_KEY, (prev: RiderOrderSummary[] | undefined) => {
    const list = Array.isArray(prev) ? prev : [];
    if (list.some((o) => o.id === order.id)) {
      return list.map((o) => (o.id === order.id ? order : o));
    }
    return [order, ...list];
  });
}

function dropOfferCaches(order: RiderOrderSummary, orderRef: string): void {
  if (!queryClient) return;
  const drop = (list: RiderOrderSummary[] | undefined) =>
    Array.isArray(list)
      ? list.filter(
          (o) =>
            o.id !== order.id &&
            o.id !== orderRef &&
            (!order.formattedOrderId || o.formattedOrderId !== order.formattedOrderId)
        )
      : list;
  queryClient.setQueryData(["rider", "orders", "available"], drop);
  queryClient.setQueryData(["rider", "orders", "pending-offers"], drop);
}

function dropActiveOrderCaches(orderRef: string): void {
  if (!queryClient) return;
  queryClient.setQueryData(ACTIVE_KEY, (prev: RiderOrderSummary[] | undefined) =>
    Array.isArray(prev) ? prev.filter((o) => !orderMatches(o, orderRef)) : prev
  );
}

function emptyCancelAssignedResult<T>(): T {
  return { ok: true, penaltyApplied: false, penaltyAmount: 0 } as T;
}

export async function reconcileRiderAction(
  actionType: RiderActionType,
  orderId: string
): Promise<ReconcileResult> {
  riderActionLog("RECONCILE_START", { action_type: actionType, order_id: orderId });
  if (actionType === "cancel_assigned") {
    try {
      const active = await riderApi.getActiveOrders();
      if (active.some((o) => orderMatches(o, orderId))) {
        return { status: "retry", order: null };
      }
      dropActiveOrderCaches(orderId);
      riderActionLog("RECONCILE_SUCCESS", {
        action_type: actionType,
        order_id: orderId,
        cancelled: true,
      });
      return { status: "success", order: null };
    } catch {
      return { status: "unknown", order: null };
    }
  }
  if (actionType === "accept") {
    try {
      const active = await riderApi.getActiveOrders();
      const owned = active.find((o) => orderMatches(o, orderId));
      if (owned) {
        riderActionLog("RECONCILE_SUCCESS", { action_type: actionType, order_id: orderId, owned: true });
        seedOrderCaches(owned);
        dropOfferCaches(owned, orderId);
        return { status: "success", order: owned };
      }
    } catch {
      return { status: "unknown", order: null };
    }
    try {
      const available = await riderApi.getAvailableOrders();
      if (available.some((o) => orderMatches(o, orderId))) {
        return { status: "retry", order: null };
      }
    } catch {
      return { status: "unknown", order: null };
    }
    riderActionLog("RECONCILE_SUCCESS", { action_type: actionType, order_id: orderId, taken: true });
    return { status: "taken", order: null };
  }

  const order = await loadAuthoritativeOrder(orderId);
  if (!order) return { status: "unknown", order: null };

  const done =
    (actionType === "reached_pickup" &&
      (order.atPickup === true || order.pickupOtpVerified === true || order.rideStarted === true)) ||
    (actionType === "reached_drop" && (order.atCustomer === true || order.status === "delivered")) ||
    (actionType === "mark_pickup" &&
      (order.status === "picked_up" || order.status === "in_transit" || order.rideStarted === true)) ||
    (actionType === "start_ride" && (order.rideStarted === true || order.status === "in_transit")) ||
    (actionType === "complete_ride" && order.status === "delivered") ||
    (actionType === "verify_pickup_otp" &&
      (order.pickupOtpVerified === true ||
        order.rideStarted === true ||
        order.status === "picked_up" ||
        order.status === "in_transit")) ||
    (actionType === "verify_delivery_otp" && order.status === "delivered");

  if (done) {
    seedOrderCaches(order);
    riderActionLog("RECONCILE_SUCCESS", { action_type: actionType, order_id: orderId });
    return { status: "success", order };
  }
  return { status: "retry", order };
}

type ExecuteArgs<T> = {
  orderId: string;
  actionType: RiderActionType;
  payload?: Record<string, unknown>;
  send: (actionId: string) => Promise<T>;
};

/**
 * One in-flight request per (order, action). Timeouts become UNKNOWN and
 * reconcile instead of a second logical action.
 */
export async function executeRiderAction<T>(args: ExecuteArgs<T>): Promise<T> {
  const store = useRiderPendingActionStore.getState();
  const pending = store.getOrCreate(args.orderId, args.actionType, args.payload ?? {});
  const actionId = pending.actionId;
  const started = Date.now();

  if (inflight.has(actionId)) {
    riderActionLog("RETRY", { action_id: actionId, order_id: args.orderId, skipped: "inflight" });
    throw new RiderActionBusyError();
  }

  inflight.add(actionId);
  store.update(actionId, {
    phase: isRiderNetworkOnline() ? "processing" : "waiting_network",
    lastAttemptAt: Date.now(),
  });
  riderActionLog("START", {
    action_id: actionId,
    order_id: args.orderId,
    action_type: args.actionType,
  });

  try {
    if (!isRiderNetworkOnline()) {
      store.update(actionId, { phase: "waiting_network" });
      riderActionLog("NETWORK_ERROR", { action_id: actionId, order_id: args.orderId });
      throw new Error("No internet connection");
    }

    riderActionLog("REQUEST_SENT", {
      action_id: actionId,
      order_id: args.orderId,
      action_type: args.actionType,
    });
    const result = await args.send(actionId);
    store.remove(actionId);
    if (args.actionType === "cancel_assigned") {
      dropActiveOrderCaches(args.orderId);
    }
    if (result && typeof result === "object" && "id" in result) {
      const order = result as unknown as RiderOrderSummary;
      if (typeof order.id === "string" && order.id) {
        seedOrderCaches(order);
        if (args.actionType === "accept") dropOfferCaches(order, args.orderId);
      }
    }
    riderActionLog("SUCCESS", {
      action_id: actionId,
      order_id: args.orderId,
      action_type: args.actionType,
      duration: Date.now() - started,
    });
    return result;
  } catch (err) {
    const kind = classifyRiderActionFailure(err);
    if (kind === "timeout") {
      riderActionLog("TIMEOUT", {
        action_id: actionId,
        order_id: args.orderId,
        action_type: args.actionType,
        duration: Date.now() - started,
      });
    } else if (kind === "network") {
      riderActionLog("NETWORK_ERROR", {
        action_id: actionId,
        order_id: args.orderId,
        action_type: args.actionType,
      });
    }

    if (kind === "busy") {
      throw err;
    }

    if (
      args.actionType === "cancel_assigned" &&
      (kind === "conflict" || kind === "business")
    ) {
      const outcome = await reconcileRiderAction("cancel_assigned", args.orderId);
      if (outcome.status === "success") {
        store.remove(actionId);
        dropActiveOrderCaches(args.orderId);
        return emptyCancelAssignedResult<T>();
      }
      store.remove(actionId);
      riderActionLog("BUSINESS_FAILURE", {
        action_id: actionId,
        order_id: args.orderId,
        action_type: args.actionType,
        kind,
      });
      throw err;
    }

    if (kind === "conflict" && args.actionType === "accept") {
      if (isOrderTakenByAnotherRiderError(err)) {
        store.remove(actionId);
        riderActionLog("BUSINESS_FAILURE", {
          action_id: actionId,
          order_id: args.orderId,
          action_type: args.actionType,
          kind: "taken",
        });
        throw err;
      }
      store.update(actionId, { phase: "reconciling" });
      riderActionLog("UNKNOWN_RESULT", { action_id: actionId, order_id: args.orderId });
      const outcome = await reconcileRiderAction("accept", args.orderId);
      if (outcome.status === "success" && outcome.order) {
        store.remove(actionId);
        return outcome.order as T;
      }
      if (outcome.status === "taken") {
        store.remove(actionId);
        throw err instanceof ApiError
          ? err
          : new ApiError("ORDER_ALREADY_ASSIGNED", 409, { code: "ORDER_ALREADY_ASSIGNED" });
      }
      store.update(actionId, {
        phase: "waiting_network",
        retryCount: pending.retryCount + 1,
        lastAttemptAt: Date.now(),
      });
      schedulePendingRetry(actionId);
      throw err;
    }

    if (!isRetryableRiderActionFailure(kind)) {
      store.remove(actionId);
      riderActionLog("BUSINESS_FAILURE", {
        action_id: actionId,
        order_id: args.orderId,
        action_type: args.actionType,
        kind,
      });
      throw err;
    }

    store.update(actionId, {
      phase: kind === "timeout" ? "reconciling" : "waiting_network",
      retryCount: pending.retryCount + 1,
      lastAttemptAt: Date.now(),
    });

    if (kind === "timeout" || args.actionType === "cancel_assigned") {
      riderActionLog("UNKNOWN_RESULT", { action_id: actionId, order_id: args.orderId });
      const outcome = await reconcileRiderAction(args.actionType, args.orderId);
      if (outcome.status === "success") {
        store.remove(actionId);
        if (outcome.order) return outcome.order as T;
        if (args.actionType === "cancel_assigned") {
          dropActiveOrderCaches(args.orderId);
          return emptyCancelAssignedResult<T>();
        }
      }
      if (outcome.status === "taken") {
        store.remove(actionId);
        throw new ApiError("ORDER_ALREADY_ASSIGNED", 409, { code: "ORDER_ALREADY_ASSIGNED" });
      }
      store.update(actionId, { phase: "waiting_network" });
    }

    schedulePendingRetry(actionId);
    throw err;
  } finally {
    inflight.delete(actionId);
  }
}

function schedulePendingRetry(actionId: string): void {
  if (retryTimers.has(actionId)) return;
  const action = useRiderPendingActionStore.getState().actions.find((a) => a.actionId === actionId);
  if (!action) return;
  const delay = riderActionRetryDelayMs(action.retryCount);
  const timer = setTimeout(() => {
    retryTimers.delete(actionId);
    void flushRiderPendingActions();
  }, delay);
  retryTimers.set(actionId, timer);
}

export async function flushRiderPendingActions(): Promise<void> {
  const store = useRiderPendingActionStore.getState();
  if (!store.hydrated) await store.hydrate();
  if (!isRiderNetworkOnline()) return;
  const pending = [...store.actions];
  for (const action of pending) {
    if (inflight.has(action.actionId)) continue;
    riderActionLog("RETRY", {
      action_id: action.actionId,
      order_id: action.orderId,
      action_type: action.actionType,
    });
    try {
      await executeRiderAction({
        orderId: action.orderId,
        actionType: action.actionType,
        payload: action.payload,
        send: async (actionId) => {
          const gps = {
            lat: typeof action.payload.lat === "number" ? action.payload.lat : undefined,
            lng: typeof action.payload.lng === "number" ? action.payload.lng : undefined,
          };
          switch (action.actionType) {
            case "accept":
              return riderApi.acceptOrder(action.orderId, { actionId });
            case "reached_pickup":
              return riderApi.markReachedPickup(action.orderId, gps, { actionId });
            case "reached_drop":
              return riderApi.markReachedCustomer(action.orderId, gps, { actionId });
            case "mark_pickup":
              return riderApi.markFoodPickup(action.orderId, gps, { actionId });
            case "start_ride":
              return riderApi.startRide(action.orderId, gps, { actionId });
            case "complete_ride":
              return riderApi.completeRide(action.orderId, gps, { actionId });
            case "verify_pickup_otp": {
              const otp = String(action.payload.otp ?? "").replace(/\D/g, "");
              if (otp.length < 4) throw new Error("Missing pickup OTP");
              return riderApi.verifyPickupOtp(action.orderId, {
                otp,
                ...gps,
              }, { actionId });
            }
            case "verify_delivery_otp": {
              const otp = String(action.payload.otp ?? "").replace(/\D/g, "");
              if (otp.length < 4) throw new Error("Missing delivery OTP");
              return riderApi.verifyDeliveryOtp(action.orderId, {
                otp,
                lat: gps.lat,
                lng: gps.lng,
                deliveryImageUrl:
                  typeof action.payload.deliveryImageUrl === "string"
                    ? action.payload.deliveryImageUrl
                    : undefined,
                deliveryImageR2Key:
                  typeof action.payload.deliveryImageR2Key === "string"
                    ? action.payload.deliveryImageR2Key
                    : undefined,
              }, { actionId });
            }
            case "cancel_assigned": {
              const reasonCode = String(action.payload.reasonCode ?? "").trim();
              if (!reasonCode) throw new Error("Missing cancel reason");
              return riderApi.cancelAssignedRide(
                action.orderId,
                {
                  reasonCode,
                  reasonText:
                    typeof action.payload.reasonText === "string"
                      ? action.payload.reasonText
                      : undefined,
                },
                { actionId }
              );
            }
            default:
              throw new Error("Unknown action");
          }
        },
      });
      if (queryClient) {
        void queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
        void queryClient.invalidateQueries({ queryKey: detailKey(action.orderId) });
      }
    } catch {
      // Bounded retry already scheduled inside executeRiderAction.
    }
  }
}
