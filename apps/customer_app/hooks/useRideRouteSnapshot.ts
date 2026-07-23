import { useEffect, useMemo, useRef, useState } from "react";
import { buildRideRouteKey } from "@/lib/ride-route-snapshot";
import { fetchAndStoreRideRoute } from "@/services/rideRoute.service";
import { useRideRouteStore } from "@/store/rideRouteStore";
import type { LatLng } from "@/services/directions.service";

const EMPTY_POLYLINE: LatLng[] = [];

type Args = {
  pickup: LatLng | null;
  drop: LatLng | null;
  stops?: LatLng[];
  /** When false, reads cache only — no network fetch (avoids duplicate calls from background screens). */
  enabled?: boolean;
};

/**
 * Single source of truth for ride distance/ETA/polyline.
 * Recalculates only when pickup, drop, or stops change — never on vehicle selection.
 */
export function useRideRouteSnapshot({ pickup, drop, stops = [], enabled = true }: Args) {
  const storeKey = useRideRouteStore((s) => s.routeKey);
  const storeSnapshot = useRideRouteStore((s) => s.snapshot);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);

  const pickupLat = pickup?.latitude ?? null;
  const pickupLng = pickup?.longitude ?? null;
  const dropLat = drop?.latitude ?? null;
  const dropLng = drop?.longitude ?? null;
  const stopsKey = useMemo(
    () =>
      stops
        .map((s) => `${s.latitude.toFixed(6)},${s.longitude.toFixed(6)}`)
        .join("|"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialized stop coords
    [stops.map((s) => `${s.latitude},${s.longitude}`).join("|")]
  );

  const routeKey = useMemo(() => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) {
      return null;
    }
    return buildRideRouteKey({
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      stops,
    });
  }, [pickupLat, pickupLng, dropLat, dropLng, stopsKey, stops]);

  const snapshot =
    routeKey && storeKey === routeKey && storeSnapshot ? storeSnapshot : null;

  useEffect(() => {
    if (
      !enabled ||
      pickupLat == null ||
      pickupLng == null ||
      dropLat == null ||
      dropLng == null ||
      !routeKey
    ) {
      setLoading(false);
      return;
    }

    if (snapshot) {
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    void fetchAndStoreRideRoute(
      {
        pickup: { latitude: pickupLat, longitude: pickupLng },
        drop: { latitude: dropLat, longitude: dropLng },
        stops,
      },
      {
        isStale: () => requestId !== requestRef.current,
      }
    )
      .catch(() => null)
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
  }, [enabled, pickupLat, pickupLng, dropLat, dropLng, routeKey, snapshot, stopsKey, stops]);

  const tripKm = snapshot?.routeDistanceKm ?? null;
  const routeEtaMins = snapshot?.routeEtaMinutes ?? null;
  const routeCoordinates = snapshot?.routePolyline ?? EMPTY_POLYLINE;
  const routeLoading = enabled && routeKey != null && snapshot == null && loading;

  return {
    snapshot,
    tripKm,
    routeEtaMins,
    routeCoordinates,
    loading: routeLoading,
    routeKey,
  };
}
