/**
 * Road route directions via OSRM (no API key). Returns polyline coordinates for map.
 */

export type LatLng = { latitude: number; longitude: number };

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/**
 * Fetch driving route between two points. Returns array of { latitude, longitude } for Polyline.
 * Falls back to straight line if OSRM fails (e.g. CORS on web, or network error).
 */
export async function getRouteCoordinates(
  from: LatLng,
  to: LatLng
): Promise<LatLng[]> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return fallbackLine(from, to);
    const data = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const route = data.routes?.[0];
    const geojsonCoords = route?.geometry?.coordinates;
    if (!geojsonCoords || geojsonCoords.length < 2) return fallbackLine(from, to);
    return geojsonCoords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return fallbackLine(from, to);
  }
}

function fallbackLine(from: LatLng, to: LatLng): LatLng[] {
  return [from, to];
}
