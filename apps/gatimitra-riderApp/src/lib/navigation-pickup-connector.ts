import type { LatLng } from "@/src/services/maps/directions.service";
import { distanceMeters } from "@/src/services/maps/directions.service";

const MIN_CONNECTOR_M = 2;

type PickupPoint = { lat: number; lng: number };

export type PickupConnectorFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  properties: Record<string, never>;
};

/** Thin line from trimmed route end → exact pickup pin (reference: Uber/Rapido). */
export function buildPickupConnectorGeoJson(
  remaining: LatLng[],
  pickup: PickupPoint
): PickupConnectorFeature | null {
  if (remaining.length === 0) return null;

  const last = remaining[remaining.length - 1]!;
  const pickupPoint: LatLng = { latitude: pickup.lat, longitude: pickup.lng };
  const gapM = distanceMeters(last, pickupPoint);
  if (gapM < MIN_CONNECTOR_M) return null;

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [last.longitude, last.latitude],
        [pickup.lng, pickup.lat],
      ],
    },
    properties: {},
  };
}
