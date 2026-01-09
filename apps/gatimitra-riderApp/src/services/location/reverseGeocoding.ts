import * as Location from "expo-location";
import { Platform } from "react-native";

export interface AddressData {
  city: string;
  state: string;
  pincode: string;
  address: string;
  country?: string;
}

/**
 * Reverse geocoding service to convert coordinates to address
 * Uses expo-location's built-in reverseGeocodeAsync which uses device's geocoding service
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  retries: number = 3
): Promise<AddressData> {
  // Ensure coordinates are valid
  if (isNaN(lat) || isNaN(lon)) {
    throw new Error("Invalid coordinates");
  }

  // Ensure lat/lon are within valid ranges
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error("Coordinates out of valid range");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Use expo-location's reverse geocoding (uses device's geocoding service)
      const results = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });

      if (!results || results.length === 0) {
        throw new Error("No address found for coordinates");
      }

      // Use the first result (most accurate)
      const result = results[0]!;

      // Extract address components
      const city = result.city || result.district || result.subAdministrativeArea || "";
      const state = result.region || result.administrativeArea || "";
      const pincode = result.postalCode || "";
      const country = result.country || "IN";
      
      // Build full address string
      const addressParts: string[] = [];
      if (result.street) addressParts.push(result.street);
      if (result.streetNumber) addressParts.push(result.streetNumber);
      if (result.name) addressParts.push(result.name);
      if (result.district) addressParts.push(result.district);
      if (city) addressParts.push(city);
      if (state) addressParts.push(state);
      if (pincode) addressParts.push(pincode);

      const address = addressParts.length > 0 
        ? addressParts.join(", ")
        : `${city}${city && state ? ", " : ""}${state}${pincode ? ` ${pincode}` : ""}`.trim();

      return {
        city: city || "Unknown",
        state: state || "Unknown",
        pincode: pincode || "",
        address: address || `${lat}, ${lon}`, // Fallback to coordinates if no address
        country: country,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[ReverseGeocoding] Attempt ${attempt + 1} failed:`, lastError.message);
      
      // Wait before retry (exponential backoff)
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // If all retries failed, return fallback data
  console.warn("[ReverseGeocoding] All retries failed, using fallback");
  return {
    city: "Unknown",
    state: "Unknown",
    pincode: "",
    address: `${lat.toFixed(8)}, ${lon.toFixed(8)}`,
    country: "IN",
  };
}

/**
 * Check if reverse geocoding is available on this platform
 */
export function isReverseGeocodingAvailable(): boolean {
  // expo-location's reverseGeocodeAsync is available on iOS, Android, and web
  return Platform.OS !== "web" || typeof navigator !== "undefined";
}
