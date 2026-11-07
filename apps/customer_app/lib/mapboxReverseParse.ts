/**
 * Pure parser for a Mapbox Geocoding v6 reverse response.
 *
 * The request deliberately omits `types`. v6 then answers with the whole hierarchy for
 * the point in one call — address, postcode, locality, place, region — and it does so
 * even in rural India where there is no address feature at all:
 *
 *   town:  address | postcode | locality | place | region | country
 *   rural:           postcode | locality | place | district | region | country
 *
 * The old `types=address` tier returned nothing in the rural case, and its follow-up
 * tier sent several types with limit>1, which v6 rejects outright with HTTP 422. So the
 * accurate provider failed every time there was no street address.
 */

export type V6ReverseFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    context?: Record<string, { name?: string } | undefined>;
  };
};

export type ParsedReverse = {
  /** Most specific trustworthy name for the point. */
  name: string;
  /** Neighbourhood / locality around the point, when known. */
  area: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  fullAddress: string;
  /** Metres from the queried point to the feature used for `name`. */
  distanceM: number | null;
  /** True when no street-level feature is close enough to vouch for the exact spot. */
  approximate: boolean;
};

/** Beyond this, a mapped street address describes somewhere else: name the area instead. */
export const ADDRESS_TRUST_RADIUS_M = 150;
/** Metres beyond which the nearest street-level feature is only an approximation. */
export const APPROXIMATE_THRESHOLD_M = 45;

function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

export function parseV6Reverse(
  features: V6ReverseFeature[] | null | undefined,
  latitude: number,
  longitude: number
): ParsedReverse | null {
  const list = features ?? [];
  if (list.length === 0) return null;

  const byType = new Map<string, V6ReverseFeature>();
  for (const f of list) {
    const type = f.properties?.feature_type;
    if (type && !byType.has(type)) byType.set(type, f);
  }
  const nameOf = (type: string) => clean(byType.get(type)?.properties?.name);
  /** A type's name, from its own feature or from the context of any other feature. */
  const lookup = (type: string): string | null => {
    const own = nameOf(type);
    if (own) return own;
    for (const f of list) {
      const fromContext = clean(f.properties?.context?.[type]?.name);
      if (fromContext) return fromContext;
    }
    return null;
  };
  const distanceTo = (f: V6ReverseFeature | undefined): number | null => {
    const c = f?.geometry?.coordinates;
    if (!c || typeof c[0] !== "number" || typeof c[1] !== "number") return null;
    return metresBetween(latitude, longitude, c[1], c[0]);
  };

  const area = lookup("neighborhood") ?? lookup("locality");
  const city = lookup("place") ?? lookup("locality") ?? lookup("district");
  const state = lookup("region");
  const pincode = lookup("postcode");

  const street = byType.get("address") ?? byType.get("street");
  const streetDistance = distanceTo(street);
  const streetIsTrusted =
    !!street && streetDistance != null && streetDistance <= ADDRESS_TRUST_RADIUS_M;

  // The most specific feature that is genuinely about this point.
  const namedBy = streetIsTrusted
    ? street
    : (byType.get("neighborhood") ?? byType.get("locality") ?? byType.get("place") ?? list[0]);
  const name = clean(namedBy?.properties?.name) ?? area ?? city;
  if (!name) return null;

  const streetFullAddress = streetIsTrusted ? clean(street?.properties?.full_address) : null;
  const fullAddress =
    streetFullAddress ??
    [name, area !== name ? area : null, city !== name ? city : null, state, pincode, "India"]
      .filter((p): p is string => !!p)
      .filter((p, i, all) => all.indexOf(p) === i)
      .join(", ");

  return {
    name,
    area,
    city,
    state,
    pincode,
    fullAddress,
    distanceM: streetDistance ?? distanceTo(namedBy),
    approximate:
      !streetIsTrusted || streetDistance == null || streetDistance > APPROXIMATE_THRESHOLD_M,
  };
}
