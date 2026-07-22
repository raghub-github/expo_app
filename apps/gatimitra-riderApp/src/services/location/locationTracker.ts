/**
 * Rider foreground tracker — thin re-export of the shared kit so existing imports keep working.
 */
export {
  createForegroundLocationTracker,
  type LocationTracker,
  type LocationTrackerState,
} from "@gatimitra/expo-location-kit";

export type { LocationFix as RiderLocationFix } from "@gatimitra/expo-location-kit";
