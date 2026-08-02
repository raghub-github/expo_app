/**
 * Debounced / movement-gated user coordinates for location-dependent API calls.
 * Avoids canceling in-flight merchant fetches when GPS drifts by a few meters.
 */

import { useEffect, useRef, useState } from "react";

const DEFAULT_MS = 250;
/** Ignore GPS jitter below this distance so listing queries stay stable. */
const DEFAULT_MIN_MOVE_M = 45;

function approxMetersApart(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = (a.latitude - b.latitude) * 111_320;
  const cosLat = Math.cos((a.latitude * Math.PI) / 180);
  const dLng = (a.longitude - b.longitude) * 111_320 * Math.max(0.2, cosLat);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function useDebouncedCoords(
  coords: { latitude: number; longitude: number } | null,
  delayMs: number = DEFAULT_MS,
  minMoveMeters: number = DEFAULT_MIN_MOVE_M
): { latitude: number; longitude: number } | null {
  const [debounced, setDebounced] = useState<{ latitude: number; longitude: number } | null>(
    coords
  );
  const lastCommittedRef = useRef<{ latitude: number; longitude: number } | null>(coords);

  useEffect(() => {
    if (coords == null) {
      lastCommittedRef.current = null;
      setDebounced(null);
      return;
    }

    // First fix must apply immediately so nearby stores fetch without waiting.
    if (lastCommittedRef.current == null) {
      lastCommittedRef.current = coords;
      setDebounced(coords);
      return;
    }

    if (approxMetersApart(lastCommittedRef.current, coords) < minMoveMeters) {
      return;
    }

    const id = setTimeout(() => {
      lastCommittedRef.current = coords;
      setDebounced(coords);
    }, delayMs);
    return () => clearTimeout(id);
  }, [coords?.latitude, coords?.longitude, delayMs, minMoveMeters]);

  return debounced;
}
