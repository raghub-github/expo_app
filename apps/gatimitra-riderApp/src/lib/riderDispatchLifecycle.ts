import { AppState, type AppStateStatus } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import {
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  RIDER_AVAILABLE_ORDERS_QUERY_KEY,
  RIDER_PENDING_OFFERS_QUERY_KEY,
} from "@/src/hooks/useOrders";
import {
  clearDispatchFetchInFlight,
  fetchAvailableOrdersForDispatch,
  fetchPendingOffersForDispatch,
  isDispatchFetchTimeoutError,
} from "@/src/lib/riderDispatchFetch";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { detectNewOfferIds, mergeIncomingOfferLists } from "@/src/lib/incomingDispatchOffers";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import { isRiderDispatchRealtimeActive, useRiderWsStore } from "@/src/stores/riderWsStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import {
  DUTY_SYNC_MS,
  recoveryIntervalMs,
} from "@/src/lib/riderDispatchPolicy";
import { subscribeRiderNetworkRestored } from "@/src/stores/riderNetworkStore";

export { dispatchSessionKey, recoveryIntervalMs, WS_CONNECTED_RECOVERY_MS, WS_DOWN_RECOVERY_MS, DUTY_SYNC_MS } from "@/src/lib/riderDispatchPolicy";

const MIN_RECOVER_GAP_MS = 1_200;
const ABORT_RETRY_MS = 2_000;
const MAX_ABORT_RETRIES = 2;
const DISPATCH_G = "__gmRiderDispatchLifecycleV3";

type ActiveLifecycle = {
  queryClient: QueryClient;
  sessionKey: string;
  riderId: string;
};

type DispatchRuntime = {
  active: ActiveLifecycle | null;
  recoverTimer: ReturnType<typeof setInterval> | null;
  dutyTimer: ReturnType<typeof setInterval> | null;
  abortRetryTimer: ReturnType<typeof setTimeout> | null;
  recovering: boolean;
  recoverGen: number;
  abortRetryAttempts: number;
  lastRecoverAt: number;
  lastIntervalMs: number;
  pendingRecoverReason: string | null;
  seenOfferIds: Set<string>;
  listenersWired: boolean;
  appStateSub: { remove: () => void } | null;
  netUnsub: (() => void) | null;
  wsUnsub: (() => void) | null;
  wasOffline: boolean;
  prevWsLive: boolean;
  runRecover: (reason: string, opts?: { force?: boolean }) => Promise<void>;
};

function emptyRuntime(): DispatchRuntime {
  return {
    active: null,
    recoverTimer: null,
    dutyTimer: null,
    abortRetryTimer: null,
    recovering: false,
    recoverGen: 0,
    abortRetryAttempts: 0,
    lastRecoverAt: 0,
    lastIntervalMs: 0,
    pendingRecoverReason: null,
    seenOfferIds: new Set(),
    listenersWired: false,
    appStateSub: null,
    netUnsub: null,
    wsUnsub: null,
    wasOffline: false,
    prevWsLive: false,
    runRecover: async () => {},
  };
}

function runtime(): DispatchRuntime {
  const root = globalThis as typeof globalThis & { [DISPATCH_G]?: DispatchRuntime };
  if (!root[DISPATCH_G]) root[DISPATCH_G] = emptyRuntime();
  return root[DISPATCH_G]!;
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (isDispatchFetchTimeoutError(err)) return false;
  if (typeof err === "object" && (err as { name?: string }).name === "AbortError") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /^Aborted$/i.test(msg.trim());
}

function shouldQueueWhileRecovering(reason: string, force?: boolean): boolean {
  if (
    reason === "interval" ||
    reason === "lifecycle_already_running" ||
    reason === "ws_reconnect" ||
    reason === "abort_retry" ||
    reason.startsWith("ingest:")
  ) {
    return false;
  }
  return force === true;
}

function clearTimers(): void {
  const rt = runtime();
  if (rt.recoverTimer) {
    clearInterval(rt.recoverTimer);
    rt.recoverTimer = null;
  }
  if (rt.dutyTimer) {
    clearInterval(rt.dutyTimer);
    rt.dutyTimer = null;
  }
  if (rt.abortRetryTimer) {
    clearTimeout(rt.abortRetryTimer);
    rt.abortRetryTimer = null;
  }
  rt.lastIntervalMs = 0;
}

function armRecoveryTimer(): void {
  const rt = runtime();
  if (!rt.active) return;
  const ms = recoveryIntervalMs(isRiderDispatchRealtimeActive());
  if (rt.recoverTimer && rt.lastIntervalMs === ms) return;
  if (rt.recoverTimer) clearInterval(rt.recoverTimer);
  rt.lastIntervalMs = ms;
  rt.recoverTimer = setInterval(() => {
    if (AppState.currentState !== "active") return;
    void rt.runRecover("interval");
  }, ms);
}

