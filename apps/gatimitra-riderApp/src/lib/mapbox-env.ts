import Constants from "expo-constants";
import { resolveMapboxPublicTokenFromEnv } from "@gatimitra/map-tracking-engine";

/** Resolve Mapbox public token from all supported env aliases (Expo + Next + plain). */
export function resolveMapboxPublicToken(): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return resolveMapboxPublicTokenFromEnv(
    {
      EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN,
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN,
      MAPBOX_PUBLIC_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
      NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    },
    extra
  );
}
