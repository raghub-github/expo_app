import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export type IncomingOrderCategory = RiderOrderSummary["category"];

export function incomingOrderBadgeLabel(category: IncomingOrderCategory): string {
  switch (category) {
    case "food":
      return "New order!";
    case "parcel":
      return "New delivery!";
    default:
      return "New ride!";
  }
}

export function incomingOrderBannerLabel(category: IncomingOrderCategory, subLabel?: string): string {
  switch (category) {
    case "food":
      return "GatiMitra food";
    case "parcel":
      return subLabel ? `GatiMitra parcel · ${subLabel}` : "GatiMitra parcel";
    default:
      return subLabel ? `GatiMitra ride · ${subLabel}` : "GatiMitra ride";
  }
}

export function incomingOrderAcceptLabel(category: IncomingOrderCategory): string {
  switch (category) {
    case "food":
      return "Accept order";
    case "parcel":
      return "Accept delivery";
    default:
      return "Accept ride";
  }
}

export function formatOrderTypeLabel(raw?: string | null): string {
  if (!raw?.trim()) return "";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryBannerIcon(category: IncomingOrderCategory): "restaurant-outline" | "cube-outline" | "car-outline" {
  switch (category) {
    case "food":
      return "restaurant-outline";
    case "parcel":
      return "cube-outline";
    default:
      return "car-outline";
  }
}

export function formatDistanceKm(km?: number | null): string {
  if (km == null || !Number.isFinite(km) || km <= 0) return "—";
  return `${km.toFixed(1)} km`;
}