function armDutySyncTimer(): void {
  const rt = runtime();
  if (!rt.active) return;
  if (rt.dutyTimer) return;
  rt.dutyTimer = setInterval(() => {
    if (AppState.currentState !== "active") return;
    void useDutyStore.getState().syncFromServer();
  }, DUTY_SYNC_MS);
}

function ensureGlobalListeners(): void {
  const rt = runtime();
  if (rt.listenersWired) return;
  rt.listenersWired = true;

  rt.appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state !== "active") return;
    void rt.runRecover("app_foreground", { force: true });
  });

  rt.netUnsub = subscribeRiderNetworkRestored(() => {
    void rt.runRecover("network_restored", { force: true });
    const qc = rt.active?.queryClient;
    if (qc) {
      void qc.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
    }
  });

  rt.prevWsLive = isRiderDispatchRealtimeActive();
  rt.wsUnsub = useRiderWsStore.subscribe(() => {
    const live = isRiderDispatchRealtimeActive();
    if (live !== rt.prevWsLive) {
      armRecoveryTimer();
    }
    if (live && !rt.prevWsLive) {
      riderDispatchLog("WS_CONNECTED");
      void rt.runRecover("ws_reconnect", { force: true });
    } else if (!live && rt.prevWsLive) {
      riderDispatchLog("WS_DISCONNECTED");
    }
    rt.prevWsLive = live;
  });
}

export function resetDispatchClientState(queryClient: QueryClient, reason: string): void {
  runtime().seenOfferIds = new Set();
  useIncomingDispatchOfferStore.getState().reset();
  queryClient.removeQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
  queryClient.removeQueries({ queryKey: RIDER_PENDING_OFFERS_QUERY_KEY });
  riderDispatchLog("DISPATCH STOPPED", { reason });
}

