import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";

export type RiderLoginGeoPayload = {
  state?: string;
  district?: string;
  town?: string;
  village?: string;
};

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Best-effort GPS login location — never blocks login if unavailable. */
export async function getRiderLoginGeoFromDevice(): Promise<RiderLoginGeoPayload | undefined> {
  try {
    const readiness = await getDeviceLocationReadiness();
    if (!readiness.isReady) return undefined;

    const acquired = await acquireAndCommitRiderLocation({ assumeReady: true });
    if (!acquired.ok) return undefined;

    const place = acquired.address;
    const state = clean(place.state);
    const town = clean(place.city);
    const payload: RiderLoginGeoPayload = {
      state,
      town,
      district: town,
      village: undefined,
    };

    if (!payload.state && !payload.district && !payload.town) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}
