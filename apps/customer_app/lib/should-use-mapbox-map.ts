import { getConfig } from "@/config/env";

/** Native Mapbox maps when a public token is configured. */
export function shouldUseMapboxMap(): boolean {
  return !!getConfig().mapboxAccessToken?.trim();
}
