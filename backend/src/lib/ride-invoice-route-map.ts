import type PDFDocument from "pdfkit";
import { getEnv } from "../config/env.js";
import { getRoute } from "../modules/distance/distance.service.js";

const TILE_SIZE = 256;
const OSM_TILE_URL = "https://tile.openstreetmap.org";
const ROUTE_STROKE = "#A67C00";

export type RouteMapCoords = {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
};

function num(v: unknown): number {
  if (v == null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function resolveInvoiceRouteCoords(input: {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
}): RouteMapCoords | null {
  const snap = input.billingSnapshot ?? {};
  const plat =
    num(input.pickupLat) || num(snap.pickup_lat) || num(snap.pickupLat);
  const plng =
    num(input.pickupLng) || num(snap.pickup_lon) || num(snap.pickupLng) || num(snap.pickup_lng);
  const dlat = num(input.dropLat) || num(snap.drop_lat) || num(snap.dropLat);
  const dlng =
    num(input.dropLng) || num(snap.drop_lon) || num(snap.dropLng) || num(snap.drop_lng);

  if (!isValidCoord(plat, plng) || !isValidCoord(dlat, dlng)) return null;
  return { pickupLat: plat, pickupLng: plng, dropLat: dlat, dropLng: dlng };
}

function lngLatToWorldPx(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function pickZoom(
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
  widthPx: number,
  heightPx: number
): number {
  for (let z = 16; z >= 10; z -= 1) {
    const nw = lngLatToWorldPx(swLng, neLat, z);
    const se = lngLatToWorldPx(neLng, swLat, z);
    if (Math.abs(se.x - nw.x) <= widthPx * 0.9 && Math.abs(se.y - nw.y) <= heightPx * 0.9) {
      return z;
    }
  }
  return 12;
}

function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const coords: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}

async function resolveRoadRoutePoints(coords: RouteMapCoords): Promise<{ lat: number; lng: number }[]> {
  const fallback = [
    { lat: coords.pickupLat, lng: coords.pickupLng },
    { lat: coords.dropLat, lng: coords.dropLng },
  ];
  const env = getEnv();
  try {
    const route = await getRoute({
      origin: { lat: coords.pickupLat, lng: coords.pickupLng },
      destination: { lat: coords.dropLat, lng: coords.dropLng },
      profile: "bike",
      mapboxToken: env.MAPBOX_ACCESS_TOKEN,
      osrmBaseUrl: env.OSRM_BASE_URL,
    });
    if (route.source === "haversine") return fallback;
    const encoded = route.geometry ?? route.polyline;
    if (!encoded?.trim()) return fallback;
    const decoded = decodePolyline(encoded);
    return decoded.length >= 3 ? decoded : fallback;
  } catch {
    return fallback;
  }
}

async function fetchOsmTile(z: number, x: number, y: number): Promise<Buffer | null> {
  try {
    const res = await fetch(`${OSM_TILE_URL}/${z}/${x}/${y}.png`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "GatiMitra-Invoice/1.0" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    return isPng ? buf : null;
  } catch {
    return null;
  }
}

/** Draw pickup/drop route map using OpenStreetMap tiles (works when staticmap hosts are down). */
export async function drawRouteMapOnPdf(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  height: number,
  coords: RouteMapCoords
): Promise<boolean> {
  const routePoints = await resolveRoadRoutePoints(coords);
  const pad = 0.2;
  const allLats = routePoints.map((p) => p.lat);
  const allLngs = routePoints.map((p) => p.lng);
  const minLat = Math.min(coords.pickupLat, coords.dropLat, ...allLats);
  const maxLat = Math.max(coords.pickupLat, coords.dropLat, ...allLats);
  const minLng = Math.min(coords.pickupLng, coords.dropLng, ...allLngs);
  const maxLng = Math.max(coords.pickupLng, coords.dropLng, ...allLngs);
  const latSpan = Math.max(maxLat - minLat, 0.008);
  const lngSpan = Math.max(maxLng - minLng, 0.008);
  const swLat = minLat - latSpan * pad;
  const neLat = maxLat + latSpan * pad;
  const swLng = minLng - lngSpan * pad;
  const neLng = maxLng + lngSpan * pad;

  const zoom = pickZoom(swLat, swLng, neLat, neLng, width, height);
  const topLeft = lngLatToWorldPx(swLng, neLat, zoom);
  const bottomRight = lngLatToWorldPx(neLng, swLat, zoom);
  const viewW = Math.max(bottomRight.x - topLeft.x, 1);
  const viewH = Math.max(bottomRight.y - topLeft.y, 1);

  const minTileX = Math.floor(topLeft.x / TILE_SIZE);
  const maxTileX = Math.floor((topLeft.x + viewW) / TILE_SIZE);
  const minTileY = Math.floor(topLeft.y / TILE_SIZE);
  const maxTileY = Math.floor((topLeft.y + viewH) / TILE_SIZE);

  doc.save();
  doc.roundedRect(x, y, width, height, 8).clip();

  let drewAny = false;
  for (let tx = minTileX; tx <= maxTileX; tx += 1) {
    for (let ty = minTileY; ty <= maxTileY; ty += 1) {
      const buf = await fetchOsmTile(zoom, tx, ty);
      if (!buf) continue;
      const tileWorldX = tx * TILE_SIZE;
      const tileWorldY = ty * TILE_SIZE;
      const drawX = x + ((tileWorldX - topLeft.x) / viewW) * width;
      const drawY = y + ((tileWorldY - topLeft.y) / viewH) * height;
      const drawW = (TILE_SIZE / viewW) * width;
      const drawH = (TILE_SIZE / viewH) * height;
      doc.image(buf, drawX, drawY, { width: drawW, height: drawH });
      drewAny = true;
    }
  }

  if (!drewAny) {
    doc.rect(x, y, width, height).fill("#E5E7EB");
  }

  const toPx = (lat: number, lng: number) => {
    const w = lngLatToWorldPx(lng, lat, zoom);
    return {
      px: x + ((w.x - topLeft.x) / viewW) * width,
      py: y + ((w.y - topLeft.y) / viewH) * height,
    };
  };

  const pickup = toPx(coords.pickupLat, coords.pickupLng);
  const drop = toPx(coords.dropLat, coords.dropLng);

  if (routePoints.length >= 2) {
    const first = toPx(routePoints[0]!.lat, routePoints[0]!.lng);
    doc.moveTo(first.px, first.py);
    for (let i = 1; i < routePoints.length; i += 1) {
      const pt = routePoints[i]!;
      const px = toPx(pt.lat, pt.lng);
      doc.lineTo(px.px, px.py);
    }
    doc
      .strokeColor(ROUTE_STROKE)
      .lineWidth(3)
      .lineCap("round")
      .lineJoin("round")
      .stroke();
  }

  doc.circle(pickup.px, pickup.py, 7).fill("#10B981");
  doc.circle(pickup.px, pickup.py, 7).strokeColor("#FFFFFF").lineWidth(1.5).stroke();

  doc.circle(drop.px, drop.py, 7).fill("#EF4444");
  doc.circle(drop.px, drop.py, 7).strokeColor("#FFFFFF").lineWidth(1.5).stroke();

  doc.restore();
  return drewAny;
}
