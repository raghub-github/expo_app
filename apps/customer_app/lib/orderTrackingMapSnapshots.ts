/**
 * Immutable order location snapshots for food delivery tracking maps.
 *
 * Pins + route endpoints come from the order row (pickup/drop frozen at
 * placement). Optional storeLat/Lng only fills MISSING pickup — never live GPS
 * or active-location.
 *
 * Never invent India-centroid placeholders: that drew ~900km arcs when pickup
 * was 0/null while delivery was a real West Bengal pin.
 */

export type OrderMapSnapshotCoords = {
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  /** True when both ends are usable real coordinates. */
  hasOrderSnapshots: boolean;
};

function isUsableCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // Reject null-island / unset numeric defaults written as 0.
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * If order pickup is missing/zero but delivery is known, never invent a far-away
 * fake pin. Prefer store snapshot; otherwise keep both ends at delivery (map
 * still shows the home pin; route stays local until store coords load).
 */
export function resolveOrderTrackingMapSnapshots(order: {
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  /** Merchant store coords — only used when order pickup* is missing. */
  storeLat?: number | null;
  storeLng?: number | null;
  /** Order distance_km — sanity-check absurd pickup/drop pairs. */
  distanceKm?: number | null;
}): OrderMapSnapshotCoords {
  const hasDrop = isUsableCoord(order.deliveryLat, order.deliveryLng);
  let hasPickup = isUsableCoord(order.pickupLat, order.pickupLng);
  const hasStore = isUsableCoord(order.storeLat, order.storeLng);

  let deliveryLat = hasDrop ? Number(order.deliveryLat) : NaN;
  let deliveryLng = hasDrop ? Number(order.deliveryLng) : NaN;
  let pickupLat = hasPickup ? Number(order.pickupLat) : NaN;
  let pickupLng = hasPickup ? Number(order.pickupLng) : NaN;

  if (!hasPickup && hasStore) {
    pickupLat = Number(order.storeLat);
    pickupLng = Number(order.storeLng);
    hasPickup = true;
  }

  // Pickup looks like a different state while delivery is local —
  // prefer store snapshot when the pair is absurdly far.
  if (hasPickup && hasDrop && hasStore) {
    const pairKm = haversineKm(pickupLat, pickupLng, deliveryLat, deliveryLng);
    const reportedKm =
      order.distanceKm != null && Number.isFinite(Number(order.distanceKm))
        ? Number(order.distanceKm)
        : null;
    const absurdVsReported =
      reportedKm != null &&
      reportedKm > 0 &&
      reportedKm < 80 &&
      pairKm > Math.max(reportedKm * 4, reportedKm + 25);
    const absurdAbsolute = pairKm > 100;
    if (absurdVsReported || absurdAbsolute) {
      pickupLat = Number(order.storeLat);
      pickupLng = Number(order.storeLng);
    }
  }

  // Still missing one end: collapse to the known pin so the camera stays local.
  if (hasPickup && !hasDrop) {
    deliveryLat = pickupLat;
    deliveryLng = pickupLng;
  } else if (!hasPickup && hasDrop) {
    pickupLat = deliveryLat;
    pickupLng = deliveryLng;
  } else if (!hasPickup && !hasDrop) {
    // Last resort — tiny local offset, never India centroid.
    pickupLat = 22.0;
    pickupLng = 88.0;
    deliveryLat = 22.001;
    deliveryLng = 88.001;
  }

  return {
    pickupLat,
    pickupLng,
    deliveryLat,
    deliveryLng,
    hasOrderSnapshots: hasDrop && isUsableCoord(pickupLat, pickupLng),
  };
}
