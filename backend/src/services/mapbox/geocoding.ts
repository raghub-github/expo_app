import { getEnv } from "../../config/env.js";

export type ForwardGeocodeResult = {
  latitude: number;
  longitude: number;
  placeName: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

function pickText(context: Array<{ id?: string; text?: string }> | undefined, prefix: string): string | null {
  const hit = context?.find((c) => String(c.id ?? "").startsWith(prefix));
  return hit?.text ? String(hit.text) : null;
}

export async function forwardGeocodeAddress(address: string): Promise<ForwardGeocodeResult | null> {
  const env = getEnv();
  const token = env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not configured");
  const q = address.trim();
  if (!q) return null;

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi,place,postcode,locality,neighborhood");
  url.searchParams.set("autocomplete", "false");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(7000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{
      center?: [number, number];
      place_name?: string;
      context?: Array<{ id?: string; text?: string }>;
      text?: string;
    }>;
  };
  const f = data.features?.[0];
  const center = f?.center;
  if (!center || center.length < 2) return null;
  const [lng, lat] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const ctx = f?.context ?? [];
  const city = pickText(ctx, "place.") ?? pickText(ctx, "locality.") ?? null;
  const state = pickText(ctx, "region.") ?? null;
  const pincode = pickText(ctx, "postcode.") ?? null;

  return {
    latitude: lat,
    longitude: lng,
    placeName: String(f?.place_name ?? f?.text ?? q),
    city,
    state,
    pincode,
  };
}

