import type { LatLng } from "@/src/services/maps/directions.service";

/** Google Maps–style label for a slower alternate. */
export function formatAlternativeRouteLabel(deltaMinutes: number): string {
  if (deltaMinutes < 1) return "";
  if (deltaMinutes === 1) return "1 min slower";
  return `${deltaMinutes} min slower`;
}

export function routeMidpoint(coords: LatLng[]): LatLng | null {
  if (coords.length === 0) return null;
  const idx = Math.floor(coords.length / 2);
  return coords[idx] ?? coords[coords.length - 1] ?? null;
}

export function lineStringGeoJson(coords: LatLng[]) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "LineString" as const,
      coordinates: coords.map((c) => [c.longitude, c.latitude]),
    },
    properties: {},
  };
}
