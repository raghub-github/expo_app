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

export function riderDisplayName(riderName: string | null | undefined): string | null {
  const n = (riderName ?? "").trim();
  if (!n) return null;
  const lower = n.toLowerCase();
  if (lower === "delivery partner" || lower === "rider") return null;
  return n;
}

/** Merchant-visible rider phone: `contact :- 73xxxxxx81` (real first 2 + last 2). */
export function formatMaskedRiderContact(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.length >= 12 && local.startsWith("91")) local = local.slice(-10);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(-10);
  else if (local.length > 10) local = local.slice(-10);
  if (local.length < 4) return `contact :- ${local}`;
  return `contact :- ${local.slice(0, 2)}xxxxxx${local.slice(-2)}`;
}

/** Partnersite-style status headline for the rider card. */
export function riderStatusHeadline(
  variant: RiderCardVariant,
  riderName: string
): string {
  const name = riderDisplayName(riderName);
  switch (variant) {
    case "delivered":
      return name ?? "Order delivered";
    case "cancelled":
      return "Delivery cancelled";
    case "rto":
      return "Return to origin (RTO)";
    case "picked_up":
      return `${name ?? "Delivery partner"} is out for delivery`;
    case "arrived":
      return `${name ?? "Delivery partner"} has arrived`;
    case "on_the_way":
    default:
      return `${name ?? "Delivery partner"} is on the way`;
  }
}

export function riderStatusSubline(
  variant: RiderCardVariant,
  riderName: string,
  arrivalSubtitle?: string | null,
  storeWaitLabel?: string | null
): string | null {
  if (variant === "delivered") {
    return riderDisplayName(riderName) ? "Order delivered" : "Delivered by delivery partner";
  }
  if (variant === "cancelled") {
    const n = (riderName ?? "").trim();
    return n ? `Assigned rider: ${n}` : "This order was cancelled before delivery.";
  }
  if (variant === "rto") {
    const n = (riderName ?? "").trim();
    return n ? `Rider: ${n}` : null;
  }
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
