/**
 * Owns the single STORE STATUS tray notification, driven by STATE TRANSITIONS only.
 *
 * A pure state machine (storeStatusMachine) decides — from backend-authoritative online status +
 * live active-order counts — whether a transition warrants a notification:
 *   OFFLINE→ONLINE_IDLE / ORDER_ACTIVE→ONLINE_IDLE → ONE "Waiting for orders" per idle session
 *   *→ORDER_ACTIVE / kitchen counts changed          → update the Prep·Ready·Out sticky in place
 *   online→OFFLINE                                   → offline tray once
 *   idle→idle / offline→offline / unchanged kitchen  → NOTHING
 *
 * Polls / board changes / app-resume are STATE SYNCS: they re-run the machine, which no-ops unless a
 * real transition occurred. The idle session is persisted per store so a background/kill/restart
 * mid-idle never re-posts, and clearing the tray never re-posts (§4/§7/§10/§42). App lifecycle never
 * implies OFFLINE — online status is backend-authoritative (§27–46).
 */
import { useCallback, useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useOrders, type OrderRecord } from "@/hooks/useOrders";
import {
  dismissLiveOrdersOngoingNotification,
  formatKitchenStickyBody,
  setKitchenStickyAllowed,
  setKitchenStickyStoreMeta,
} from "@/lib/liveOrdersOngoingNotification";
import {
  postStoreStatusNotification,
  reconcileStoreStatusNotification,
  removeStoreStatusNotification,
} from "@/lib/storeStatusNotification";
import {
  createInitialSessionState,
  reduceStoreStatusSession,
  type StoreStatusSessionState,
} from "@/lib/storeStatusMachine";
import {
  getActiveOrdersBreakdown,
  invalidateActiveOrdersCountCache,
  type ActiveOrdersBreakdown,
} from "@/services/storeSettingsApi";

const KITCHEN_POLL_MS = 12_000;
const SESSION_KEY_PREFIX = "merchant_store_status_session_";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/** Local Waiting / kitchen sticky — Android only (Expo Go allowed for local tray). */
function canRunLocalSticky(): boolean {
  return Platform.OS === "android";
}

function breakdownFromBoard(orders: OrderRecord[]): ActiveOrdersBreakdown {
  let pending_accept = 0;
  let preparing = 0;
  let ready = 0;
  let out_for_delivery = 0;
  for (const o of orders) {
    const s = String(o.status ?? "").toLowerCase();
    if (s === "created") pending_accept += 1;
    else if (s === "preparing") preparing += 1;
    else if (s === "ready") ready += 1;
    else if (s === "picked_up") out_for_delivery += 1;
  }
  return {
    active_orders: pending_accept + preparing + ready + out_for_delivery,
    pending_accept,
    preparing,
    ready,
    out_for_delivery,
  };
}

async function loadSession(storeId: number): Promise<StoreStatusSessionState> {
  try {
    const raw = await SecureStore.getItemAsync(`${SESSION_KEY_PREFIX}${storeId}`);
    if (!raw) return createInitialSessionState();
    const parsed = JSON.parse(raw) as StoreStatusSessionState;
    if (parsed && typeof parsed === "object") {
      return {
        opState:
          parsed.opState === "OFFLINE" || parsed.opState === "ONLINE_IDLE" || parsed.opState === "ORDER_ACTIVE"
            ? parsed.opState
            : null,
        idleSessionId: typeof parsed.idleSessionId === "string" ? parsed.idleSessionId : null,
        idleNotifiedSessionId:
          typeof parsed.idleNotifiedSessionId === "string" ? parsed.idleNotifiedSessionId : null,
      };
    }
  } catch {
    /* corrupt / missing → fresh session */
  }
  return createInitialSessionState();
}

function saveSession(storeId: number, s: StoreStatusSessionState): void {
  void SecureStore.setItemAsync(`${SESSION_KEY_PREFIX}${storeId}`, JSON.stringify(s)).catch(() => {});
}

