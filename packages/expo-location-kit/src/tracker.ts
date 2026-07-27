import * as Location from "expo-location";
import {
  createSharedForegroundLocationTracker,
  type LocationTracker,
  type LocationTrackerState,
} from "./sharedEngine";

export type { LocationTracker, LocationTrackerState };

/**
 * Parameterized location watcher — all instances share one device GPS stream
 * via the shared location engine (single watchPositionAsync).
 */
export function createForegroundLocationTracker(opts?: {
  timeIntervalMs?: number;
  distanceIntervalM?: number;
  minAccuracyM?: number;
  accuracy?: Location.LocationAccuracy;
  profileId?: string;
}): LocationTracker {
  return createSharedForegroundLocationTracker(opts);
}
