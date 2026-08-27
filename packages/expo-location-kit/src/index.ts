export type {
  ValidatedCoords,
  LocationPermissionStatus,
  DeviceLocationReadiness,
  LocationFix,
  BestEffortPositionOptions,
  FastPosition,
  FastPositionSource,
  FastPositionOptions,
} from "./types";

export {
  validateCoords,
  haversineKm,
  haversineMeters,
  LOCATION_SIGNIFICANT_MOVE_METERS,
  coordsMovedSignificantly,
  withTimeout,
} from "./coords";

export {
  getDeviceLocationReadiness,
  requestForegroundLocationPermission,
} from "./readiness";

export { getBestEffortPosition } from "./bestEffortPosition";

export { getFastPosition } from "./fastPosition";

export {
  createForegroundLocationTracker,
  type LocationTracker,
  type LocationTrackerState,
} from "./tracker";

export {
  getSharedLocationEngine,
  createSharedForegroundLocationTracker,
  LOCATION_ENGINE_PROFILES,
  type LocationEngineProfile,
} from "./sharedEngine";
