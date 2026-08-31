import { useEffect, useRef, useState } from "react";
import {
  bearingDegrees,
  easeOutCubic,
  haversineMeters,
  lerpAngle,
  lerpLatLng,
} from "./geo";
import {
  resolveMarkerAnimTiming,
  shouldFreezeSmoothedMarker,
  shouldIgnoreMarkerGpsNoise,
} from "./marker-animation";
import { trackDebug } from "./debug";

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

    const moveM = haversineMeters(current.lat, current.lng, fix.lat, fix.lng);
    const speed = fix.speedMps ?? 0;

    const ensureInitial = () => {
      if (!fromRef.current) {
        const initial = {
          lat: fix.lat,
          lng: fix.lng,
          headingDeg: fix.headingDeg ?? 0,
        };
        fromRef.current = initial;
        toRef.current = initial;
        setSmoothed(initial);
      }
    };

    if (shouldIgnoreMarkerGpsNoise(moveM)) {
      ensureInitial();
      return;
    }

    if (shouldFreezeSmoothedMarker(moveM, speed)) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ensureInitial();
      return;
    }

    let heading = fix.headingDeg;
    if (
      moveM > 1.5 &&
      (heading == null || !Number.isFinite(heading) || heading < 0)
    ) {
      heading = bearingDegrees(
        { latitude: current.lat, longitude: current.lng },
        { latitude: fix.lat, longitude: fix.lng }
      );
    } else if (heading == null || !Number.isFinite(heading) || heading < 0) {
      heading = current.headingDeg;
    }

    const speedScale = speed > 0.5 ? Math.max(0.55, Math.min(1.2, 8 / Math.max(speed, 0.5))) : 1;
    const timing = resolveMarkerAnimTiming(current.lat, current.lng, fix.lat, fix.lng, {
      minMs: Math.round(Math.min(durationMs, 380) * speedScale),
      maxMs: Math.round(Math.max(durationMs, 720) * speedScale),
      metersPerMs: 22,
      snapIfJumpM: 120,
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
  }, [fix?.lat, fix?.lng, fix?.headingDeg, fix?.speedMps, durationMs]);

  return smoothed;
}
