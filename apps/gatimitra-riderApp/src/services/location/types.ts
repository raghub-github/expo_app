export type RiderLocationFix = {
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


