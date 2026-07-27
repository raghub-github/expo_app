import { useMemo } from "react";
import type { FoodDeliveryMapPhase } from "@/lib/food-delivery-map-phase";
import { buildPickupDropPreviewArc, type MapLatLng } from "@/lib/map-route-utils";
import {
  buildRiderRouteConnector,
  splitRouteProgress,
} from "@/lib/navigation-route-progress";
import {
  resolveRoadRouteCoordinates,
  shouldHideNavigationRoute,
} from "@/lib/navigation-route-visibility";
import { resolveDisplayRiderPosition } from "@gatimitra/map-tracking-engine";
import { useFoodDeliveryLiveRoute } from "@/hooks/useFoodDeliveryLiveRoute";

export function useFoodDeliveryRouteProgress(args: {
  phase: FoodDeliveryMapPhase;
  rider: MapLatLng | null;
  pickup: MapLatLng;
  drop: MapLatLng;
  orderId: string;
  riderArrived: boolean;
  riderHeading?: number | null;
  /** False until a delivery partner is assigned to the order. */
  hasRider?: boolean;
}) {
  const { phase, rider, pickup, drop, orderId, riderArrived, riderHeading, hasRider = true } = args;

  const preRiderArcRoute = useMemo(
    () => (!hasRider ? buildPickupDropPreviewArc(pickup, drop) : null),
    [hasRider, pickup, drop]
  );

  const { coordinates: fullRoute, distanceM, isRefreshing } = useFoodDeliveryLiveRoute({
    phase,
    rider,
    pickup,
    drop,
    orderId,
    enabled: hasRider,
    riderHeading,
  });

  const progress = useMemo(() => {
    if (!hasRider) {
      return {
        remaining: [] as MapLatLng[],
        connector: null as MapLatLng[] | null,
        routeJoinPoint: null as MapLatLng | null,
        remainingDistanceM: null as number | null,
      };
    }

    if (!fullRoute.length || !rider) {
      return {
        remaining: fullRoute,
        connector: null as MapLatLng[] | null,
        routeJoinPoint: null as MapLatLng | null,
        remainingDistanceM: distanceM,
      };
    }

    const split = splitRouteProgress(fullRoute, {
      ...rider,
      headingDeg: riderHeading ?? null,
    });

    const connector = buildRiderRouteConnector(rider, split.routeJoinPoint);

    return {
      remaining: split.remaining,
      connector,
      routeJoinPoint: split.routeJoinPoint,
      remainingDistanceM: split.remainingDistanceM,
    };
  }, [hasRider, fullRoute, rider, riderHeading, distanceM]);

  const remainingRoute = useMemo(
    () => (hasRider ? resolveRoadRouteCoordinates(progress.remaining, fullRoute) : []),
    [hasRider, progress.remaining, fullRoute]
  );

  const hideRouteLine = hasRider
    ? shouldHideNavigationRoute(riderArrived, progress.remainingDistanceM)
    : false;

  const displayRider = useMemo(() => {
    if (!hasRider || !rider || !fullRoute.length) return rider;
    return resolveDisplayRiderPosition(fullRoute, {
      ...rider,
      headingDeg: riderHeading ?? null,
    });
  }, [hasRider, rider, fullRoute, riderHeading]);

  return {
    fullRoute,
    remainingRoute,
    preRiderArcRoute,
    connectorRoute: progress.connector,
    routeJoinPoint: progress.routeJoinPoint,
    remainingDistanceM: progress.remainingDistanceM,
    hideRouteLine,
    isRefreshing,
    displayRider,
  };
}