export default function LiveOrdersOngoingNotification() {
  const { token, isAuthenticated, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline, statusReason, unavailableReason, loading } = useStoreStatus();
  const { orders } = useOrders();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name ?? null;
  const merchantId = partner?.parent?.parent_merchant_id ?? null;

  // Live snapshot refs so the interval / AppState callbacks never read stale values.
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const ctxRef = useRef({ isAuthenticated, storeId, storeName, merchantId, isOnline, loading, token, statusReason, unavailableReason });
  ctxRef.current = { isAuthenticated, storeId, storeName, merchantId, isOnline, loading, token, statusReason, unavailableReason };

  // Persisted idle-session state (source of truth for the transition machine).
  const sessionRef = useRef<StoreStatusSessionState>(createInitialSessionState());
  const sessionLoadedRef = useRef(false);
  const sessionStoreIdRef = useRef<number | null>(null);
  const lastKitchenBodyRef = useRef<string>("");
  const evaluatingRef = useRef(false);

  // Dismiss the legacy live-orders id once so only one status row can exist.
  useEffect(() => {
    if (!canRunLocalSticky()) return;
    void dismissLiveOrdersOngoingNotification();
    if (isExpoGo()) {
      console.warn(
        "[STORE_STATUS] Running in Expo Go — local Waiting sticky can show under Expo Go, " +
          "but killed/bg FCM needs GatiMitra Partner (npm run start:dev-client + installed Partner app)."
      );
    }
  }, []);

  const applyAction = useCallback(
    async (
      action: ReturnType<typeof reduceStoreStatusSession>["action"],
      ctx: { storeId: number | null; storeName: string | null; merchantId: string | null; body: string; source: string }
    ) => {
      switch (action.type) {
        case "REMOVE":
          setKitchenStickyAllowed(false);
          setKitchenStickyStoreMeta(null);
          lastKitchenBodyRef.current = "";
          await removeStoreStatusNotification(action.reason);
          return;
        case "POST_OFFLINE":
          setKitchenStickyAllowed(false);
          setKitchenStickyStoreMeta(null);
          lastKitchenBodyRef.current = "";
          await reconcileStoreStatusNotification({
            authenticated: true,
            storeId: ctx.storeId,
            merchantId: ctx.merchantId,
            storeName: ctx.storeName,
            isOnline: false,
            statusReason: ctxRef.current.statusReason,
            unavailableReason: ctxRef.current.unavailableReason,
            source: ctx.source,
          });
          return;
        case "POST_IDLE":
          if (ctx.storeId == null) return;
          setKitchenStickyStoreMeta({ storeId: ctx.storeId, storeName: ctx.storeName, merchantId: ctx.merchantId });
          setKitchenStickyAllowed(true);
          lastKitchenBodyRef.current = "Waiting for orders";
          await postStoreStatusNotification({
            state: "ONLINE",
            storeId: ctx.storeId,
            merchantId: ctx.merchantId,
            storeName: ctx.storeName,
            source: `${ctx.source}_IDLE`,
            bodyOverride: "Waiting for orders",
            // Genuine new idle session — the machine only emits POST_IDLE on a real transition.
            force: true,
            eventId: `IDLE:${ctx.storeId}:${action.idleSessionId}`,
          });
          return;
        case "UPDATE_KITCHEN":
          if (ctx.storeId == null) return;
          setKitchenStickyStoreMeta({ storeId: ctx.storeId, storeName: ctx.storeName, merchantId: ctx.merchantId });
          setKitchenStickyAllowed(true);
          lastKitchenBodyRef.current = ctx.body;
          await postStoreStatusNotification({
            state: "ONLINE",
            storeId: ctx.storeId,
            merchantId: ctx.merchantId,
            storeName: ctx.storeName,
            source: `${ctx.source}_KITCHEN`,
            bodyOverride: ctx.body,
            // Real content change only — the machine emits UPDATE_KITCHEN just when counts differ.
            force: true,
            eventId: `KITCHEN:${ctx.storeId}:${ctx.body.slice(0, 48)}`,
          });
          return;
        case "NONE":
        default:
          return;
      }
    },
    []
  );

  /** Run the transition machine against one breakdown snapshot and act on the decision. */
  const runReduce = useCallback(
    async (breakdown: ActiveOrdersBreakdown, source: string) => {
      const c = ctxRef.current;
      const body = formatKitchenStickyBody(breakdown);
      const kitchenBodyChanged = body !== lastKitchenBodyRef.current;
      const { next, action } = reduceStoreStatusSession(sessionRef.current, {
        authenticated: c.isAuthenticated,
        storeId: c.storeId,
        isOnline: c.isOnline,
        activeOrders: breakdown.active_orders,
        kitchenBodyChanged,
        newIdleSessionId: `${c.storeId ?? 0}:${Date.now()}`,
      });
      sessionRef.current = next;
      if (c.storeId != null) saveSession(c.storeId, next);
      await applyAction(action, {
        storeId: c.storeId,
        storeName: c.storeName,
        merchantId: c.merchantId,
        body,
        source,
      });
    },
    [applyAction]
  );

  const evaluate = useCallback(
    async (source: string, opts?: { fetchApi?: boolean }) => {
      if (!canRunLocalSticky()) return;
      if (!sessionLoadedRef.current) return; // wait until the persisted session is restored
      if (evaluatingRef.current) return;
      evaluatingRef.current = true;
      try {
        const c = ctxRef.current;
        // Logged out / no store, or still loading first status — machine handles remove; loading is a no-op.
        if (!c.isAuthenticated || c.storeId == null) {
          await runReduce({ active_orders: 0, pending_accept: 0, preparing: 0, ready: 0, out_for_delivery: 0 }, source);
          return;
        }
        if (c.loading) return;

        if (!c.isOnline) {
          await runReduce({ active_orders: 0, pending_accept: 0, preparing: 0, ready: 0, out_for_delivery: 0 }, source);
          return;
        }

        // Online: instant board-derived snapshot first, then confirm with the authoritative API.
        await runReduce(breakdownFromBoard(ordersRef.current), `${source}_BOARD`);
        if (opts?.fetchApi && c.token && c.storeId != null) {
          invalidateActiveOrdersCountCache(c.storeId);
          try {
            const api = await getActiveOrdersBreakdown(c.storeId, c.token);
            await runReduce(api, `${source}_API`);
          } catch {
            /* board snapshot already applied */
          }
        }
      } finally {
        evaluatingRef.current = false;
      }
    },
    [runReduce]
  );
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;

  // Load / reset the persisted session whenever the selected store changes (store isolation §15).
  useEffect(() => {
    if (!canRunLocalSticky()) return;
    let cancelled = false;
    const prevStoreId = sessionStoreIdRef.current;
    if (prevStoreId != null && storeId != null && prevStoreId !== storeId) {
      void removeStoreStatusNotification("STORE_SWITCH");
    }
    sessionLoadedRef.current = false;
    sessionStoreIdRef.current = storeId;
    lastKitchenBodyRef.current = "";
    if (storeId == null) {
      sessionRef.current = createInitialSessionState();
      sessionLoadedRef.current = true;
      void evaluateRef.current("NO_STORE");
      return;
    }
    void loadSession(storeId).then((s) => {
      if (cancelled) return;
      sessionRef.current = s;
      sessionLoadedRef.current = true;
      void evaluateRef.current("SESSION_LOADED", { fetchApi: true });
    });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Re-evaluate on backend status / online / board changes — machine no-ops unless a real transition.
  useEffect(() => {
    if (!canRunLocalSticky()) return;
    void evaluateRef.current("STATUS_CHANGE", { fetchApi: true });
  }, [isAuthenticated, loading, isOnline, storeName, merchantId, statusReason, unavailableReason, token]);

  useEffect(() => {
    if (!canRunLocalSticky()) return;
    void evaluateRef.current("BOARD_CHANGE");
  }, [orders]);

  // Poll + foreground are STATE SYNCS (fetch authoritative counts); posting still gated by the machine.
  useEffect(() => {
    if (!canRunLocalSticky()) return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void evaluateRef.current("APP_RESUME", { fetchApi: true });
    });
    const poll = setInterval(() => {
      void evaluateRef.current("KITCHEN_POLL", { fetchApi: true });
    }, KITCHEN_POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, []);

  return null;
}
