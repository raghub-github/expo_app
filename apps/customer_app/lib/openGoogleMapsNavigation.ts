import { Alert, Linking, Platform } from "react-native";

export type MapCoords = {
  lat: number;
  lng: number;
};

type OpenGoogleMapsNavigationOptions = {
  destination: MapCoords;
  origin?: MapCoords;
  destinationLabel?: string;
  /**
   * `directions` — route overview with Start (Google Maps dir UI).
   * `navigate` — jump straight into turn-by-turn (default, rider-style).
   */
  mode?: "directions" | "navigate";
};

function isValidCoord(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && !(value === 0);
}

function buildWebDirectionsUrl(
  destination: MapCoords,
  origin: MapCoords | undefined,
  mode: "directions" | "navigate"
): string {
  const dest = `${destination.lat},${destination.lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
  });
  if (mode === "navigate") {
    params.set("dir_action", "navigate");
  }
  if (origin && isValidCoord(origin.lat) && isValidCoord(origin.lng)) {
    params.set("origin", `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

async function tryOpenUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens Google Maps with best driving route (origin → destination).
 * Self-pick-up should use `mode: "directions"` so the customer sees Start
 * (route overview) instead of jumping into live turn-by-turn.
 */
export async function openGoogleMapsNavigation({
  destination,
  origin,
  destinationLabel,
  mode = "navigate",
}: OpenGoogleMapsNavigationOptions): Promise<void> {
  if (!isValidCoord(destination.lat) || !isValidCoord(destination.lng)) {
    Alert.alert("Location unavailable", "Store location is not available yet.");
    return;
  }

  const { lat: dLat, lng: dLng } = destination;
  const hasOrigin = origin && isValidCoord(origin.lat) && isValidCoord(origin.lng);
  const webUrl = buildWebDirectionsUrl(destination, origin, mode);

  if (mode === "directions") {
    // Prefer the directions overview (image-3 style) — never google.navigation:.
    if (Platform.OS === "android") {
      if (await tryOpenUrl(webUrl)) return;
      const geoUrl = destinationLabel?.trim()
        ? `geo:${dLat},${dLng}?q=${dLat},${dLng}(${encodeURIComponent(destinationLabel.trim())})`
        : `geo:${dLat},${dLng}?q=${dLat},${dLng}`;
      if (await tryOpenUrl(geoUrl)) return;
    }

    if (Platform.OS === "ios") {
      const googleMapsUrl = hasOrigin
        ? `comgooglemaps://?saddr=${origin!.lat},${origin!.lng}&daddr=${dLat},${dLng}&directionsmode=driving`
        : `comgooglemaps://?daddr=${dLat},${dLng}&directionsmode=driving`;
      if (await tryOpenUrl(googleMapsUrl)) return;

      const appleMapsUrl = hasOrigin
        ? `maps://?saddr=${origin!.lat},${origin!.lng}&daddr=${dLat},${dLng}&dirflg=d`
        : `maps://?daddr=${dLat},${dLng}&dirflg=d`;
      if (await tryOpenUrl(appleMapsUrl)) return;
    }

    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert("Could not open maps", "Install Google Maps or try again in a moment.");
    }
    return;
  }

  // navigate — turn-by-turn (legacy rider / delivery flows)
  if (Platform.OS === "android") {
    if (hasOrigin) {
      const dirIntent =
        `https://www.google.com/maps/dir/?api=1&origin=${origin!.lat},${origin!.lng}` +
        `&destination=${dLat},${dLng}&travelmode=driving&dir_action=navigate`;
      if (await tryOpenUrl(dirIntent)) return;
    }
    const navUrl = `google.navigation:q=${dLat},${dLng}&mode=d`;
    if (await tryOpenUrl(navUrl)) return;

    const geoUrl = destinationLabel?.trim()
      ? `geo:${dLat},${dLng}?q=${dLat},${dLng}(${encodeURIComponent(destinationLabel.trim())})`
      : `geo:${dLat},${dLng}?q=${dLat},${dLng}`;
    if (await tryOpenUrl(geoUrl)) return;
  }

  if (Platform.OS === "ios") {
    const googleMapsUrl = hasOrigin
      ? `comgooglemaps://?saddr=${origin!.lat},${origin!.lng}&daddr=${dLat},${dLng}&directionsmode=driving`
      : `comgooglemaps://?daddr=${dLat},${dLng}&directionsmode=driving`;
    if (await tryOpenUrl(googleMapsUrl)) return;

    const appleMapsUrl = hasOrigin
      ? `maps://?saddr=${origin!.lat},${origin!.lng}&daddr=${dLat},${dLng}&dirflg=d`
      : `maps://?daddr=${dLat},${dLng}&dirflg=d`;
    if (await tryOpenUrl(appleMapsUrl)) return;
  }

  try {
    await Linking.openURL(webUrl);
  } catch {
    Alert.alert("Could not open maps", "Install Google Maps or try again in a moment.");
  }
}
