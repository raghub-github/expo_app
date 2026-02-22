/**
 * Debounced user coordinates for location-dependent API calls.
 * Avoids multiple rapid refetches when location updates (e.g. map drag, GPS drift).
 * Use this in query keys so one stable location change = one refetch.
 */

import { useEffect, useState } from "react";

const DEFAULT_MS = 400;

export function useDebouncedCoords(
  coords: { latitude: number; longitude: number } | null,
  delayMs: number = DEFAULT_MS
): { latitude: number; longitude: number } | null {
  const [debounced, setDebounced] = useState<{ latitude: number; longitude: number } | null>(coords);

  useEffect(() => {
    if (coords == null) {
      setDebounced(null);
      return;
    }
    const id = setTimeout(() => {
      setDebounced(coords);
    }, delayMs);
    return () => clearTimeout(id);
  }, [coords?.latitude, coords?.longitude, delayMs]);

  return debounced;
}
