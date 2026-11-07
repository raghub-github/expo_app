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

/** Where a fast/first-fix coordinate came from — surfaced for debug + accuracy-aware selection. */
export type FastPositionSource = "last-known" | "balanced" | "low";

export type FastPosition = ValidatedCoords & {
  /** Which quick path produced this fix. */
  source: FastPositionSource;
  /** Fix timestamp (ms epoch); OS last-known carries its own, live fixes use now(). */
  timestampMs: number;
};

export type FastPositionOptions = {
  /** Accept an OS last-known fix no older than this (ms). Default 300000 (5 min). */
  lastKnownMaxAgeMs?: number;
  /** Timeout for each raced live fix when no last-known is available (ms). Default 2200. */
  quickTimeoutMs?: number;
  /** false: never raise the Android "improve accuracy" dialog. Default: the OS default. */
  mayShowUserSettingsDialog?: boolean;
  /** Optional debug logger. */
  log?: (event: string, data: Record<string, unknown>) => void;
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

/** A fix from acquireProgressivePosition; "gps" came from the High-accuracy watch. */
export type ProgressiveFix = Omit<FastPosition, "source"> & {
  source: FastPositionSource | "gps";
};

export type ProgressiveAcquisition = {
  /** Resolves with the first usable fix, or null if the session ended without one. */
  firstFix: Promise<ProgressiveFix | null>;
  /** Resolves with the best fix when the session ends. */
  done: Promise<ProgressiveFix | null>;
  /** End the session now and release the GPS. Idempotent. */
  stop: () => void;
  /** Best fix so far. */
  best: () => ProgressiveFix | null;
};

export type ProgressivePositionOptions = {
  /** Called for the first fix and each material improvement. */
  onFix?: (fix: ProgressiveFix) => void;
  goalAccuracyM?: number;
  settleAccuracyM?: number;
  settleMs?: number;
  budgetMs?: number;
  lastKnownMaxAgeMs?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
};
