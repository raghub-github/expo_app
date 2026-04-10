import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";
import { getConfig } from "@/config/env";

/** Shared native map settings: Google provider when API key is set, loading indicator while tiles fetch. */
export function customerMapProps(): {
  provider: typeof PROVIDER_GOOGLE | undefined;
  loadingEnabled: boolean;
} {
  const { googleMapsApiKey } = getConfig();
  return {
    provider: Platform.OS === "android" && googleMapsApiKey ? PROVIDER_GOOGLE : undefined,
    loadingEnabled: true,
  };
}
