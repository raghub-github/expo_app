/**
 * Disables Mapbox GL JS telemetry (`events.mapbox.com/events/v2` POSTs).
 *
 * Why: browser ad-blockers and privacy extensions block that endpoint, and
 * every blocked request shows in devtools console as "ERR_BLOCKED_BY_CLIENT".
 * Telemetry is purely usage analytics — it doesn't affect map rendering,
 * geocoding, or any other feature. Disabling it removes the noise without
 * losing functionality.
 *
 * Call once, before `new mapboxgl.Map(...)`.
 *
 * Works across mapbox-gl-js v1-v3 by editing the well-known `config.EVENTS_URL`
 * field. If that field doesn't exist on the current version, the function
 * is a no-op — safe.
 */
export function disableMapboxTelemetry(): void {
  if (typeof window === "undefined") return;
  const mapboxgl = (window as unknown as { mapboxgl?: { config?: Record<string, string> } }).mapboxgl;
  if (!mapboxgl?.config) return;
  // Empty string / null disables telemetry across all mapbox-gl-js versions.
  mapboxgl.config.EVENTS_URL = "";
}
