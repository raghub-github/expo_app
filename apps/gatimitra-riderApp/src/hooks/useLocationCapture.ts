import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { reverseGeocode, type AddressData } from "@/src/services/location/reverseGeocoding";

export interface LocationCaptureData {
  lat: number;
  lon: number;
  city: string;
  state: string;
  pincode: string;
  address: string;
  country?: string;
}

export interface UseLocationCaptureResult {
  data: LocationCaptureData | null;
  loading: boolean;
  error: string | null;
  retry: () => Promise<void>;
}

/**
 * Hook to automatically capture location with high precision and reverse geocoding
 * Returns location data with 8+ decimal places for accuracy
 */
export function useLocationCapture(autoCapture: boolean = true): UseLocationCaptureResult {
  const [data, setData] = useState<LocationCaptureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureLocation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if location permissions are granted
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Location permission not granted. Please enable location access in settings.");
      }

      // Check if location services are enabled
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        throw new Error("Location services are disabled. Please enable GPS in device settings.");
      }

      // Get current position with highest accuracy
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        maximumAge: 10000, // Accept cached location up to 10 seconds old
      });

      const coords = location.coords;
      
      // Ensure high precision: 8+ decimal places
      const lat = parseFloat(coords.latitude.toFixed(8));
      const lon = parseFloat(coords.longitude.toFixed(8));

      // Perform reverse geocoding to get address details
      const addressData = await reverseGeocode(lat, lon);

      const locationData: LocationCaptureData = {
        lat,
        lon,
        city: addressData.city,
        state: addressData.state,
        pincode: addressData.pincode,
        address: addressData.address,
        country: addressData.country,
      };

      setData(locationData);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to capture location";
      setError(errorMessage);
      setData(null);
      console.error("[useLocationCapture] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-capture on mount if enabled
  useEffect(() => {
    if (autoCapture && Platform.OS !== "web") {
      void captureLocation();
    }
  }, [autoCapture, captureLocation]);

  return {
    data,
    loading,
    error,
    retry: captureLocation,
  };
}
