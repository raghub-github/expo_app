/**
 * Client-side GPS sanitization for live rider markers.
 * Re-exports the shared tracking engine so all apps stay in sync.
 */
export {
  type RiderGpsSample,
  type RiderGpsFilterConfig,
  type GpsFilterDecision,
  DEFAULT_RIDER_GPS_FILTER,
  clearRiderGpsFilterState,
  filterRiderGpsSample,
} from "@gatimitra/map-tracking-engine";
