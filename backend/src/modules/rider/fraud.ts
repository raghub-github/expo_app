export type FraudSignal =
  | "MOCK_LOCATION"
  | "GPS_DISABLED"
  | "LOW_ACCURACY"
  | "TELEPORT"
  | "UNREALISTIC_SPEED"
  | "HEADING_MISMATCH"
  | "DEVICE_ID_MISMATCH";

export type LocationPoint = {
  tsMs: number;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  mocked?: boolean | null;
};

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000; // meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function angularDiffDeg(a: number, b: number): number {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

export function scoreLocationPing(args: {
  prev?: LocationPoint | null;
  curr: LocationPoint;
  tokenDeviceId?: string | null;
  bodyDeviceId?: string | null;
  gpsEnabled?: boolean | null;
}): { fraudSignals: FraudSignal[]; fraudScore: number; meta: Record<string, unknown> } {
  const fraudSignals: FraudSignal[] = [];
  let score = 0;
  const meta: Record<string, unknown> = {};

  if (args.gpsEnabled === false) {
    fraudSignals.push("GPS_DISABLED");
    score += 30;
  }

  if (args.curr.mocked) {
    fraudSignals.push("MOCK_LOCATION");
    score += 80;
  }

  const acc = args.curr.accuracyM ?? null;
  if (acc != null && acc > 60) {
    fraudSignals.push("LOW_ACCURACY");
    score += 15;
    meta.accuracyM = acc;
  }

  if (args.tokenDeviceId && args.bodyDeviceId && args.tokenDeviceId !== args.bodyDeviceId) {
    fraudSignals.push("DEVICE_ID_MISMATCH");
    score += 40;
  }

  const prev = args.prev ?? null;
  if (prev) {
    const dtSec = Math.max(0.001, (args.curr.tsMs - prev.tsMs) / 1000);
    const distM = haversineMeters(prev, args.curr);
    const derivedSpeed = distM / dtSec;

    meta.dtSec = dtSec;
    meta.distM = distM;
    meta.derivedSpeedMps = derivedSpeed;

    // Teleport: too far in too little time, even for a vehicle.
    if (distM > 250 && dtSec < 5) {
      fraudSignals.push("TELEPORT");
      score += 70;
    }

    // Unrealistic speed for rider app context.
    if (derivedSpeed > 45) {
      // >162 km/h
      fraudSignals.push("UNREALISTIC_SPEED");
      score += 50;
    }

    // Heading mismatch: when moving, heading should roughly align with travel bearing.
    const heading = args.curr.headingDeg ?? null;
    if (heading != null && derivedSpeed > 2) {
      const brng = bearingDeg(prev, args.curr);
      const diff = angularDiffDeg(heading, brng);
      meta.bearingDeg = brng;
      meta.headingDiffDeg = diff;

      if (diff > 75) {
        fraudSignals.push("HEADING_MISMATCH");
        score += 10;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { fraudSignals, fraudScore: score, meta };
}


