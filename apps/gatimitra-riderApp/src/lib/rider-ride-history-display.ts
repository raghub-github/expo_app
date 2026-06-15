import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { formatOrderTypeLabel } from "@/src/lib/incoming-order-display";
import { isRideFarePaymentPending } from "@/src/lib/ride-payment-wait";

type IonName = ComponentProps<typeof Ionicons>["name"];

const COORD_PAIR_RE = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;

function isCoordinateLikeText(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (COORD_PAIR_RE.test(t)) return true;
  if (t.startsWith("{") && /"lat"|"latitude"/i.test(t)) return true;
  return false;
}

/** Show street/place name; hide lat,lng-only strings from API. */
export function formatHistoryAddressLabel(
  candidates: (string | null | undefined)[],
  fallback: string
): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (!t) continue;
    if (!isCoordinateLikeText(t)) return t;
  }
  return fallback;
}

export function orderHistoryCategoryVisual(category: RiderOrderSummary["category"]): {
  icon: IonName;
  iconBg: string;
  iconColor: string;
  accent: string;
  headerTint: string;
  filterActiveBg: string;
} {
  switch (category) {
    case "food":
      return {
        icon: "restaurant",
        iconBg: "#FFEDD5",
        iconColor: "#EA580C",
        accent: "#EA580C",
        headerTint: "#FFF7ED",
        filterActiveBg: "#EA580C",
      };
    case "parcel":
      return {
        icon: "cube",
        iconBg: "#DBEAFE",
        iconColor: "#2563EB",
        accent: "#2563EB",
        headerTint: "#EFF6FF",
        filterActiveBg: "#2563EB",
      };
    default:
      return {
        icon: "car",
        iconBg: "#CCFBF1",
        iconColor: "#0D9488",
        accent: "#0D9488",
        headerTint: "#F0FDFA",
        filterActiveBg: "#0D9488",
      };
  }
}

export function orderHistoryCategoryLabel(
  category: RiderOrderSummary["category"],
  t: (key: string, fallback: string) => string
): string {
  switch (category) {
    case "food":
      return t("profile.myRides.catFood", "Food");
    case "parcel":
      return t("profile.myRides.catParcel", "Parcel");
    default:
      return t("profile.myRides.catPerson", "Person");
  }
}

export function orderHistoryTitle(order: RiderOrderSummary): string {
  if (order.category === "food") {
    return order.merchantName?.trim() || "Food delivery";
  }
  if (order.category === "parcel") {
    const drop = rideHistoryDropLabel(order);
    if (drop.length > 56) return `${drop.slice(0, 55)}…`;
    return drop;
  }
  const passenger = order.customerName?.trim();
  if (passenger) return passenger;
  return rideHistoryRideTypeLabel(order.rideType);
}

export function orderHistorySubtitle(order: RiderOrderSummary): string | null {
  if (order.category === "food" && order.itemCount != null && order.itemCount > 0) {
    return `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`;
  }
  if (order.category === "parcel") {
    return order.customerName?.trim() || null;
  }
  return order.customerName?.trim() || null;
}

export function rideHistoryDropLabel(order: RiderOrderSummary): string {
  return formatHistoryAddressLabel(
    [order.dropAddressGeocoded, order.delivery.address],
    "Drop location"
  );
}

export function rideHistoryPickupLabel(order: RiderOrderSummary): string {
  return formatHistoryAddressLabel(
    [order.pickupAddressGeocoded, order.pickup.address],
    "Pickup"
  );
}

/** Truncated pickup for tight list rows */
export function rideHistoryPickupShort(order: RiderOrderSummary): string {
  const addr = rideHistoryPickupLabel(order);
  if (addr.length <= 48) return addr;
  return `${addr.slice(0, 47)}…`;
}

export function rideHistoryStatusLabel(
  status: RiderOrderSummary["status"],
  t: (key: string, fallback: string) => string,
  order?: Pick<RiderOrderSummary, "category" | "paymentStatus" | "adminRiderPaymentClearedAt" | "walletCreditPending">
): string {
  if (order && isOrderEarningCreditPending({ ...order, status } as RiderOrderSummary)) {
    return t("profile.myRides.statusPaymentPending", "Payment pending");
  }
  switch (status) {
    case "delivered":
      if (order?.category === "food" || order?.category === "parcel") {
        return t("profile.myRides.statusDelivered", "Delivered");
      }
      return t("profile.myRides.statusCompleted", "Completed");
    case "cancelled":
      return t("profile.myRides.statusCancelled", "Cancelled");
    default:
      return t("profile.myRides.statusOther", "Ended");
  }
}

export function rideHistoryStatusTone(
  status: RiderOrderSummary["status"]
): { bg: string; color: string; border: string } {
  if (status === "delivered") {
    return { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" };
  }
  if (status === "cancelled") {
    return { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" };
  }
  return { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" };
}

export function isOrderEarningCreditPending(order: RiderOrderSummary): boolean {
  if (order.walletCreditPending === true) return true;
  return isRideFarePaymentPending(order);
}

export function rideHistoryEarningLabel(
  order: RiderOrderSummary,
  t?: (key: string, fallback: string) => string
): string {
  if (isOrderEarningCreditPending(order)) {
    return t?.("profile.myRides.earningPending", "Pending") ?? "Pending";
  }
  const amount = order.totalEarning ?? order.estimatedEarning ?? 0;
  if (!amount) return "—";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function rideHistoryEarningPlusLabel(
  order: RiderOrderSummary,
  t?: (key: string, fallback: string) => string
): string {
  if (isOrderEarningCreditPending(order)) {
    return t?.("profile.myRides.earningPending", "Pending") ?? "Pending";
  }
  const amount = order.totalEarning ?? order.estimatedEarning ?? 0;
  if (!amount) return "—";
  return `+₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function rideHistoryOrderId(order: RiderOrderSummary): string {
  const id = order.formattedOrderId?.trim() || order.id?.trim();
  return id ? (id.startsWith("#") ? id : `#${id}`) : "—";
}

export function rideHistoryRideTypeLabel(rideType?: string | null): string {
  return formatOrderTypeLabel(rideType) || "Ride";
}

export function formatRideHistoryDateTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. 4 Jun 2026 • 3:15 pm */
export function formatRideHistoryListDate(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  return `${date} • ${time}`;
}

export function resolveOrderDistanceBreakdown(order: RiderOrderSummary): {
  pickupKm: number | null;
  tripKm: number | null;
  totalKm: number | null;
} {
  const tripKm =
    order.tripDistanceKm != null && order.tripDistanceKm > 0
      ? order.tripDistanceKm
      : order.distanceKm != null && order.distanceKm > 0
        ? order.distanceKm
        : null;
  const pickupKm =
    order.pickupDistanceKm != null && order.pickupDistanceKm > 0
      ? order.pickupDistanceKm
      : null;
  const totalKm =
    order.totalDistanceKm != null && order.totalDistanceKm > 0
      ? order.totalDistanceKm
      : pickupKm != null && tripKm != null
        ? Math.round((pickupKm + tripKm) * 10) / 10
        : tripKm ?? pickupKm;
  return { pickupKm, tripKm, totalKm };
}

export function orderMatchesHistorySearch(order: RiderOrderSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const parts = [
    order.id,
    order.formattedOrderId,
    order.customerName,
    order.merchantName,
    order.pickup.address,
    order.delivery.address,
    orderHistoryTitle(order),
  ];
  return parts.some((p) => p?.toLowerCase().includes(q));
}
