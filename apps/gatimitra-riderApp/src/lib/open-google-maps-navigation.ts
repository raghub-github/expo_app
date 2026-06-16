import { Alert, Linking, Platform } from "react-native";

export type MapCoords = {
  lat: number;
  lng: number;
};

type OpenGoogleMapsNavigationOptions = {
  destination: MapCoords;
  origin?: MapCoords;
  destinationLabel?: string;
};

function isValidCoord(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && !(value === 0);
}

function buildWebNavigationUrl(
  destination: MapCoords,
  origin?: MapCoords,
  destinationLabel?: string
): string {
  const dest = `${destination.lat},${destination.lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
    dir_action: "navigate",
  });

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
 * Opens Google Maps in turn-by-turn navigation mode from rider → destination.
 * Falls back through native schemes, then the Google Maps web directions URL.
 */
export async function openGoogleMapsNavigation({
  destination,
  origin,
  destinationLabel,
}: OpenGoogleMapsNavigationOptions): Promise<void> {
  if (!isValidCoord(destination.lat) || !isValidCoord(destination.lng)) {
    Alert.alert("Location unavailable", "Destination coordinates are not available yet.");
    return;
  }

  const { lat: dLat, lng: dLng } = destination;
  const hasOrigin = origin && isValidCoord(origin.lat) && isValidCoord(origin.lng);
  const webUrl = buildWebNavigationUrl(destination, origin, destinationLabel);

  if (Platform.OS === "android") {
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
    Alert.alert(
      "Could not open maps",
      "Install Google Maps or try again in a moment."
    );
  }
}