export async function recoverDispatchOffers(
  reason: string,
  opts?: { force?: boolean }
): Promise<void> {
  const rt = runtime();
  const current = rt.active;
  if (!current) return;
  if (rt.recovering) {
    if (shouldQueueWhileRecovering(reason, opts?.force)) {
      rt.pendingRecoverReason = reason;
    }
    return;
  }
  if (!opts?.force && Date.now() - rt.lastRecoverAt < MIN_RECOVER_GAP_MS) return;

  const gen = ++rt.recoverGen;
  rt.recovering = true;
  rt.lastRecoverAt = Date.now();
  riderDispatchLog("RECOVERY_START", { reason, sessionKey: current.sessionKey });

  try {
    const applyRecovered = (
      availableRows: RiderOrderSummary[],
      pendingRows: RiderOrderSummary[]
    ) => {
      const store = useIncomingDispatchOfferStore.getState();
      const notCancelled = (o: RiderOrderSummary) =>
        !store.isCancelled(o.id) &&
        !store.isCancelled(String(o.formattedOrderId ?? "").trim());
      const filteredAvailable = availableRows.filter(notCancelled);
      const filteredPending = pendingRows.filter(notCancelled);
      current.queryClient.setQueryData(RIDER_AVAILABLE_ORDERS_QUERY_KEY, filteredAvailable);
      current.queryClient.setQueryData(RIDER_PENDING_OFFERS_QUERY_KEY, filteredPending);
      const merged = mergeIncomingOfferLists(filteredAvailable, filteredPending);
      const nextIds = merged.map((o) => o.id).filter(Boolean);
      const newIds = detectNewOfferIds(rt.seenOfferIds, nextIds);
      for (const id of newIds) {
        if (store.isCancelled(id)) {
          riderDispatchLog("STALE_OFFER_DROPPED", { orderId: id, source: reason });
          continue;
        }
        rt.seenOfferIds.add(id);
        store.ingestOfferId(id, current.riderId);
        riderDispatchLog("OFFER_RECEIVED", { orderId: id, source: reason });
      }
      riderDispatchLog("OFFER MERGED", {
        reason,
        pending: filteredPending.length,
        available: filteredAvailable.length,
        merged: merged.length,
        newOfferIds: newIds,
      });
    };

    let pending: RiderOrderSummary[] = [];
    try {
      pending = await fetchPendingOffersForDispatch();
    } catch (err) {
      riderDispatchWarn("fetch pending failed during recover", {
        reason,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (rt.recoverGen !== gen || !rt.active) return;
    if (pending.length > 0) {
      applyRecovered(pending, pending);
    }

    try {
      const available = await fetchAvailableOrdersForDispatch();
      if (rt.recoverGen !== gen || !rt.active) return;
      applyRecovered(available, pending);
      rt.abortRetryAttempts = 0;
    } catch (err) {
      if (pending.length > 0 && !isAbortError(err)) {
        riderDispatchWarn("fetch available failed; keeping pending offers", {
          reason,
          message: err instanceof Error ? err.message : String(err),
        });
        rt.abortRetryAttempts = 0;
        return;
      }
      throw err;
    }
  } catch (err) {
    if (rt.recoverGen !== gen) return;
    if (isDispatchFetchTimeoutError(err)) {
      riderDispatchWarn("RECOVERY TIMEOUT", {
        reason,
        message: err instanceof Error ? err.message : String(err),
      });
    } else if (isAbortError(err)) {
      riderDispatchLog("RECOVERY_ABORTED", { reason, sessionKey: current.sessionKey });
      if (rt.abortRetryAttempts < MAX_ABORT_RETRIES) {
        rt.pendingRecoverReason = rt.pendingRecoverReason ?? "abort_retry";
      }
    } else {
      riderDispatchWarn("RECOVERY FAILED", {
        reason,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    if (rt.recoverGen !== gen) return;
    rt.recovering = false;
    const queued = rt.pendingRecoverReason;
    rt.pendingRecoverReason = null;
    if (queued && rt.active) {
      const delay = queued === "abort_retry" ? ABORT_RETRY_MS : 0;
      const startQueued = () => {
        if (!rt.active || rt.recovering || rt.recoverGen !== gen) return;
        if (queued === "abort_retry") rt.abortRetryAttempts += 1;
        void rt.runRecover(queued, { force: true });
      };
      if (delay > 0) {
        if (rt.abortRetryTimer) clearTimeout(rt.abortRetryTimer);
        rt.abortRetryTimer = setTimeout(startQueued, delay);
      } else {
        startQueued();
      }
    }
  }
}

runtime().runRecover = recoverDispatchOffers;

export function startRiderDispatchLifecycle(input: {
  queryClient: QueryClient;
  sessionKey: string;
  riderId: string;
}): void {
  const rt = runtime();
  rt.runRecover = recoverDispatchOffers;
  ensureGlobalListeners();

  if (rt.active && rt.active.sessionKey === input.sessionKey) {
    rt.active.queryClient = input.queryClient;
    rt.active.riderId = input.riderId;
    armRecoveryTimer();
    armDutySyncTimer();
    return;
  }

  if (rt.active && rt.active.sessionKey !== input.sessionKey) {
    resetDispatchClientState(rt.active.queryClient, "rider_switch");
  }

  stopRiderDispatchLifecycle("restart");
  clearDispatchFetchInFlight();
  rt.active = {
    queryClient: input.queryClient,
    sessionKey: input.sessionKey,
    riderId: input.riderId,
  };
  rt.seenOfferIds = new Set();
  rt.abortRetryAttempts = 0;
  rt.pendingRecoverReason = null;
  riderDispatchLog("DISPATCH STARTED", {
    sessionKey: input.sessionKey,
    riderId: input.riderId,
  });
  armRecoveryTimer();
  armDutySyncTimer();
  void recoverDispatchOffers("dispatch_started", { force: true });
}

export function stopRiderDispatchLifecycle(reason: string): void {
  const rt = runtime();
  rt.recoverGen += 1;
  rt.recovering = false;
  rt.pendingRecoverReason = null;
  rt.abortRetryAttempts = 0;
  clearTimers();
  if (!rt.active) return;
  const qc = rt.active.queryClient;
  rt.active = null;
  if (reason === "logout" || reason === "unauthenticated" || reason === "rider_switch") {
    resetDispatchClientState(qc, reason);
  } else {
    riderDispatchLog("DISPATCH STOPPED", { reason });
  }
}

export function isRiderDispatchLifecycleActive(): boolean {
  return runtime().active != null;
}

/** Test helper — not used in production paths. */
export function _resetDispatchLifecycleForTests(): void {
  const rt = runtime();
  clearTimers();
  rt.active = null;
  rt.recovering = false;
  rt.recoverGen += 1;
  rt.abortRetryAttempts = 0;
  rt.lastRecoverAt = 0;
  rt.seenOfferIds = new Set();
  rt.wasOffline = false;
  rt.prevWsLive = false;
  rt.pendingRecoverReason = null;
  rt.listenersWired = false;
  rt.appStateSub?.remove();
  rt.appStateSub = null;
  rt.netUnsub?.();
  rt.netUnsub = null;
  rt.wsUnsub?.();
  rt.wsUnsub = null;
}
