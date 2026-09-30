/**
 * Rider native floating card. Count is the live offer pool (available + pending),
 * not notification history. The native window hides itself while this app is foreground.
 */
import { useEffect, useMemo } from "react";
import { AppState, NativeModules, Platform } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  canDrawNativeOverlays,
  consumePersistentPillLaunch,
  setPersistentOrderPill,
} from "@gatimitra/expo-push-kit";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import {
  RIDER_AVAILABLE_ORDERS_QUERY_KEY,
  RIDER_PENDING_OFFERS_QUERY_KEY,
  useAvailableOrders,
  usePendingOffers,
} from "@/src/hooks/useOrders";
import { mergeIncomingOfferLists } from "@/src/lib/incomingDispatchOffers";
import { riderFacingOrderId } from "@/src/lib/rider-cancellation-display";

const nativePill = NativeModules.GatimitraOrderAlert?.setPersistentPill != null;

export function RiderPersistentDispatchPill() {
  const session = useSessionStore((s) => s.session);
  const authenticated = Boolean(session?.accessToken && session.role === "rider");
  const availableQuery = useAvailableOrders();
  const pendingQuery = usePendingOffers();
  const available = availableQuery.data;
  const pending = pendingQuery.data;
  const offerPoolReady = available != null || pending != null;
  const cancelledOrderIds = useIncomingDispatchOfferStore((s) => s.cancelledOrderIds);
  const queryClient = useQueryClient();

  const actionable = useMemo(() => {
    const cancelled = new Set(cancelledOrderIds);
    return mergeIncomingOfferLists(available ?? [], pending ?? []).filter((order) => {
      if (!order?.id || cancelled.has(order.id)) return false;
      const formatted = order.formattedOrderId?.trim();
      if (formatted && cancelled.has(formatted)) return false;
      return true;
    });
  }, [available, pending, cancelledOrderIds]);

  const count = actionable.length;
  const focusId =
    count === 1
      ? riderFacingOrderId(actionable[0]?.formattedOrderId, actionable[0]?.id) || ""
      : "";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let cancelled = false;
    const sync = async () => {
      if (!authenticated) {
        await setPersistentOrderPill(false, 0, "");
        return;
      }
      const allowed = nativePill ? await canDrawNativeOverlays() : null;
      if (cancelled) return;
      // An empty default before the offer queries have run would wipe a count
      // the native FCM path just incremented.
      if (!offerPoolReady) return;
      await setPersistentOrderPill(allowed === true && nativePill, count, focusId);
    };
    void sync();
    const sub = AppState.addEventListener("change", () => {
      void sync();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [authenticated, count, focusId, offerPoolReady]);

  useEffect(() => {
    if (Platform.OS !== "android" || !authenticated || !nativePill) return;
    let cancelled = false;
    const openFromPill = async () => {
      const launch = await consumePersistentPillLaunch();
      if (cancelled || !launch) return;
      await queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: RIDER_PENDING_OFFERS_QUERY_KEY });
      router.replace("/(tabs)/orders");
    };
    void openFromPill();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void openFromPill();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [authenticated, queryClient]);

  return null;
}
