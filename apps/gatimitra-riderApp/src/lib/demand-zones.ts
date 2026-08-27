import { distanceMeters } from "@/src/lib/geo-distance";

export type DemandZonePoint = {
  lat: number;
  lng: number;
};

export type DemandZone = {
  id: string;
  label: string;
  /** Zone center — Google Maps destination. */
  centroid: DemandZonePoint;
  distanceKm: number;
  storeCount: number;
  /** GeoJSON Polygon coordinates: [lng, lat][][] (outer ring closed). */
  polygon: [number, number][][];
};

const CELL_DEG = 0.008; // ~0.9 km
const MIN_STORES_PER_ZONE = 1;
const MAX_ZONES = 5;
const MIN_RADIUS_M = 280;
const RADIUS_PAD_M = 120;
const HEX_SIDES = 6;

function cellKey(lat: number, lng: number): string {
  const rLat = Math.floor(lat / CELL_DEG);
  const rLng = Math.floor(lng / CELL_DEG);
  return `${rLat}:${rLng}`;
}

function hexagonPolygon(
  center: DemandZonePoint,
  radiusM: number
): [number, number][][] {
  const coords: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const mPerDegLat = 111_320;
  const mPerDegLng = Math.max(1, 111_320 * Math.cos(latRad));
  const dLat = radiusM / mPerDegLat;
  const dLng = radiusM / mPerDegLng;

  for (let i = 0; i < HEX_SIDES; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    coords.push([
      center.lng + dLng * Math.cos(angle),
      center.lat + dLat * Math.sin(angle),
    ]);
  }
  coords.push(coords[0]!);
  return [coords];
}

/** Flat-top hex ring around a center when H3 boundary is missing from the API. */
export function hexRingFromCenter(
  center: { lat: number; lng: number },
  radiusM = 320
): [number, number][] {
  return hexagonPolygon(center, radiusM)[0] ?? [];
}

/** @deprecated Legacy name — kept for tests; shapes are hexagons now. */
function circlePolygon(center: DemandZonePoint, radiusM: number): [number, number][][] {
  return hexagonPolygon(center, radiusM);
}

/**
 * Cluster nearby restaurant points into labeled high-demand zones around the rider.
 */
export function buildDemandZones(
  rider: DemandZonePoint,
  stores: DemandZonePoint[],
  options?: { maxZones?: number; minStores?: number }
): DemandZone[] {
  const maxZones = options?.maxZones ?? MAX_ZONES;
  const minStores = options?.minStores ?? MIN_STORES_PER_ZONE;

  if (!Number.isFinite(rider.lat) || !Number.isFinite(rider.lng) || stores.length === 0) {
    return [];
  }

  const buckets = new Map<string, DemandZonePoint[]>();
  for (const s of stores) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const key = cellKey(s.lat, s.lng);
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }

  const candidates = [...buckets.entries()]
    .map(([key, points]) => {
      const centroid = {
        lat: points.reduce((a, p) => a + p.lat, 0) / points.length,
        lng: points.reduce((a, p) => a + p.lng, 0) / points.length,
      };
      let maxDist = 0;
      for (const p of points) {
        maxDist = Math.max(maxDist, distanceMeters(centroid.lat, centroid.lng, p.lat, p.lng));
      }
      const radiusM = Math.max(MIN_RADIUS_M, maxDist + RADIUS_PAD_M);
      const distanceKm =
        distanceMeters(rider.lat, rider.lng, centroid.lat, centroid.lng) / 1000;
      return {
        key,
        points,
        centroid,
        radiusM,
        distanceKm,
        storeCount: points.length,
      };
    })
    .filter((c) => c.storeCount >= minStores || buckets.size <= 2)
    .sort((a, b) => b.storeCount - a.storeCount || a.distanceKm - b.distanceKm)
    .slice(0, maxZones);

  // If everything filtered out but we have stores, take densest cells anyway.
  const selected =
    candidates.length > 0
      ? candidates
      : [...buckets.entries()]
          .map(([key, points]) => {
            const centroid = {
              lat: points.reduce((a, p) => a + p.lat, 0) / points.length,
              lng: points.reduce((a, p) => a + p.lng, 0) / points.length,
            };
            let maxDist = 0;
            for (const p of points) {
              maxDist = Math.max(
                maxDist,
                distanceMeters(centroid.lat, centroid.lng, p.lat, p.lng)
              );
            }
            return {
              key,
              points,
              centroid,
              radiusM: Math.max(MIN_RADIUS_M, maxDist + RADIUS_PAD_M),
              distanceKm:
                distanceMeters(rider.lat, rider.lng, centroid.lat, centroid.lng) / 1000,
              storeCount: points.length,
            };
          })
          .sort((a, b) => b.storeCount - a.storeCount || a.distanceKm - b.distanceKm)
          .slice(0, Math.min(3, maxZones));

  return selected.map((c, index) => ({
    id: `zone-${c.key}`,
    label: `Zone ${index + 1}`,
    centroid: c.centroid,
    distanceKm: Number(c.distanceKm.toFixed(1)),
    storeCount: c.storeCount,
    polygon: hexagonPolygon(c.centroid, c.radiusM),
  }));
}

export function demandZonesToGeoJson(zones: DemandZone[]): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    properties: { id: string; label: string; storeCount: number };
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
} {
  return {
    type: "FeatureCollection",
    features: zones.map((z) => ({
      type: "Feature" as const,
      id: z.id,
      properties: {
        id: z.id,
        label: z.label,
        storeCount: z.storeCount,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: z.polygon,
      },
    })),
  };
}
