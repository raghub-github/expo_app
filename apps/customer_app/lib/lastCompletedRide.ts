/**
 * Latest completed person-ride for the home “one tap” card.
 * Pickup/drop always come from a real completed order (or the delivery-screen
 * snapshot of that order) — never from search recents or demo data.
 */

import { haversineKm } from "./billSummary";
import { isValidMapCoordinate } from "./ride-map-coords";
import { rideLabelsFromCheckoutMetadata } from "./ride-address-labels";
import { isPersonRideOrderSummary } from "./person-ride-order-kind";
import { normalizeCustomerOrderStatus } from "./customer-order-status-display";
import type { OrderSummary } from "../services/order.service";
import type { RecentLocationItem, RideJourney } from "../store/recentLocationStore";

/** Base geodesic radius: current GPS vs previous DROP. */
export const RETURN_TRIP_RADIUS_M = 1_200;
/** If the fix is worse than this, keep Book again (do not guess Return Trip). */
export const RETURN_TRIP_MAX_ACCURACY_M = 300;

export type CompletedRideRoute = RideJourney & {
  orderId?: string;
  rideType?: string | null;
};

export type ReturnTripGpsStatus = "idle" | "loading" | "available" | "unavailable";

export type ReturnTripGps = {
  status: ReturnTripGpsStatus;
  latitude?: number;
  longitude?: number;
  accuracyM?: number | null;
};

function metaNum(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!meta) return null;
  const n = Number(meta[key]);
  return Number.isFinite(n) ? n : null;
}

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string {
  const v = meta?.[key];
  return typeof v === "string" ? v.trim() : "";
}

export function isCompletedPersonRide(order: OrderSummary): boolean {
  if (!isPersonRideOrderSummary(order)) return false;
  if (order.cancellationReason?.trim() || order.cancelledByLabel?.trim()) return false;
  return normalizeCustomerOrderStatus(order.status) === "DELIVERED";
}

export function completedRideTimestampMs(order: OrderSummary): number {
  const history = Array.isArray((order as { statusHistory?: Array<{ status?: string; at?: string }> }).statusHistory)
    ? (order as { statusHistory?: Array<{ status?: string; at?: string }> }).statusHistory
    : [];
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (normalizeCustomerOrderStatus(entry?.status) !== "DELIVERED") continue;
    const t = Date.parse(String(entry?.at ?? ""));
    if (Number.isFinite(t)) return t;
  }
  const created = Date.parse(String(order.createdAt ?? ""));
  return Number.isFinite(created) ? created : 0;
}

function placeFrom(
  lat: number | null | undefined,
  lng: number | null | undefined,
  primary: string,
  fullAddress: string,
  kind: "pickup" | "drop"
): RecentLocationItem | null {
  if (!isValidMapCoordinate(lat, lng)) return null;
  const label = primary.replace(/\s+/g, " ").trim();
  const full = fullAddress.replace(/\s+/g, " ").trim() || label;
  if (!label && !full) return null;
  return {
    latitude: lat!,
    longitude: lng!,
    primary: label || full,
    fullAddress: full,
    kind,
  };
}

