import type { LatLng } from "@/services/directions.service";

export type MapEdgePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Shared imperative map API for native Mapbox maps. */
export type CustomerMapRef = {
  pointForCoordinate: (coord: LatLng) => Promise<{ x: number; y: number } | null>;
  fitToCoordinates: (
    coords: LatLng[],
    options: { edgePadding: MapEdgePadding; animated?: boolean; maxZoom?: number }
  ) => void;
  /** Fit the full pickup/drop geofence circle into the visible map viewport. */
  fitToGeofence?: (
    center: LatLng,
    radiusM: number,
    options: { edgePadding: MapEdgePadding; animated?: boolean; maxZoom?: number; force?: boolean }
  ) => void;
  clearGeofenceCamera?: () => void;
  recenterOnRider?: () => void;
  /** Pannable pickup / location maps. */
  animateToRegion?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  }) => void;
};
