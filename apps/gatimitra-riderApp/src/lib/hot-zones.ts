import { hexRingFromCenter } from "@/src/lib/demand-zones";

/**
 * Rider hot zones — client types + pure transforms.
 *
 * The backend (GET /v1/rider/hot-zones) is authoritative: it returns real H3 hexagon
 * cells with per-service demand/supply/pressure status. The app only RENDERS them — it
 * never computes hotness (Part 32/57). This module turns the API payload into a GeoJSON
 * FeatureCollection for Mapbox source/layer rendering (hexagons, not circles) and a small
 * display list for the side panel. All pure → unit-testable.
 */

export type ZoneStatus = "NORMAL" | "WARM" | "HOT" | "CRITICAL";
export type HotZoneService = "food" | "parcel" | "person_ride";

export type HotZoneServiceCell = {
  service: HotZoneService;
  status: ZoneStatus;
  demandScore: number;
  supplyScore: number;
  pressure: number;
};

export type HotZoneCell = {
  h3Index: string;
  resolution: number;
  center: { lat: number; lng: number };
  /** GeoJSON ring [lng,lat][] from H3 cellToBoundary. */
  boundary: [number, number][];
  services: HotZoneServiceCell[];
  calculatedAt: string;
  validUntil: string;
};

/** Status intensity colour (Part 32/36 — emphasis by state, service shown via badges). */
export const STATUS_FILL: Record<ZoneStatus, string> = {
  NORMAL: "#9CA3AF",
  WARM: "#F59E0B",
  HOT: "#F97316",
  CRITICAL: "#DC2626",
};
export const STATUS_FILL_OPACITY: Record<ZoneStatus, number> = {
  NORMAL: 0.12,
  WARM: 0.22,
  HOT: 0.3,
  CRITICAL: 0.38,
};

/** Service identity colour (Part 36). */
export const SERVICE_COLOR: Record<HotZoneService, string> = {
  food: "#16A34A",
  parcel: "#2563EB",
  person_ride: "#7C3AED",
};

export const SERVICE_LABEL: Record<HotZoneService, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Ride",
};

const STATUS_RANK: Record<ZoneStatus, number> = { NORMAL: 0, WARM: 1, HOT: 2, CRITICAL: 3 };

/** Highest-severity status across a cell's services — drives the hexagon fill. */
export function dominantStatus(cell: HotZoneCell): ZoneStatus {
  let best: ZoneStatus = "NORMAL";
  for (const s of cell.services) {
    if (STATUS_RANK[s.status] > STATUS_RANK[best]) best = s.status;
  }
  return best;
}

export type HotZoneFeatureProps = {
  h3: string;
  status: ZoneStatus;
  /** Comma-joined service codes present (elevated) in this cell, e.g. "food,parcel". */
  services: string;
  serviceCount: number;
};

export type HotZoneFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: HotZoneFeatureProps;
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
};

/** Close a boundary ring (GeoJSON polygons must repeat the first point). */
function closedRing(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0]!;
  const [lx, ly] = ring[ring.length - 1]!;
  return fx === lx && fy === ly ? ring : [...ring, ring[0]!];
}

/** Hexagon polygons for Mapbox — one Feature per H3 cell, styled by status. */
export function hotZonesToGeoJson(cells: HotZoneCell[]): HotZoneFeatureCollection {
  const features = cells
    .map((c) => {
      const boundary =
        Array.isArray(c.boundary) && c.boundary.length >= 3
          ? c.boundary
          : hexRingFromCenter(c.center);
      if (boundary.length < 3) return null;

      const status = dominantStatus(c);
      const services = c.services.map((s) => s.service);
      return {
        type: "Feature" as const,
        id: c.h3Index,
        properties: {
          h3: c.h3Index,
          status,
          services: services.join(","),
          serviceCount: services.length,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [closedRing(boundary)],
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);

  return {
    type: "FeatureCollection",
    features,
  };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

export type HotZoneDisplayItem = {
  id: string;
  center: { lat: number; lng: number };
  status: ZoneStatus;
  distanceKm: number;
  services: HotZoneServiceCell[];
};

/** Elevated cells sorted for the side panel: strongest status first, then nearest. */
export function hotZonesToDisplayList(
  cells: HotZoneCell[],
  rider: { lat: number; lng: number } | null | undefined
): HotZoneDisplayItem[] {
  const items = cells.map((c) => ({
    id: c.h3Index,
    center: c.center,
    status: dominantStatus(c),
    distanceKm: rider ? Math.round(haversineKm(rider, c.center) * 10) / 10 : 0,
    services: c.services,
  }));
  return items.sort((a, b) => {
    const r = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    return r !== 0 ? r : a.distanceKm - b.distanceKm;
  });
}
