import { getSql } from "../../db/client.js";
import { geocodeOpenMeteo } from "./openmeteo.client.js";
import { normalizeGeocodeKey } from "./weather.utils.js";

export async function resolveGeocodedCoords(args: {
  city?: string | null;
  district?: string | null;
}): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const city = args.city?.trim();
  if (!city) return null;
  const lookupKey = normalizeGeocodeKey(city, args.district);
  const sql = getSql();

  const cached = (await sql`
    SELECT latitude, longitude, display_name
    FROM weather_geocode_cache
    WHERE lookup_key = ${lookupKey}
    LIMIT 1
  `) as Array<{ latitude: string; longitude: string; display_name: string }>;

  if (cached[0]) {
    return {
      lat: Number(cached[0].latitude),
      lng: Number(cached[0].longitude),
      displayName: cached[0].display_name,
    };
  }

  const query = args.district?.trim() ? `${city}, ${args.district}` : city;
  const hit = await geocodeOpenMeteo(query);
  if (!hit) return null;

  await sql`
    INSERT INTO weather_geocode_cache (lookup_key, display_name, latitude, longitude, country, admin1)
    VALUES (
      ${lookupKey},
      ${hit.name},
      ${String(hit.latitude)},
      ${String(hit.longitude)},
      ${hit.country ?? null},
      ${hit.admin1 ?? null}
    )
    ON CONFLICT (lookup_key) DO NOTHING
  `;

  return { lat: hit.latitude, lng: hit.longitude, displayName: hit.name };
}
