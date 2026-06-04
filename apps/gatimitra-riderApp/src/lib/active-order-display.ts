import { router } from "expo-router";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import {
  categoryBannerIcon,
  formatDistanceKm,
  formatOrderTypeLabel,
  incomingOrderBannerLabel,
} from "@/src/lib/incoming-order-display";

/** Tab bar content height (icon + label row, excluding safe area). */
export const RIDER_TAB_BAR_CONTENT_HEIGHT = 58;

export function isActiveRiderOrder(order: RiderOrderSummary): boolean {
  return (
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "pending"
  );
}

function activeOrderPriority(order: RiderOrderSummary): number {
  if (order.rideStarted || order.status === "in_transit" || order.status === "picked_up") {
    return 3;
  }
  if (order.atPickup) return 2;
  return 1;
}

export function pickPrimaryActiveOrder(
  orders: RiderOrderSummary[]
): RiderOrderSummary | null {
  const active = orders.filter(isActiveRiderOrder);
  if (!active.length) return null;
  return [...active].sort((a, b) => activeOrderPriority(b) - activeOrderPriority(a))[0];
}

export function getActiveOrderStatusCopy(order: RiderOrderSummary): {
  title: string;
  subtitle: string;
} {
  if (order.category === "ride") {
    if (order.rideStarted || order.status === "in_transit" || order.status === "picked_up") {
      return {
        title: "Ride in progress",
        subtitle: "Navigate to drop location",
      };
    }
    if (order.atPickup) {
      return {
        title: "At pickup",
        subtitle: "Verify OTP to start the ride",
      };
    }
    return {
      title: "Active ride",
      subtitle: "Navigate to pickup location",
    };
  }

  if (order.status === "picked_up" || order.status === "in_transit") {
    return {
      title: "Delivery in progress",
      subtitle: "Head to customer drop-off",
    };
  }

  return {
    title: "Active order",
    subtitle: "Head to pickup location",
  };
}

export function getActiveOrderCategoryLabel(order: RiderOrderSummary): string {
  if (order.category === "ride") {
    return incomingOrderBannerLabel("ride", formatOrderTypeLabel(order.rideType));
  }
  if (order.category === "food") {
    return incomingOrderBannerLabel("food", order.merchantName ?? undefined);
  }
  return incomingOrderBannerLabel("parcel");
}

export function getActiveOrderCategoryIcon(
  order: RiderOrderSummary
): ReturnType<typeof categoryBannerIcon> {
  return categoryBannerIcon(order.category);
}

export function getActiveOrderFloatingLabel(order: RiderOrderSummary): string {
  if (order.category === "ride") return "Active Ride";
  if (order.category === "food") return "Active Order";
  return "Active Delivery";
}

export function getActiveOrderFloatingIcon(
  order: RiderOrderSummary
): ReturnType<typeof categoryBannerIcon> | "bicycle-outline" {
  if (order.category === "food") return "restaurant-outline";
  if (order.category === "parcel") return "cube-outline";
  const rideType = (order.rideType ?? "").toLowerCase();
  if (rideType.includes("bike") || rideType.includes("scooter") || rideType.includes("moped")) {
    return "bicycle-outline";
  }
  return "car-outline";
}

export function formatActiveOrderEarning(order: RiderOrderSummary): string {
  const amount = order.totalEarning ?? order.estimatedEarning;
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `₹${Math.round(amount)}`;
}

export function formatActiveOrderDistance(order: RiderOrderSummary): string {
  const km =
    order.pickupDistanceKm ?? order.totalDistanceKm ?? order.distanceKm ?? order.tripDistanceKm;
  const label = formatDistanceKm(km);
  return label === "—" ? "" : label;
}

export function openActiveOrder(order: RiderOrderSummary): void {
  if (order.category === "ride") {
    router.push(`/active-ride/${encodeURIComponent(order.id)}`);
    return;
  }
  if (order.category === "food") {
    router.push(`/active-food/${encodeURIComponent(order.id)}`);
    return;
  }
  router.push("/(tabs)/orders");
}
