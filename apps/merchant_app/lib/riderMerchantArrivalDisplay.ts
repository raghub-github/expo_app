import type { OrderRecord } from "@/hooks/useOrders";

export type RiderCardVariant =
  | "on_the_way"
  | "arrived"
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "rto";

/** Prefer backend `rider_display_variant`; fallback only for stale cached payloads. */
export function resolveRiderCardVariant(order: OrderRecord): RiderCardVariant {
  if (order.riderDisplayVariant) return order.riderDisplayVariant;

  if (order.status === "delivered") return "delivered";
  if (order.status === "rejected") return "cancelled";
  if (order.status === "rto") return "rto";
  if (order.riderPickedUpAt || order.status === "picked_up") return "picked_up";
  if (hasRiderReachedMerchant(order)) return "arrived";
  return "on_the_way";
}

export function hasRiderReachedMerchant(order: OrderRecord): boolean {
  if (order.reachedMerchantAt || order.riderReachedAt || order.riderReachedPickupAt) return true;

  const core = String(order.coreStatus ?? "")
    .trim()
    .toLowerCase();
  if (core === "reached_store") return true;

  const cur = String(order.currentStatus ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (cur === "RIDER_AT_PICKUP") return true;

  const status = (order.riderAssignmentStatus ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  if (status === "REACHED_MERCHANT" || status === "AT_PICKUP" || status === "RIDER_AT_PICKUP") {
    return true;
  }
  return false;
}

export function formatRiderToMerchantArrivalFromMeters(
  remainingDistanceM: number | null | undefined,
  etaMinutes?: number | null
): string | null {
  if (remainingDistanceM == null || !Number.isFinite(remainingDistanceM) || remainingDistanceM <= 0) {
    return null;
  }
  const km = remainingDistanceM / 1000;
  const distLabel =
    km < 1
      ? `${Math.max(50, Math.round(remainingDistanceM))} m away`
      : `${(Math.round(km * 10) / 10).toFixed(km % 1 === 0 ? 0 : 1)} km away`;
  const mins =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? Math.max(1, Math.round(etaMinutes))
      : Math.max(1, Math.round(km / 0.35));
  return `Arriving in ${mins} min · ${distLabel}`;
}

export function formatRiderStoreWaitLabel(
  totalSeconds: number | null | undefined,
  opts?: { live?: boolean }
): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return opts?.live ? `Waiting ${clock} (live)` : `Waiting ${clock}`;
}

/** Partnersite-style status headline for the rider card. */
export function riderStatusHeadline(
  variant: RiderCardVariant,
  riderName: string
): string {
  switch (variant) {
    case "delivered":
      return "Order delivered";
    case "cancelled":
      return "Delivery cancelled";
    case "rto":
      return "Return to origin (RTO)";
    case "picked_up":
      return `${riderName} is out for delivery`;
    case "arrived":
      return `${riderName} has arrived`;
    case "on_the_way":
    default:
      return `${riderName} is on the way`;
  }
}

export function riderStatusSubline(
  variant: RiderCardVariant,
  riderName: string,
  arrivalSubtitle?: string | null,
  storeWaitLabel?: string | null
): string | null {
  if (variant === "arrived") {
    return storeWaitLabel ?? "Waiting at your store for pickup";
  }
  if (variant === "on_the_way") {
    if (arrivalSubtitle) return arrivalSubtitle;
    return `${riderName} is heading to your store`;
  }
  return null;
}

export function riderEnRouteToMerchant(order: OrderRecord): boolean {
  return resolveRiderCardVariant(order) === "on_the_way";
}
