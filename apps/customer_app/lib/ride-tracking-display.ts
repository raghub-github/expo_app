import { haversineKm } from "@/lib/billSummary";
import { etaMinutesFromMeters } from "@/lib/navigation-route-progress";

/** Split a 4-digit pickup OTP into individual digit strings for PIN boxes. */
export function splitPickupOtpDigits(otp: string | null | undefined): string[] {
  const raw = (otp ?? "").replace(/\D/g, "").slice(0, 4);
  if (!raw) return [];
  return raw.split("");
}

/** Format road distance for captain card (e.g. "695 m", "1.2 km"). */
export function formatRouteDistanceMeters(distanceM: number | null | undefined): string | null {
  if (distanceM == null || !Number.isFinite(distanceM) || distanceM <= 0) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(distanceM < 10_000 ? 1 : 0)} km`;
}

export function formatPickupEtaMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "—";
  const rounded = Math.max(1, Math.round(minutes));
  return rounded === 1 ? "1 min" : `${rounded} mins`;
}

/** Rider → pickup distance label (e.g. "695 m away", "1.2 km away"). */
export function formatRiderDistanceToPickup(
  riderLat: number | null | undefined,
  riderLng: number | null | undefined,
  pickupLat: number,
  pickupLng: number
): string | null {
  if (riderLat == null || riderLng == null) return null;
  const km = haversineKm(riderLat, riderLng, pickupLat, pickupLng);
  if (!Number.isFinite(km) || km <= 0) return null;
  const meters = Math.round(km * 1000);
  if (meters < 1000) return `${meters} m away`;
  return `${(km).toFixed(km < 10 ? 1 : 0)} km away`;
}

/** Pickup ETA from straight-line distance when road route ETA is unavailable. */
export function estimatePickupEtaMinutes(
  riderLat: number | null | undefined,
  riderLng: number | null | undefined,
  pickupLat: number,
  pickupLng: number
): number | null {
  if (riderLat == null || riderLng == null) return null;
  const km = haversineKm(riderLat, riderLng, pickupLat, pickupLng);
  if (!Number.isFinite(km) || km <= 0) return null;
  return etaMinutesFromMeters(km * 1000);
}

/**
 * Rider → pickup/drop ETA for live tracking.
 * Pickup leg never uses order-wide server ETA (that is often the full trip time).
 */
export function resolveRideLegEtaMinutes(args: {
  rideInProgress: boolean;
  routeEtaMinutes: number | null | undefined;
  routeDistanceM: number | null | undefined;
  serverEtaMinutes: number | null | undefined;
  riderLat: number | null | undefined;
  riderLng: number | null | undefined;
  destLat: number;
  destLng: number;
}): number | null {
  const {
    rideInProgress,
    routeEtaMinutes,
    routeDistanceM,
    serverEtaMinutes,
    riderLat,
    riderLng,
    destLat,
    destLng,
  } = args;

  if (routeEtaMinutes != null && routeEtaMinutes > 0) {
    if (routeDistanceM != null && routeDistanceM > 0 && routeDistanceM <= 800) {
      const fromDistance = etaMinutesFromMeters(routeDistanceM);
      if (fromDistance != null && routeEtaMinutes > Math.max(3, fromDistance * 2)) {
        return fromDistance;
      }
    }
    return routeEtaMinutes;
  }

  if (routeDistanceM != null && routeDistanceM > 0) {
    return etaMinutesFromMeters(routeDistanceM);
  }

  const fromRider = estimatePickupEtaMinutes(riderLat, riderLng, destLat, destLng);
  if (fromRider != null) return fromRider;

  if (rideInProgress && serverEtaMinutes != null && serverEtaMinutes > 0) {
    return serverEtaMinutes;
  }

  return null;
}
