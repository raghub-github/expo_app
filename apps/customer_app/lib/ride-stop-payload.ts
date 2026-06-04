/**
 * Normalize ride intermediate stops for order placement — requires lat/lon per stop.
 */

export type RideStopPayload = {
  sequence: number;
  address: string;
  latitude: number;
  longitude: number;
};

function isValidCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Parse stops JSON route param → API payload (drops stops without coordinates). */
export function parseRideStopsForOrder(stopsJson?: string): RideStopPayload[] {
  if (!stopsJson?.trim()) return [];
  try {
    const parsed = JSON.parse(stopsJson) as Array<{
      sequence?: number;
      address?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    if (!Array.isArray(parsed)) return [];

    const out: RideStopPayload[] = [];
    for (const raw of parsed.slice(0, 2)) {
      const address = raw.address?.trim();
      if (!address) continue;
      if (!isValidCoord(raw.latitude, raw.longitude)) continue;
      out.push({
        sequence: out.length + 1,
        address,
        latitude: raw.latitude!,
        longitude: raw.longitude!,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Returns error message when route params are incomplete for placement. */
export function validateRidePlacementCoords(input: {
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  pickupAddress?: string;
  dropAddress?: string;
  stopsJson?: string;
}): string | null {
  if (
    input.pickupLat == null ||
    input.pickupLng == null ||
    input.dropLat == null ||
    input.dropLng == null ||
    !Number.isFinite(input.pickupLat) ||
    !Number.isFinite(input.pickupLng) ||
    !Number.isFinite(input.dropLat) ||
    !Number.isFinite(input.dropLng)
  ) {
    return "Pickup and drop map coordinates are required.";
  }
  if (!input.pickupAddress?.trim() || !input.dropAddress?.trim()) {
    return "Pickup and drop addresses are required.";
  }

  if (!input.stopsJson?.trim()) return null;

  let parsed: Array<{ address?: string; latitude?: number | null; longitude?: number | null }>;
  try {
    parsed = JSON.parse(input.stopsJson) as typeof parsed;
  } catch {
    return "Invalid stop data.";
  }
  if (!Array.isArray(parsed)) return "Invalid stop data.";

  for (let i = 0; i < Math.min(parsed.length, 2); i += 1) {
    const stop = parsed[i];
    const address = stop?.address?.trim();
    if (!address) continue;
    if (!isValidCoord(stop?.latitude, stop?.longitude)) {
      return `Stop ${i + 1} needs a map location. Go back and select it from search or map.`;
    }
  }

  return null;
}

export function serializeRideStopsForRoute(stops: RideStopPayload[]): string {
  return JSON.stringify(stops);
}
