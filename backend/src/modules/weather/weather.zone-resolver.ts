import { getSql } from "../../db/client.js";
import { pointInGeoJSON } from "../delivery-rate-card/geo.js";

export type ResolvedServiceZone = {
  zoneName: string;
  zoneSlug: string;
  city: string;
  source: "rate_card" | "compass" | "grid";
};

const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  patna: { lat: 25.5941, lng: 85.1376 },
};

let zonesCache: { at: number; rows: Array<{ zoneName: string; cityName: string | null; geojson: unknown }> } | null =
  null;
const ZONES_CACHE_MS = 5 * 60_000;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function deriveCompassZone(city: string, lat: number, lng: number): string {
  const key = city.toLowerCase().replace(/[^a-z]/g, "");
  const center = CITY_CENTERS[key];
  if (!center) return `${city} Area`;

  const dLat = lat - center.lat;
  const dLng = lng - center.lng;
  const threshold = 0.018;
  if (Math.abs(dLat) < threshold && Math.abs(dLng) < threshold) return `${city} Central`;
  if (Math.abs(dLat) >= Math.abs(dLng)) {
    return dLat > 0 ? `${city} North` : `${city} South`;
  }
  return dLng > 0 ? `${city} East` : `${city} West`;
}

async function loadRateCardZones(): Promise<
  Array<{ zoneName: string; cityName: string | null; geojson: unknown }>
> {
  if (zonesCache && Date.now() - zonesCache.at < ZONES_CACHE_MS) return zonesCache.rows;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT z.zone_name AS zone_name, c.city_name AS city_name, z.geojson AS geojson
      FROM delivery_rate_card_zones z
      INNER JOIN delivery_rate_cards c ON c.id = z.rate_card_id
      WHERE z.is_active = true AND c.is_active = true AND z.zone_name IS NOT NULL
      ORDER BY z.priority ASC, z.id ASC
    `) as Array<{ zone_name: string; city_name: string | null; geojson: unknown }>;
    const mapped = rows.map((r) => ({
      zoneName: String(r.zone_name),
      cityName: r.city_name != null ? String(r.city_name) : null,
      geojson: r.geojson,
    }));
    zonesCache = { at: Date.now(), rows: mapped };
    return mapped;
  } catch {
    return [];
  }
}

export async function resolveServiceZone(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
}): Promise<ResolvedServiceZone> {
  const city = (args.cityHint ?? "Unknown").trim() || "Unknown";
  const zones = await loadRateCardZones();
  const cityLower = city.toLowerCase();

  for (const z of zones) {
    if (z.cityName && !z.cityName.toLowerCase().includes(cityLower) && !cityLower.includes(z.cityName.toLowerCase())) {
      continue;
    }
    if (pointInGeoJSON({ lat: args.lat, lng: args.lng }, z.geojson)) {
      return {
        zoneName: z.zoneName,
        zoneSlug: slugify(z.zoneName),
        city: z.cityName ?? city,
        source: "rate_card",
      };
    }
  }

  const compass = deriveCompassZone(city, args.lat, args.lng);
  return {
    zoneName: compass,
    zoneSlug: slugify(compass),
    city,
    source: "compass",
  };
}
