export type RiderLoginGeo = {
  state?: string | null;
  district?: string | null;
  town?: string | null;
  village?: string | null;
};

function cleanPart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mergeLoginGeo(...sources: Array<RiderLoginGeo | null | undefined>): RiderLoginGeo {
  const out: RiderLoginGeo = {};
  for (const src of sources) {
    if (!src) continue;
    if (!out.state && src.state) out.state = src.state;
    if (!out.district && src.district) out.district = src.district;
    if (!out.town && src.town) out.town = src.town;
    if (!out.village && src.village) out.village = src.village;
  }
  return out;
}

/** Human-readable location line for dashboards. */
export function formatRiderLoginLocation(geo: RiderLoginGeo): string | null {
  const parts = [geo.village, geo.town, geo.district, geo.state]
    .map((p) => cleanPart(p))
    .filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(", ") : null;
}

function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === "::1") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  if (/^127\./.test(v) || /^10\./.test(v) || /^192\.168\./.test(v)) return true;
  const m = /^172\.(\d+)\./.exec(v);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveNominatimReverse(lat: number, lon: number): Promise<RiderLoginGeo> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}&zoom=14&addressdetails=1`;
  const data = (await fetchJsonWithTimeout(url, 1800, {
    headers: { "User-Agent": "GatiMitra-RiderApp/1.0 (login-geo)" },
  })) as { address?: Record<string, string> } | null;
  const addr = data?.address;
  if (!addr) return {};

  return {
    state: cleanPart(addr.state) ?? cleanPart(addr["state_district"]),
    district:
      cleanPart(addr.state_district) ??
      cleanPart(addr.county) ??
      cleanPart(addr.region) ??
      cleanPart(addr.district),
    town:
      cleanPart(addr.city) ??
      cleanPart(addr.town) ??
      cleanPart(addr.municipality) ??
      cleanPart(addr.suburb),
    village:
      cleanPart(addr.village) ??
      cleanPart(addr.hamlet) ??
      cleanPart(addr.neighbourhood) ??
      cleanPart(addr.suburb) ??
      cleanPart(addr.locality),
  };
}

/** Best-effort IP → admin areas (India-friendly). Skips LAN/private IPs. */
export async function resolveLoginGeoFromIp(ip: string | null | undefined): Promise<RiderLoginGeo> {
  const trimmed = ip?.trim();
  if (!trimmed || isPrivateOrLocalIp(trimmed)) return {};

  const ipData = (await fetchJsonWithTimeout(
    `http://ip-api.com/json/${encodeURIComponent(trimmed)}?fields=status,regionName,city,lat,lon`,
    2000,
  )) as { status?: string; regionName?: string; city?: string; lat?: number; lon?: number } | null;

  if (!ipData || ipData.status !== "success") return {};

  const fromIp: RiderLoginGeo = {
    state: cleanPart(ipData.regionName),
    town: cleanPart(ipData.city),
  };

  if (typeof ipData.lat === "number" && typeof ipData.lon === "number") {
    const fromCoords = await resolveNominatimReverse(ipData.lat, ipData.lon);
    return mergeLoginGeo(fromCoords, fromIp);
  }

  return fromIp;
}

export function loginGeoFromVercelHeaders(headers: Record<string, unknown>): RiderLoginGeo {
  const city = cleanPart(headers["x-vercel-ip-city"] as string);
  const region = cleanPart(headers["x-vercel-ip-country-region"] as string);
  return {
    state: region,
    town: city,
  };
}

export async function resolveRiderLoginGeoForSession(args: {
  ip?: string | null;
  headers?: Record<string, unknown>;
  clientGeo?: RiderLoginGeo | null;
}): Promise<RiderLoginGeo> {
  const [fromIp] = await Promise.all([resolveLoginGeoFromIp(args.ip)]);
  const fromHeaders = args.headers ? loginGeoFromVercelHeaders(args.headers) : {};
  // Client GPS wins, then IP/Nominatim, then edge headers.
  return mergeLoginGeo(args.clientGeo, fromIp, fromHeaders);
}
