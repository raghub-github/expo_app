import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import {
  dismissRiderSearchingNotification,
  showRiderSearchingNotification,
} from "@/src/lib/riderSearchingNotification";

/**
 * Posts the idle "Searching for orders" tray notification while the rider is
 * on duty and has no active order. Clears it when duty ends or a trip starts.
 */
export function RiderSearchingNotification() {
  const signedIn = useSessionStore((s) => Boolean(s.session?.accessToken && s.session.role === "rider"));
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: activeOrders = [] } = useActiveOrders();
  const incomingOfferId = useIncomingDispatchOfferStore((s) => s.lastOfferId);
  const idle =
    signedIn &&
    isOnDuty &&
    !activeOrders.some(isActiveRiderOrder) &&
    !incomingOfferId;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (idle) void showRiderSearchingNotification();
    else void dismissRiderSearchingNotification();
  }, [idle]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (idle) void showRiderSearchingNotification();
      else void dismissRiderSearchingNotification();
    });
    return () => sub.remove();
  }, [idle]);

  useEffect(() => {
    if (!signedIn) void dismissRiderSearchingNotification();
  }, [signedIn]);

  return null;
}
