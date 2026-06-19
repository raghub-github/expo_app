import { useEffect, useMemo, useRef, useState } from "react";
import { buildRideRouteKey } from "@/lib/ride-route-snapshot";
import { fetchAndStoreRideRoute } from "@/services/rideRoute.service";
import { useRideRouteStore } from "@/store/rideRouteStore";
import type { LatLng } from "@/services/directions.service";

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

  const routeKey = useMemo(() => {
    if (!pickup || !drop) return null;
    return buildRideRouteKey({
      pickupLat: pickup.latitude,
      pickupLng: pickup.longitude,
      dropLat: drop.latitude,
      dropLng: drop.longitude,
      stops: stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    });
  }, [pickup, drop, stops]);

  const snapshot =
    routeKey && storeKey === routeKey && storeSnapshot ? storeSnapshot : null;

  useEffect(() => {
    if (!enabled || !pickup || !drop || !routeKey) {
      setLoading(false);
      return;
    }

    if (snapshot) {
      setLoading(false);
      return;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    void fetchAndStoreRideRoute({ pickup, drop, stops }).finally(() => {
      if (requestId === requestRef.current) setLoading(false);
    });
  }, [enabled, pickup, drop, routeKey, snapshot, stops]);

  const tripKm = snapshot?.routeDistanceKm ?? null;
  const routeEtaMins = snapshot?.routeEtaMinutes ?? null;
  const routeCoordinates = snapshot?.routePolyline ?? [];

  return {
    snapshot,
    tripKm,
    routeEtaMins,
    routeCoordinates,
    loading,
    routeKey,
  };
}
