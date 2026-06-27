import * as Location from "expo-location";

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
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return undefined;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return undefined;

    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null));

    if (!position) return undefined;

    const results = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const place = results[0];
    if (!place) return undefined;

    const state = clean(place.region) ?? clean(place.administrativeArea);
    const district =
      clean(place.subregion) ?? clean(place.district) ?? clean(place.subAdministrativeArea);
    const town = clean(place.city) ?? clean(place.name);
    const village =
      clean(place.subLocality) ??
      clean(place.street) ??
      clean(place.district) ??
      clean(place.name);

    const payload: RiderLoginGeoPayload = {
      state,
      district,
      town,
      village: village !== town ? village : undefined,
    };

    if (!payload.state && !payload.district && !payload.town && !payload.village) {
      return undefined;
    }
    return payload;
  } catch {
    return undefined;
  }
}