export function journeyFromCompletedOrder(order: OrderSummary): CompletedRideRoute | null {
  if (!isCompletedPersonRide(order)) return null;
  const meta = (order.checkoutMetadata ?? null) as Record<string, unknown> | null;
  const labels = rideLabelsFromCheckoutMetadata(meta);

  const pickupLat = order.pickupLat ?? metaNum(meta, "pickupLat");
  const pickupLng = order.pickupLng ?? metaNum(meta, "pickupLng");
  const dropLat = order.deliveryLat ?? metaNum(meta, "dropLat") ?? metaNum(meta, "deliveryLat");
  const dropLng = order.deliveryLng ?? metaNum(meta, "dropLng") ?? metaNum(meta, "deliveryLng");

  const pickupFull =
    String(order.merchantAddress ?? "").trim() ||
    metaStr(meta, "pickup") ||
    metaStr(meta, "pickupAddress");
  const dropFull =
    String(order.deliveryAddress ?? "").trim() ||
    metaStr(meta, "drop") ||
    metaStr(meta, "dropAddress") ||
    metaStr(meta, "deliveryAddress");

  const pickupPrimary =
    labels.pickupLabel ||
    pickupFull.split(",")[0]?.trim() ||
    pickupFull;
  const dropPrimary =
    labels.dropLabel ||
    dropFull.split(",")[0]?.trim() ||
    dropFull;

  const pickup = placeFrom(pickupLat, pickupLng, pickupPrimary, pickupFull, "pickup");
  const drop = placeFrom(dropLat, dropLng, dropPrimary, dropFull, "drop");
  if (!pickup || !drop) return null;

  return {
    pickup,
    drop,
    savedAt: completedRideTimestampMs(order),
    kind: "ride",
    fromCompletedRide: true,
    orderId: order.orderId,
    rideType: order.rideType?.trim() || null,
  };
}

/**
 * Newest successfully completed person ride with usable coordinates.
 * `storeFallback` is the delivery-screen snapshot — used only when history
 * rows lack lat/lng. Search recents must not be passed in.
 */
export function selectLatestCompletedRide(
  orders: OrderSummary[] | null | undefined,
  storeFallback: RideJourney | null | undefined
): CompletedRideRoute | null {
  const completed = (orders ?? [])
    .filter(isCompletedPersonRide)
    .sort((a, b) => completedRideTimestampMs(b) - completedRideTimestampMs(a));

  for (const order of completed) {
    const journey = journeyFromCompletedOrder(order);
    if (journey) return journey;
  }

  const fallback = storeFallback;
  if (
    fallback?.fromCompletedRide &&
    fallback?.kind !== "parcel" &&
    fallback?.pickup &&
    fallback?.drop &&
    isValidMapCoordinate(fallback.pickup.latitude, fallback.pickup.longitude) &&
    isValidMapCoordinate(fallback.drop.latitude, fallback.drop.longitude) &&
    String(fallback.pickup.primary ?? "").trim() &&
    String(fallback.drop.primary ?? "").trim()
  ) {
    return { ...fallback, kind: "ride" };
  }
  return null;
}

export function reverseCompletedRideRoute(ride: CompletedRideRoute): CompletedRideRoute {
  return {
    ...ride,
    pickup: { ...ride.drop, kind: "pickup" },
    drop: { ...ride.pickup, kind: "drop" },
  };
}

export function isNearCompletedDrop(args: {
  currentLat: number;
  currentLng: number;
  dropLat: number;
  dropLng: number;
  accuracyM?: number | null;
}): boolean {
  if (!isValidMapCoordinate(args.currentLat, args.currentLng)) return false;
  if (!isValidMapCoordinate(args.dropLat, args.dropLng)) return false;
  const acc = args.accuracyM;
  if (acc != null && Number.isFinite(acc) && acc > RETURN_TRIP_MAX_ACCURACY_M) return false;
  const extraM = Math.min(Math.max(acc ?? 50, 40), 200);
  const distM = haversineKm(args.currentLat, args.currentLng, args.dropLat, args.dropLng) * 1000;
  return distM <= RETURN_TRIP_RADIUS_M + extraM;
}

/** Safe default is Book again until GPS is resolved and near the previous drop. */
export function resolveLastRideCtaMode(
  gps: ReturnTripGps,
  drop: { latitude: number; longitude: number } | null | undefined
): "again" | "return" {
  if (gps.status !== "available" || drop == null) return "again";
  if (
    gps.latitude == null ||
    gps.longitude == null ||
    !isNearCompletedDrop({
      currentLat: gps.latitude,
      currentLng: gps.longitude,
      dropLat: drop.latitude,
      dropLng: drop.longitude,
      accuracyM: gps.accuracyM,
    })
  ) {
    return "again";
  }
  return "return";
}
