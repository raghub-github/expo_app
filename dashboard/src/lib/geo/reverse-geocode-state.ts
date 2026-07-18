/**
 * Reverse-geocode lat/lng → Indian state/UT name (Mapbox).
 * Used when customer.state is empty but coordinates exist.
 */

export type ReverseGeocodeStateResult = {
  state: string | null;
  city: string | null;
  postalCode: string | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 4_000;
type CacheEntry = { value: ReverseGeocodeStateResult | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function cacheGet(lat: number, lon: number): ReverseGeocodeStateResult | null | undefined {
  const k = cacheKey(lat, lon);
  const hit = cache.get(k);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    cache.delete(k);
    return undefined;
  }
  cache.delete(k);
  cache.set(k, hit);
  return hit.value;
}

function cacheSet(lat: number, lon: number, value: ReverseGeocodeStateResult | null): void {
  const k = cacheKey(lat, lon);
  cache.set(k, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest != null) cache.delete(oldest);
  }
}

function mapboxToken(): string | null {
  const t =
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    process.env.MAPBOX_PUBLIC_TOKEN?.trim() ||
    "";
  return t || null;
}

function pickContext(
  context: Array<{ id?: string; text?: string }> | undefined,
  prefix: string
): string | null {
  const hit = context?.find((c) => String(c.id ?? "").startsWith(prefix));
  const text = hit?.text?.trim();
  return text || null;
}

/** Normalize Mapbox region labels toward `states.name` values. */
export function normalizeIndiaStateLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\s+UT$/i, "").replace(/\s+Union Territory$/i, "").trim();
  const aliases: Record<string, string> = {
    "national capital territory of delhi": "Delhi",
    "nct of delhi": "Delhi",
    "delhi ncr": "Delhi",
    "jammu and kashmir": "Jammu and Kashmir",
    "jammu & kashmir": "Jammu and Kashmir",
    "dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
    "andaman and nicobar islands": "Andaman and Nicobar Islands",
    "andaman & nicobar": "Andaman and Nicobar Islands",
  };
  const key = s.toLowerCase();
  return aliases[key] ?? s;
}

export async function reverseGeocodeStateFromCoords(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeStateResult | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const cached = cacheGet(latitude, longitude);
  if (cached !== undefined) return cached;

  const token = mapboxToken();
  if (!token) {
    cacheSet(latitude, longitude, null);
    return null;
  }

  try {
    const url = new URL(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "IN");
    url.searchParams.set("limit", "1");
    url.searchParams.set("types", "address,place,postcode,region,locality");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) {
      cacheSet(latitude, longitude, null);
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{
        context?: Array<{ id?: string; text?: string }>;
        text?: string;
        place_type?: string[];
      }>;
    };
    const feature = data.features?.[0];
    if (!feature) {
      cacheSet(latitude, longitude, null);
      return null;
    }
    const ctx = feature.context ?? [];
    let state =
      pickContext(ctx, "region.") ||
      (feature.place_type?.includes("region") ? feature.text?.trim() || null : null);
    state = normalizeIndiaStateLabel(state);
    const result: ReverseGeocodeStateResult = {
      state,
      city: pickContext(ctx, "place.") ?? pickContext(ctx, "locality."),
      postalCode: pickContext(ctx, "postcode."),
    };
    cacheSet(latitude, longitude, result);
    return result;
  } catch {
    cacheSet(latitude, longitude, null);
    return null;
  }
}

/** Run async work with limited concurrency. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return results;
}
