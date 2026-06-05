import { getConfig } from "@/config/env";

/** Use Mapbox WebView maps when a public token is configured (replaces Google Maps tiles). */
export function shouldUseMapboxMap(): boolean {
  return !!getConfig().mapboxAccessToken?.trim();
}
