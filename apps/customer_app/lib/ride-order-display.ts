import type { OrderDetail, OrderSummary } from "@/services/order.service";
import { getRideOption } from "@/features/ride/rideOptions";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { resolvePlaceDisplayName } from "@/services/location.service";

const RIDE_IMAGE_KEY: Record<string, string> = {
  bike: "bike",
  "bike-lite": "bike",
  auto: "auto",
  "cab-economy": "cab",
  "cab-premium": "cab_premium",
  travel: "travel",
};

export function resolveRideCatalogImageKey(rideType: string | null | undefined): string {
  const raw = (rideType ?? "").trim().toLowerCase();
  return RIDE_IMAGE_KEY[raw] ?? "bike";
}

export function getRideServiceLabel(rideType: string | null | undefined): string {
  const raw = (rideType ?? "").trim().toLowerCase();
  if (!raw) return "Ride";
  const option = getRideOption(raw);
  if (option.name) return `${option.name} Ride`;
  return raw
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatRideHistoryDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = d
      .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, " ");
    return `${date} • ${time}`;
  } catch {
    return iso;
  }
}

export function getRideDropTitle(order: Pick<OrderSummary, "deliveryAddress" | "merchantAddress">): string {
  const drop = resolvePlaceDisplayName({
    primary: order.deliveryAddress,
    fullAddress: order.deliveryAddress,
  });
  if (drop) return drop;
  const pickup = resolvePlaceDisplayName({
    primary: order.merchantAddress,
    fullAddress: order.merchantAddress,
  });
  return pickup || "Ride";
}

export function getRideHistoryStatusLabel(status: string): string {
  const s = normalizeCustomerOrderStatus(status);
  if (s === "DELIVERED") return "Completed";
  if (s === "CANCELLED") return "Cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED") return "Payment failed";
  return "In progress";
}

export function formatRideFare(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "₹0";
  const rounded = Math.round(amount * 10) / 10;
  return `₹${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

export function resolveRideVehicleImage(rideType: string | null | undefined) {
  return resolveRideImage(resolveRideCatalogImageKey(rideType));
}

export function getRideFareBreakdown(order: Pick<OrderDetail, "totalAmount" | "tipAmount">) {
  const total = Number(order.totalAmount ?? 0);
  const tip = Math.max(0, Number(order.tipAmount ?? 0));
  const rideCharge = Math.max(0, total - tip);
  return { total, tip, rideCharge };
}

export function formatRideTripStats(distanceKm?: number | null, durationMins?: number | null): string | null {
  const parts: string[] = [];
  if (durationMins != null && Number.isFinite(durationMins) && durationMins > 0) {
    parts.push(`${Math.round(durationMins * 10) / 10} mins`);
  }
  if (distanceKm != null && Number.isFinite(distanceKm) && distanceKm > 0) {
    parts.push(`${Math.round(distanceKm * 10) / 10} kms`);
  }
  if (parts.length === 0) return null;
  return `${parts.join(" • ")} (.est)`;
}
