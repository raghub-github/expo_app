export type ValidatedCoords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type LocationPermissionStatus = "undetermined" | "granted" | "denied";

export type DeviceLocationReadiness = {
  permissionStatus: LocationPermissionStatus;
  servicesEnabled: boolean;
  isReady: boolean;
};

export type LocationFix = {
  tsMs: number;
  lat: number;
  lng: number;
  accuracyM?: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  mocked?: boolean;
  provider?: "gps" | "network" | "fused" | "unknown";
};

export type BestEffortPositionOptions = {
  /** Per-attempt timeout for getCurrentPositionAsync (ms). Default 14000. */
  attemptTimeoutMs?: number;
  /** Max wall-clock budget while polling Highest accuracy (ms). Default 9000. */
  stableWaitMs?: number;
  /** Stop early once accuracy is at/under this meters. Default 20. */
  acceptableAccuracyM?: number;
  /** Max Highest-accuracy attempts within the stable wait budget. Default 4. */
  maxAttempts?: number;
  /** Gap between Highest polls (ms). Default 800. */
  repollGapMs?: number;
  /** Max age for OS last-known fallback (ms). Default 60000. */
  lastKnownMaxAgeMs?: number;
  /** Optional debug logger. */
  log?: (event: string, data: Record<string, unknown>) => void;
};
