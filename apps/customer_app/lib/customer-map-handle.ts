import type { LatLng } from "@/services/directions.service";

export type MapEdgePadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** Shared imperative map API for Mapbox WebView maps. */
export type CustomerMapRef = {
  pointForCoordinate: (coord: LatLng) => Promise<{ x: number; y: number } | null>;
  fitToCoordinates: (
    coords: LatLng[],
    options: { edgePadding: MapEdgePadding; animated?: boolean; maxZoom?: number }
  ) => void;
  /** Pannable pickup / location maps. */
  animateToRegion?: (region: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  }) => void;
};
