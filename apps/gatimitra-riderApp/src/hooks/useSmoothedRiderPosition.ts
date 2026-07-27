import { useEffect, useRef, useState } from "react";
import {
  bearingDegrees,
  easeOutCubic,
  lerpAngle,
  lerpLatLng,
  resolveMarkerAnimTiming,
  trackDebug,
} from "@gatimitra/map-tracking-engine";

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
  const durationRef = useRef(durationMs);
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

    const timing = resolveMarkerAnimTiming(current.lat, current.lng, fix.lat, fix.lng, {
      minMs: Math.min(durationMs, 350),
      maxMs: Math.max(durationMs, 350),
      metersPerMs: 18,
      snapIfJumpM: 180,
    });

    if (timing.durationMs === 0) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const snapped = { lat: fix.lat, lng: fix.lng, headingDeg: heading };
      fromRef.current = snapped;
      toRef.current = snapped;
      setSmoothed(snapped);
      trackDebug("marker_animation_completed", { reason: "snap_teleport" });
      return;
    }

    fromRef.current = current;
    toRef.current = { lat: fix.lat, lng: fix.lng, headingDeg: heading };
    startMsRef.current = Date.now();
    durationRef.current = Math.min(timing.durationMs, durationMs);
    trackDebug("marker_animation_started", {
      durationMs: durationRef.current,
    });

    const tick = () => {
      const to = toRef.current;
      const from = fromRef.current;
      if (!to || !from) return;

      const elapsed = Date.now() - startMsRef.current;
      const t = Math.min(1, elapsed / durationRef.current);
      const ease = easeOutCubic(t);

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
      } else {
        rafRef.current = null;
        trackDebug("marker_animation_completed", {});
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
