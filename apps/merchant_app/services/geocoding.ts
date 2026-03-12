/**
 * Mapbox Geocoding (v5) — forward and reverse. Used for Edit Address (area search + map pin → address).
 * Token: use getConfig().mapboxPublicToken (public token only).
 */

export type GeocodeAddress = {
  place_name: string;
  full_address: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number;
  longitude: number;
};

type MapboxFeature = {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array< { id: string; text: string } >;
  text?: string;
  address?: string;
};

type MapboxResponse = { features: MapboxFeature[] };

function pickContext(context: MapboxFeature["context"], type: string): string {
  if (!context) return "";
  const c = context.find((x) => x.id.startsWith(type + ".") || x.id === type);
  return c?.text ?? "";
}

/** Reverse: coordinates → address. */
export async function reverseGeocode(
  token: string,
  lat: number,
  lng: number
): Promise<GeocodeAddress | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1&types=address,place,locality,neighborhood,postcode,region`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as MapboxResponse;
  const f = data.features?.[0];
  if (!f || !f.center?.length) return null;
  const [longitude, latitude] = f.center;
  const context = f.context ?? [];
  const place = pickContext(context, "place") || f.text || "";
  const region = pickContext(context, "region") || "";
  const postcode = pickContext(context, "postcode") || "";
  const address = f.address ? `${f.address} ${f.text ?? ""}`.trim() : "";
  const placeName = f.place_name ?? "";
  return {
    place_name: placeName,
    full_address: address || placeName,
    city: place,
    state: region,
    postal_code: postcode,
    latitude,
    longitude,
  };
}

/** Forward: search text → list of address + coordinates. */
export async function forwardGeocode(
  token: string,
  query: string,
  options?: { limit?: number; proximity?: string }
): Promise<GeocodeAddress[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({
    access_token: token,
    limit: String(options?.limit ?? 5),
    types: "address,place,postcode,locality,neighborhood,region",
  });
  if (options?.proximity) params.set("proximity", options.proximity);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as MapboxResponse;
  if (!Array.isArray(data.features)) return [];
  return data.features
    .filter((f) => f.center?.length === 2)
    .map((f) => {
      const [longitude, latitude] = f.center!;
      const context = f.context ?? [];
      const place = pickContext(context, "place") || f.text || "";
      const region = pickContext(context, "region") || "";
      const postcode = pickContext(context, "postcode") || "";
      const address = f.address ? `${f.address} ${f.text ?? ""}`.trim() : (f.place_name ?? "");
      return {
        place_name: f.place_name ?? "",
        full_address: (address || f.place_name) ?? "",
        city: place,
        state: region,
        postal_code: postcode,
        latitude,
        longitude,
      };
    });
}
