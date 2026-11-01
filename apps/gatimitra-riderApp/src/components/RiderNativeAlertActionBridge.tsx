/**
 * Makes ACCEPT on the native overlay / lock-screen / notification a real accept.
 *
 * Two halves, both required:
 *
 *  1. Credentials. Native posts the accept itself, from a thread with no access to
 *     the JS auth store, so it needs the base URL and the current rider token
 *     written to disk ahead of time. Without them a background ACCEPT is a no-op.
 *  2. Reconciliation. Native stashes what it did and the HTTP outcome; the app
 *     reads that stash on every foreground and tells the rider what actually
 *     happened. The old behaviour stopped the buzzer and closed the card on tap,
 *     which looks identical to a successful accept whether or not one occurred.
 *
 * Android-only: the native alert stack does not exist on iOS.
 */
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  consumeNativePendingOrderAction,
  persistNativeOrderAlertActionCredentials,
} from "@gatimitra/expo-push-kit";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useRiderToastStore } from "@/src/stores/riderToastStore";
import {
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  RIDER_AVAILABLE_ORDERS_QUERY_KEY,
  RIDER_PENDING_OFFERS_QUERY_KEY,
} from "@/src/hooks/useOrders";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";
import { describeNativeAcceptOutcome } from "@/src/lib/nativeAcceptOutcome";

export function RiderNativeAlertActionBridge() {
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((s) => s.session?.accessToken ?? "");
  const role = useSessionStore((s) => s.session?.role ?? "");
  const showToast = useRiderToastStore((s) => s.showToast);
  const authenticated = Boolean(accessToken) && role === "rider";

  // Re-persist on every token change. A rotated token left behind in native
  // storage turns the next background accept into a 401.
  useEffect(() => {
    if (Platform.OS !== "android" || !authenticated) return;
    void persistNativeOrderAlertActionCredentials({
      // Same LAN/emulator rewrite the JS client uses, so a dev build does not
      // persist a host the device cannot reach.
      baseUrl: resolveUrlForDevice(getRiderAppConfig().apiBaseUrl),
      token: accessToken,
      storeId: "",
    });
  }, [authenticated, accessToken]);

  useEffect(() => {
    if (Platform.OS !== "android" || !authenticated) return;
    let cancelled = false;

    const reconcile = async () => {
      const pending = await consumeNativePendingOrderAction();
      if (cancelled || !pending) return;

      riderDispatchLog("native_pending_action", {
        action: pending.action,
        result: pending.result,
        httpStatus: pending.httpStatus,
        sessionId: pending.sessionId,
      });

      // Always re-read from the server. Whatever native believes, the order list
      // is the only thing that decides whether this rider now has the order.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: RIDER_PENDING_OFFERS_QUERY_KEY }),
      ]);
      if (cancelled) return;

      if (pending.action !== "accept") return;
      const outcome = describeNativeAcceptOutcome(pending);
      if (outcome.kind === "accepted") showToast("Order accepted.");
      else if (outcome.kind === "failed") showToast(outcome.message);
    };

    void reconcile();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void reconcile();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [authenticated, queryClient, showToast]);

  return null;
}
