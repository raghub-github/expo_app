import { useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";
import { usePathname } from "expo-router";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";
import { useIncomingDispatchOfferStore } from "@/src/stores/incomingDispatchOfferStore";
import {
  dismissRiderSearchingNotification,
  showRiderSearchingNotification,
} from "@/src/lib/riderSearchingNotification";

function isOnActiveOrderRoute(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "");
  return (
    path.includes("/active-food/") ||
    path.includes("/active-ride/") ||
    path.includes("/ride-payment-wait") ||
    path.includes("/food-pick-order")
  );
}

/**
 * Posts the idle "Searching for orders" tray notification while the rider is
 * on duty and has no active order. Clears it when duty ends or a trip starts.
 */
export function RiderSearchingNotification() {
  const signedIn = useSessionStore((s) => Boolean(s.session?.accessToken && s.session.role === "rider"));
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: activeOrders = [] } = useActiveOrders();
  const incomingOfferId = useIncomingDispatchOfferStore((s) => s.lastOfferId);
  const pathname = usePathname();
  const onActiveRoute = isOnActiveOrderRoute(pathname);
  const hasActiveOrder = useMemo(
    () => activeOrders.some(isActiveRiderOrder),
    [activeOrders]
  );

  const idle =
    signedIn &&
    isOnDuty &&
    !hasActiveOrder &&
    !incomingOfferId &&
    !onActiveRoute;

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
    if (!signedIn || hasActiveOrder || onActiveRoute) {
      void dismissRiderSearchingNotification();
    }
  }, [signedIn, hasActiveOrder, onActiveRoute]);

  return null;
}
