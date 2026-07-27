/**
 * Rider foreground tracker — thin re-export of the shared kit so existing imports keep working.
 * All createForegroundLocationTracker() instances share one GPS watch via the kit engine.
 */
export {
  createForegroundLocationTracker,
  getSharedLocationEngine,
  LOCATION_ENGINE_PROFILES,
  type LocationTracker,
  type LocationTrackerState,
} from "@gatimitra/expo-location-kit";

export type { LocationFix as RiderLocationFix } from "@gatimitra/expo-location-kit";
