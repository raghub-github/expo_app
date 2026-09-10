/**
 * Keeps the single STORE STATUS tray notification in sync with backend
 * store availability + live kitchen breakdown (Waiting / Prep / Ready / Out).
 *
 * Posts board-derived body immediately, then confirms with the count API.
 * Never posts bare "Waiting for orders" when Active orders exist on the board.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
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
  getActiveOrdersBreakdown,
  invalidateActiveOrdersCountCache,
  type ActiveOrdersBreakdown,
} from "@/services/storeSettingsApi";

const KITCHEN_POLL_MS = 12_000;

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

function boardKitchenSignature(orders: OrderRecord[]): string {
  const b = breakdownFromBoard(orders);
  return `${b.pending_accept}|${b.preparing}|${b.ready}|${b.out_for_delivery}`;
}

export default function LiveOrdersOngoingNotification() {
  const { token, isAuthenticated, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline, statusReason, unavailableReason, loading } = useStoreStatus();
  const { orders } = useOrders();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name ?? null;
  const merchantId = partner?.parent?.parent_merchant_id ?? null;
  const prevStoreId = useRef<number | null>(null);
  const syncGen = useRef(0);
  const lastBoardSig = useRef("");
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const syncOnlineTrayRef = useRef<(source: string) => Promise<void>>(async () => undefined);

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

  const syncOnlineTray = async (source: string) => {
    if (!canRunLocalSticky()) return;
    if (!isAuthenticated || storeId == null || !token || !isOnline) return;

    const gen = ++syncGen.current;
    setKitchenStickyStoreMeta({ storeId, storeName, merchantId });
    setKitchenStickyAllowed(true);

    // 1) Instant board-based body so tray never stays on Waiting while Active > 0.
    const board = breakdownFromBoard(ordersRef.current);
    const boardBody = formatKitchenStickyBody(board);
    await postStoreStatusNotification({
      state: "ONLINE",
      storeId,
      merchantId,
      storeName,
      source: `${source}_BOARD`,
      bodyOverride: boardBody,
      force: true,
      eventId: `ONLINE_BOARD:${storeId}:${boardKitchenSignature(ordersRef.current)}:${Date.now()}`,
    });
    if (gen !== syncGen.current) return;

    // 2) Confirm with API (may include stages not yet on the local board).
    invalidateActiveOrdersCountCache(storeId);
    try {
      const api = await getActiveOrdersBreakdown(storeId, token);
      if (gen !== syncGen.current) return;
      // API is SSOT — board is only for the instant first paint above.
      const bodyOverride = formatKitchenStickyBody(api);
      await postStoreStatusNotification({
        state: "ONLINE",
        storeId,
        merchantId,
        storeName,
        source: `${source}_API`,
        bodyOverride,
        force: true,
        eventId: `ONLINE_API:${storeId}:${Date.now()}`,
      });
    } catch {
      /* board body already posted */
    }
  };
  syncOnlineTrayRef.current = syncOnlineTray;

  useEffect(() => {
    if (!canRunLocalSticky()) return;
    if (!isAuthenticated) {
      setKitchenStickyAllowed(false);
      setKitchenStickyStoreMeta(null);
      void removeStoreStatusNotification("LOGOUT");
      return;
    }
    if (loading) return;

    const prev = prevStoreId.current;
    if (prev != null && storeId != null && prev !== storeId) {
      void removeStoreStatusNotification("STORE_SWITCH");
    }
    prevStoreId.current = storeId;

    if (storeId != null && isOnline && token) {
      void syncOnlineTrayRef.current("STATUS_CHANGE");
      return;
    }

    setKitchenStickyAllowed(false);
    setKitchenStickyStoreMeta(null);
    void reconcileStoreStatusNotification({
      authenticated: true,
      storeId,
      merchantId,
      storeName,
      isOnline,
      statusReason,
      unavailableReason,
      source: "STATUS_CHANGE",
    });
  }, [
    isAuthenticated,
    loading,
    storeId,
    storeName,
    merchantId,
    isOnline,
    statusReason,
    unavailableReason,
    token,
  ]);

  // When Active board changes (accept / ready / OFD), refresh tray immediately.
  useEffect(() => {
    if (!canRunLocalSticky()) return;
    if (!isAuthenticated || !isOnline || storeId == null || !token) return;
    const sig = boardKitchenSignature(orders);
    if (sig === lastBoardSig.current) return;
    lastBoardSig.current = sig;
    void syncOnlineTrayRef.current("BOARD_CHANGE");
  }, [orders, isAuthenticated, isOnline, storeId, token]);

  useEffect(() => {
    if (!canRunLocalSticky()) return;
    if (!isAuthenticated || !token || storeId == null || !isOnline) return;

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void syncOnlineTrayRef.current("APP_RESUME");
    });

    const poll = setInterval(() => {
      void syncOnlineTrayRef.current("KITCHEN_POLL");
    }, KITCHEN_POLL_MS);

    // Immediate sync on mount of this effect (online session).
    void syncOnlineTrayRef.current("ONLINE_MOUNT");

    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, [isAuthenticated, token, storeId, isOnline]);

  return null;
}
