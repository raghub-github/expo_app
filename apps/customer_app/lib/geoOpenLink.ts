/**
 * Parse Android/iOS "Open with" map intents (geo:, Google Maps URLs)
 * into lat/lng (+ optional label) for the customer Mapbox location screen.
 */

export type ParsedGeoOpen = {
  latitude: number;
  longitude: number;
  label?: string;
};

function isFiniteCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Prefer non-zero pairs; geo:0,0?q=lat,lng is common. */
function pickCoords(
  candidates: Array<{ lat: number; lng: number; label?: string }>,
): ParsedGeoOpen | null {
  for (const c of candidates) {
    if (isFiniteCoord(c.lat, c.lng)) {
      return {
        latitude: c.lat,
        longitude: c.lng,
        ...(c.label?.trim() ? { label: c.label.trim() } : {}),
      };
    }
  }
  return null;
}

function parseLatLngPair(raw: string): { lat: number; lng: number } | null {
  const m = String(raw)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

export function isGeoOrMapsOpenPath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl?.trim()) return false;
  const u = pathOrUrl.trim().toLowerCase();
  if (u.startsWith("geo:")) return true;
  if (u.startsWith("google.navigation:")) return true;
  if (u.includes("maps.google.") || u.includes("google.com/maps")) return true;
  if (u.includes("maps.app.goo.gl") || u.includes("goo.gl/maps")) return true;
  return false;
}

/**
 * Extract coordinates from geo: / Google Maps share / navigation URLs.
 * Returns null when only a short link / place name is present (no coords).
 */
export function parseGeoOpenLink(pathOrUrl: string | null | undefined): ParsedGeoOpen | null {
  if (!pathOrUrl?.trim()) return null;
  const raw = pathOrUrl.trim();

  try {
    if (/^geo:/i.test(raw)) {
      const withoutScheme = raw.slice(4);
      const [body, query = ""] = withoutScheme.split("?");
      const base = parseLatLngPair(body);
      const params = new URLSearchParams(query);
      const q = params.get("q") || "";
      const qDecoded = decodeMaybe(q);
      const fromQ = parseLatLngPair(qDecoded);
      const labelMatch = qDecoded.match(/\(([^)]+)\)\s*$/);
      const labelFromParens = labelMatch?.[1]?.trim();
      const labelPlain =
        !fromQ && qDecoded && !/^-?\d/.test(qDecoded.trim()) ? qDecoded.trim() : undefined;

      return pickCoords([
        ...(fromQ
          ? [{ lat: fromQ.lat, lng: fromQ.lng, label: labelFromParens || labelPlain }]
          : []),
        ...(base ? [{ lat: base.lat, lng: base.lng, label: labelFromParens || labelPlain }] : []),
      ]);
    }

    if (/^google\.navigation:/i.test(raw)) {
      const qIdx = raw.indexOf("q=");
      if (qIdx >= 0) {
        const q = decodeMaybe(raw.slice(qIdx + 2).split("&")[0] || "");
        const pair = parseLatLngPair(q);
        if (pair) return pickCoords([{ lat: pair.lat, lng: pair.lng }]);
      }
      return null;
    }

    // Normalize custom schemes / relative paths for URL parsing.
    const normalized = raw.includes("://")
      ? raw
      : `https://maps.google.com${raw.startsWith("/") ? raw : `/${raw}`}`;
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const path = url.pathname + url.search;

    const candidates: Array<{ lat: number; lng: number; label?: string }> = [];

    const queryParam =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      url.searchParams.get("destination") ||
      "";
    if (queryParam) {
      const decoded = decodeMaybe(queryParam);
      const pair = parseLatLngPair(decoded);
      if (pair) {
        const labelMatch = decoded.match(/\(([^)]+)\)\s*$/);
        candidates.push({
          lat: pair.lat,
          lng: pair.lng,
          label: labelMatch?.[1],
        });
      }
    }

    // /maps/@lat,lng,zoom or /maps/place/.../@lat,lng,zoom
    const atMatch = path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      candidates.push({ lat: Number(atMatch[1]), lng: Number(atMatch[2]) });
    }

    // !3dLAT!4dLNG (Google data blobs)
    const d3 = path.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (d3) {
      candidates.push({ lat: Number(d3[1]), lng: Number(d3[2]) });
    }

    // ll=lat,lng
    const ll = url.searchParams.get("ll");
    if (ll) {
      const pair = parseLatLngPair(decodeMaybe(ll));
      if (pair) candidates.push({ lat: pair.lat, lng: pair.lng });
    }

    // Short links without resolved coords — nothing to parse here.
    if (
      host.includes("goo.gl") ||
      host.includes("maps.app.goo.gl")
    ) {
      return pickCoords(candidates);
    }

    if (
      host.includes("google.") ||
      host.includes("maps.google.")
    ) {
      return pickCoords(candidates);
    }

    return pickCoords(candidates);
  } catch {
    return null;
  }
}

/** Expo Router path for Mapbox location confirm screen. */
export function geoOpenToLocationMapPath(parsed: ParsedGeoOpen): string {
  const q = new URLSearchParams();
  q.set("latitude", String(parsed.latitude));
  q.set("longitude", String(parsed.longitude));
  if (parsed.label) {
    q.set("primary", parsed.label);
    q.set("fullAddress", parsed.label);
  }
  q.set("fromExternalMap", "1");
  return `/location-map?${q.toString()}`;
}
