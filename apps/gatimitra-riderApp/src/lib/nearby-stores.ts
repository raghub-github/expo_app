/**
 * Rider "Nearby Stores" discovery layer — client types + pure transforms.
 *
 * Independent of Hot Zones: the backend (GET /v1/rider/nearby-stores) returns food stores that
 * actually EXIST within the rider's radius (default 20km, air distance) so the rider can move
 * toward them even when no zone is hot. This module turns the payload into a GeoJSON point
 * FeatureCollection for Mapbox's NATIVE clustering (cluster bubbles zoomed out → store icons
 * zoomed in), so a large radius never floods the map. Pure → unit-testable.
 */

export type NearbyStore = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  distanceKm: number;
};

export type NearbyStoreFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: { id: string; name: string; isOpen: boolean };
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

/** Point FeatureCollection for a `cluster: true` Mapbox ShapeSource (coords are [lng,lat]). */
export function nearbyStoresToGeoJson(stores: NearbyStore[]): NearbyStoreFeatureCollection {
  return {
    type: "FeatureCollection",
    features: stores
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => ({
        type: "Feature" as const,
        id: s.id,
        properties: { id: s.id, name: s.name, isOpen: s.isOpen },
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] as [number, number] },
      })),
  };
}
