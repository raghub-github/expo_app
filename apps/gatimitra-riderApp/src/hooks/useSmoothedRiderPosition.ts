import { useEffect, useRef, useState } from "react";
import { bearingDegrees, lerpAngle, lerpLatLng } from "@/src/lib/navigation-route-progress";
import type { LatLng } from "@/src/services/maps/directions.service";

export type RiderGpsFix = {
  lat: number;
  lng: number;
  headingDeg?: number;
  speedMps?: number;
};

export type SmoothedRider = {
  lat: number;
  lng: number;
  headingDeg: number;
};

const DEFAULT_DURATION_MS = 850;

export function useSmoothedRiderPosition(
  fix: RiderGpsFix | undefined,
  durationMs = DEFAULT_DURATION_MS
): SmoothedRider | undefined {
  const [smoothed, setSmoothed] = useState<SmoothedRider | undefined>(() =>
    fix
      ? {
          lat: fix.lat,
          lng: fix.lng,
          headingDeg: fix.headingDeg ?? 0,
        }
      : undefined
  );

  const fromRef = useRef<SmoothedRider | null>(
    fix ? { lat: fix.lat, lng: fix.lng, headingDeg: fix.headingDeg ?? 0 } : null
  );
  const toRef = useRef<SmoothedRider | null>(fromRef.current);
  const startMsRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!fix) {
      setSmoothed(undefined);
      fromRef.current = null;
      toRef.current = null;
      return;
    }

    const current = fromRef.current ?? {
      lat: fix.lat,
      lng: fix.lng,
      headingDeg: fix.headingDeg ?? 0,
    };

    let heading = fix.headingDeg;
    if (heading == null || !Number.isFinite(heading) || heading < 0) {
      heading = bearingDegrees(
        { latitude: current.lat, longitude: current.lng },
        { latitude: fix.lat, longitude: fix.lng }
      );
    }

    fromRef.current = current;
    toRef.current = { lat: fix.lat, lng: fix.lng, headingDeg: heading };
    startMsRef.current = Date.now();

    const tick = () => {
      const to = toRef.current;
      const from = fromRef.current;
      if (!to || !from) return;

      const elapsed = Date.now() - startMsRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const ease = 1 - (1 - t) ** 3;

      const pos = lerpLatLng(
        { latitude: from.lat, longitude: from.lng },
        { latitude: to.lat, longitude: to.lng },
        ease
      );

      const next: SmoothedRider = {
        lat: pos.latitude,
        lng: pos.longitude,
        headingDeg: lerpAngle(from.headingDeg, to.headingDeg, ease),
      };

      setSmoothed(next);
      fromRef.current = next;

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [fix?.lat, fix?.lng, fix?.headingDeg, durationMs]);

  return smoothed;
}
