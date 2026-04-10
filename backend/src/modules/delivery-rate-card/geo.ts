export type Point = { lat: number; lng: number };

function pointInRing(pt: [number, number], ring: Array<[number, number]>): boolean {
  // Ray casting algorithm. Coordinates: [lng, lat]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInGeoJSON(point: Point, geojson: unknown): boolean {
  if (!geojson || typeof geojson !== "object") return false;
  const g = geojson as any;
  const pt: [number, number] = [Number(point.lng), Number(point.lat)];
  if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;

  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    const rings = g.coordinates as Array<Array<[number, number]>>;
    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return false;
    if (!pointInRing(pt, outer)) return false;
    // Holes: if inside any hole => false
    for (let i = 1; i < rings.length; i++) {
      const hole = rings[i];
      if (Array.isArray(hole) && hole.length >= 3 && pointInRing(pt, hole)) return false;
    }
    return true;
  }

  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const polys = g.coordinates as Array<Array<Array<[number, number]>>>;
    for (const poly of polys) {
      const outer = poly?.[0];
      if (!Array.isArray(outer) || outer.length < 3) continue;
      if (!pointInRing(pt, outer)) continue;
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        const hole = poly[i];
        if (Array.isArray(hole) && hole.length >= 3 && pointInRing(pt, hole)) inHole = true;
      }
      if (!inHole) return true;
    }
    return false;
  }

  return false;
}

