// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { getMapboxModule } from "@/src/services/maps/mapbox";
import { NavArrivedAtStoreMarker } from "@/src/components/orders/NavArrivedAtStoreMarker";
import { NavigateRideRiderMarker } from "@/src/components/orders/NavigateRideRiderMarker";
import { NavStoreGreenPinMarker } from "@/src/components/orders/NavStoreGreenPinMarker";
import {
  resolveRoadRouteCoordinates,
  shouldHideNavigationRoute,
} from "@/src/lib/navigation-route-visibility";
import { NavigationRouteAltLabel } from "@/src/components/orders/NavigationRouteAltLabel";
import {
  buildNavigationFitPoints,
  boundsFromPoints,
  navigationEdgePadding,
} from "@/src/lib/navigation-camera-fit";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import {
  lineStringGeoJson,
  routeMidpoint,
} from "@/src/lib/navigation-alternative-routes";
import type {
  LatLng,
  NavigationAlternativeRoute,
} from "@/src/services/maps/directions.service";
import { buildPickupConnectorGeoJson } from "@/src/lib/navigation-pickup-connector";
import {
  buildRiderRouteConnectorGeoJson,
  type RouteConnectorFeature,
} from "@/src/lib/navigation-route-progress";
import {
  bearingDegrees,
  offsetPoint,
} from "@/src/lib/navigation-route-progress";
import {
  shouldThrottleNavigationCamera,
  normalizeBearing,
} from "@/src/lib/navigation-camera-follow";
import { buildManeuverArrowCollection } from "@/src/lib/navigation-route-arrows";
import {
  mapStyleForNavViewMode,
  type NavMapViewMode,
} from "@/src/lib/map-assets";
import {
  NAV_FOLLOW_PITCH,
  NAV_FOLLOW_ZOOM,
  NAV_LOOK_AHEAD_M,
  NAV_ALT_ROUTE_BLUE,
  NAV_ALT_ROUTE_WIDTH,
  NAV_OFF_ROUTE_CONNECTOR,
  NAV_ROUTE_BLUE,
  NAV_ROUTE_CASING,
  NAV_ROUTE_CASING_WIDTH,
  NAV_ROUTE_GLOW,
  NAV_ROUTE_GLOW_WIDTH,
  NAV_ROUTE_TRAVELED,
  NAV_ROUTE_WIDTH,
} from "@/src/lib/navigation-map-style";

const TRAVELED_WIDTH = 5;
const CONNECTOR_WIDTH = 2.5;
const CONNECTOR_OPACITY = 0.55;

const PICKUP_ANCHOR = { x: 0.5, y: 1 } as const;
const RIDER_ANCHOR = { x: 0.5, y: 0.5 } as const;

type RiderLocation = { lat: number; lng: number; headingDeg?: number };
type PickupLocation = { lat: number; lng: number; address?: string };

export type MapEdgeInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type ActiveRideNavigationMapHandle = {
  /** Resume tilted follow navigation (zoom in along route). */
  recenter: (followNavigation?: boolean) => void;
  /** Zoom out to show full leg: rider, traveled + remaining route, destination. */
  showRouteOverview: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  riderLocation: RiderLocation | undefined;
  pickup: PickupLocation;
  destinationLabel?: string;
  /** Food orders: restaurant pin with name label. */
  foodRestaurantName?: string;
  /** Optional storefront thumbnail for destination callout. */
  destinationImageUrl?: string | null;
  remainingCoordinates: LatLng[];
  /** Lighter alternate paths (Google Maps style). */
  alternativeRoutes?: NavigationAlternativeRoute[];
  /** Dashed front wheel → route join (Google Maps style). */
  offRouteConnectorGeoJson?: RouteConnectorFeature | null;
  routeDeviationWrongWay?: boolean;
  /** Where blue route starts on the road (gray join disc). */
  routeJoinPoint?: LatLng | null;
  traveledCoordinates?: LatLng[];
  /** Full road geometry for route-overview fit (pickup→drop leg). */
  fullRouteCoordinates?: LatLng[];
  previousPickup?: PickupLocation | null;
  mapEdgeInsets?: MapEdgeInsets;
  fitCameraTrigger?: number;
  /** Google Maps–style follow camera (pitch + bearing along route). */
  navigationFollowMode?: boolean;
  mapViewMode?: NavMapViewMode;
  onUserMapGesture?: () => void;
  /** Rider reached store / destination — hide route and show arrival markers. */
  arrivedAtDestination?: boolean;
  remainingDistanceM?: number | null;
  style?: object;
};

function navigationBearingDeg(
  rider: RiderLocation | undefined,
  remaining: LatLng[]
): number {
  if (rider?.headingDeg != null && Number.isFinite(rider.headingDeg)) {
    return rider.headingDeg;
  }
  if (remaining.length >= 2) {
    const a = remaining[0]!;
    const b = remaining[Math.min(3, remaining.length - 1)]!;
    return bearingDegrees(a, b);
  }
  return 0;
}

function defaultMapEdge(): MapEdgeInsets {
  return {
    top: 112,
    bottom: 96,
    left: 44,
    right: 60,
  };
}

export const ActiveRideNavigationMap = forwardRef<ActiveRideNavigationMapHandle, Props>(
  function ActiveRideNavigationMap(
    {
      riderLocation,
      pickup,
      remainingCoordinates,
      alternativeRoutes = [],
      offRouteConnectorGeoJson = null,
      routeDeviationWrongWay = false,
      routeJoinPoint = null,
      traveledCoordinates = [],
      fullRouteCoordinates = [],
      previousPickup,
      mapEdgeInsets,
      fitCameraTrigger = 0,
      navigationFollowMode = false,
      mapViewMode = "street",
      onUserMapGesture,
      destinationLabel = "Pickup",
      foodRestaurantName,
      destinationImageUrl,
      arrivedAtDestination = false,
      remainingDistanceM = null,
      style,
    },
    ref
  ) {
    const hideRouteLine = shouldHideNavigationRoute(arrivedAtDestination, remainingDistanceM);
    const cameraRef = useRef<{ setCamera: (opts: object) => void } | null>(null);
    const edge = navigationEdgePadding(mapEdgeInsets ?? defaultMapEdge());
    const [mapReady, setMapReady] = useState(false);
    const mapStyleUrl = mapStyleForNavViewMode(mapViewMode);
    const manualZoomRef = useRef(NAV_FOLLOW_ZOOM);
    const followEngagedRef = useRef(false);
    const lastFollowCameraRef = useRef<{
      lat: number;
      lng: number;
      bearing: number;
      atMs: number;
    } | null>(null);
    const Mapbox = useMemo(() => {
      try {
        return getMapboxModule();
      } catch {
        return null;
      }
    }, []);

    const showTraveled = traveledCoordinates.length >= 2;

    const pickupCoord = useMemo(
      () => ({ latitude: pickup.lat, longitude: pickup.lng }),
      [pickup.lat, pickup.lng]
    );

    const riderCoord = useMemo(
      () =>
        riderLocation
          ? { latitude: riderLocation.lat, longitude: riderLocation.lng }
          : undefined,
      [riderLocation?.lat, riderLocation?.lng]
    );

    const routeLineCoordinates = useMemo(
      () => resolveRoadRouteCoordinates(remainingCoordinates, fullRouteCoordinates),
      [remainingCoordinates, fullRouteCoordinates]
    );

    const showRemaining = !hideRouteLine && routeLineCoordinates.length >= 2;

    const altFitCoords = useMemo(
      () => alternativeRoutes.flatMap((a) => a.coordinates),
      [alternativeRoutes]
    );

    const fitPoints = useMemo(
      () =>
        buildNavigationFitPoints(
          pickupCoord,
          riderCoord,
          routeLineCoordinates.length >= 2 ? routeLineCoordinates : traveledCoordinates,
          altFitCoords
        ),
      [pickupCoord, riderCoord, routeLineCoordinates, traveledCoordinates, altFitCoords]
    );

    const overviewFitPoints = useMemo(() => {
      const routePts: LatLng[] = [];
      const seen = new Set<string>();
      const add = (pts: LatLng[]) => {
        for (const p of pts) {
          const key = `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          routePts.push(p);
        }
      };
      add(fullRouteCoordinates);
      add(traveledCoordinates);
      add(remainingCoordinates);
      const extras = [...altFitCoords];
      if (previousPickup) {
        extras.push({
          latitude: previousPickup.lat,
          longitude: previousPickup.lng,
        });
      }
      return buildNavigationFitPoints(pickupCoord, riderCoord, routePts, extras);
    }, [
      pickupCoord,
      riderCoord,
      fullRouteCoordinates,
      traveledCoordinates,
      remainingCoordinates,
      altFitCoords,
      previousPickup?.lat,
      previousPickup?.lng,
    ]);

    const altRouteLayers = useMemo(
      () =>
        alternativeRoutes.map((alt, index) => ({
          id: `nav-alt-route-${index}`,
          geoJson: lineStringGeoJson(alt.coordinates),
          label: alt.label,
          midpoint: routeMidpoint(alt.coordinates),
        })),
      [alternativeRoutes]
    );

    const followNavigationCamera = useCallback(
      (opts?: { force?: boolean; animate?: boolean }) => {
        if (!mapReady || !cameraRef.current || !riderCoord || routeLineCoordinates.length < 2) {
          return;
        }

        const bearing = normalizeBearing(
          navigationBearingDeg(riderLocation, routeLineCoordinates)
        );
        const anchor = riderCoord ?? routeLineCoordinates[0]!;
        const center = offsetPoint(anchor, bearing, NAV_LOOK_AHEAD_M);

        if (
          !opts?.force &&
          shouldThrottleNavigationCamera(lastFollowCameraRef.current, center, bearing)
        ) {
          return;
        }

        const animate = opts?.animate ?? !followEngagedRef.current;
        lastFollowCameraRef.current = {
          lat: center.latitude,
          lng: center.longitude,
          bearing,
          atMs: Date.now(),
        };
        followEngagedRef.current = true;

        try {
          cameraRef.current.setCamera({
            centerCoordinate: [center.longitude, center.latitude],
            zoomLevel: NAV_FOLLOW_ZOOM,
            pitch: NAV_FOLLOW_PITCH,
            heading: bearing,
            padding: {
              paddingTop: edge.top,
              paddingBottom: edge.bottom,
              paddingLeft: edge.left,
              paddingRight: edge.right,
            },
            animationDuration: animate ? 320 : 0,
            animationMode: animate ? "easeTo" : "none",
          });
        } catch {
          // ignore
        }
      },
      [mapReady, riderCoord, riderLocation, routeLineCoordinates, edge]
    );

    const applyBoundsCamera = useCallback(
      (
        points: LatLng[],
        opts?: { pitch?: number; heading?: number; maxZoom?: number }
      ) => {
        if (!mapReady || !cameraRef.current || points.length === 0) return;

        const padding = {
          paddingTop: edge.top,
          paddingBottom: edge.bottom,
          paddingLeft: edge.left,
          paddingRight: edge.right,
        };
        const pitch = opts?.pitch ?? 0;
        const heading = opts?.heading ?? 0;

        if (points.length === 1) {
          const p = points[0]!;
          try {
            cameraRef.current.setCamera({
              centerCoordinate: [p.longitude, p.latitude],
              zoomLevel: opts?.maxZoom ?? 15,
              pitch,
              heading,
              padding,
              animationDuration: 650,
              animationMode: "easeTo",
            });
          } catch {
            // ignore
          }
          return;
        }

        const { sw, ne } = boundsFromPoints(points);
        try {
          cameraRef.current.setCamera({
            bounds: { sw, ne },
            padding,
            pitch,
            heading,
            maxZoomLevel: opts?.maxZoom ?? 16,
            animationDuration: 650,
            animationMode: "easeTo",
          });
        } catch {
          // ignore
        }
      },
      [mapReady, edge]
    );

    const fitCamera = useCallback(() => {
      applyBoundsCamera(fitPoints);
    }, [applyBoundsCamera, fitPoints]);

    const showRouteOverviewCamera = useCallback(() => {
      followEngagedRef.current = false;
      lastFollowCameraRef.current = null;
      applyBoundsCamera(overviewFitPoints, { pitch: 0, heading: 0, maxZoom: 15.5 });
    }, [applyBoundsCamera, overviewFitPoints]);

    useImperativeHandle(
      ref,
      () => ({
        recenter: (followNavigation = true) => {
          if (followNavigation && riderCoord && showRemaining) {
            manualZoomRef.current = NAV_FOLLOW_ZOOM;
            followNavigationCamera({ force: true, animate: true });
          } else {
            followEngagedRef.current = false;
            lastFollowCameraRef.current = null;
            fitCamera();
          }
        },
        showRouteOverview: () => {
          showRouteOverviewCamera();
        },
        zoomIn: () => {
          followEngagedRef.current = false;
          lastFollowCameraRef.current = null;
          manualZoomRef.current = Math.min(21, manualZoomRef.current + 1);
          if (!cameraRef.current) return;
          try {
            cameraRef.current.setCamera({
              zoomLevel: manualZoomRef.current,
              animationDuration: 220,
              animationMode: "easeTo",
            });
          } catch {
            // ignore
          }
        },
        zoomOut: () => {
          followEngagedRef.current = false;
          lastFollowCameraRef.current = null;
          manualZoomRef.current = Math.max(8, manualZoomRef.current - 1);
          if (!cameraRef.current) return;
          try {
            cameraRef.current.setCamera({
              zoomLevel: manualZoomRef.current,
              pitch: mapViewMode === "navigation" ? 0 : 0,
              animationDuration: 220,
              animationMode: "easeTo",
            });
          } catch {
            // ignore
          }
        },
      }),
      [fitCamera, showRouteOverviewCamera, followNavigationCamera, riderCoord, showRemaining]
    );

    useEffect(() => {
      if (!mapReady || navigationFollowMode) return;
      followEngagedRef.current = false;
      lastFollowCameraRef.current = null;
      const t = setTimeout(fitCamera, 200);
      return () => clearTimeout(t);
    }, [mapReady, fitCameraTrigger, fitCamera, navigationFollowMode]);

    useEffect(() => {
      if (!mapReady || !hideRouteLine || !cameraRef.current) return;
      try {
        cameraRef.current.setCamera({
          centerCoordinate: [pickup.lng, pickup.lat],
          zoomLevel: 17,
          pitch: 48,
          heading: 0,
          padding: {
            paddingTop: edge.top,
            paddingBottom: edge.bottom,
            paddingLeft: edge.left,
            paddingRight: edge.right,
          },
          animationDuration: 450,
          animationMode: "easeTo",
        });
      } catch {
        // ignore
      }
    }, [mapReady, hideRouteLine, pickup.lng, pickup.lat, edge]);

    const riderFollowKey = riderCoord
      ? `${riderCoord.latitude.toFixed(6)},${riderCoord.longitude.toFixed(6)},${Math.round(riderLocation?.headingDeg ?? 0)}`
      : "";

    useEffect(() => {
      if (!mapReady || !navigationFollowMode || !riderCoord || !showRemaining) return;
      followNavigationCamera();
    }, [mapReady, navigationFollowMode, showRemaining, riderFollowKey, followNavigationCamera, riderCoord]);

    const maneuverArrowsGeoJson = useMemo(
      () => buildManeuverArrowCollection(routeLineCoordinates),
      [routeLineCoordinates]
    );

    const remainingGeoJson = useMemo(
      () => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: routeLineCoordinates.map((c) => [c.longitude, c.latitude]),
        },
        properties: {},
      }),
      [routeLineCoordinates]
    );

    const traveledGeoJson = useMemo(
      () => ({
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: traveledCoordinates.map((c) => [c.longitude, c.latitude]),
        },
        properties: {},
      }),
      [traveledCoordinates]
    );

    const pickupConnectorGeoJson = useMemo(
      () => buildPickupConnectorGeoJson(routeLineCoordinates, pickup),
      [routeLineCoordinates, pickup.lat, pickup.lng]
    );

    const routeJoinGeoJson = useMemo(() => {
      if (!routeJoinPoint) return null;
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [routeJoinPoint.longitude, routeJoinPoint.latitude],
        },
        properties: {},
      };
    }, [routeJoinPoint?.latitude, routeJoinPoint?.longitude]);

    const effectiveConnectorGeoJson = useMemo(() => {
      if (offRouteConnectorGeoJson?.geometry?.coordinates?.length >= 2) {
        return offRouteConnectorGeoJson;
      }
      if (!riderLocation || !routeJoinPoint) return null;
      return buildRiderRouteConnectorGeoJson(
        { latitude: riderLocation.lat, longitude: riderLocation.lng },
        routeJoinPoint
      );
    }, [
      offRouteConnectorGeoJson,
      riderLocation?.lat,
      riderLocation?.lng,
      routeJoinPoint?.latitude,
      routeJoinPoint?.longitude,
    ]);

    const offRouteConnectorKey = effectiveConnectorGeoJson
      ? effectiveConnectorGeoJson.geometry.coordinates
          .map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
          .join(";")
      : "";

    if (!resolveMapboxPublicToken()) {
      return <View style={[styles.container, styles.mapPlaceholder, style]} />;
    }

    if (!Mapbox) {
      return <View style={[styles.container, styles.mapPlaceholder, style]} />;
    }

    const RiderMarker = Mapbox.MarkerView ?? null;

    const renderMarker = (
      id: string,
      coordinate: [number, number],
      anchor: { x: number; y: number },
      children: React.ReactNode
    ) => {
      if (RiderMarker) {
        return (
          <RiderMarker id={id} coordinate={coordinate} anchor={anchor} allowOverlap>
            {children}
          </RiderMarker>
        );
      }
      return (
        <Mapbox.PointAnnotation id={id} coordinate={coordinate} anchor={anchor}>
          {children}
        </Mapbox.PointAnnotation>
      );
    };

    return (
      <View style={[styles.container, style]}>
        <Mapbox.MapView
          style={styles.map}
          styleURL={mapStyleUrl}
          key={mapStyleUrl}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled
          compassViewPosition={3}
          scaleBarEnabled={false}
          scrollEnabled
          zoomEnabled
          pitchEnabled
          rotateEnabled
          onDidFinishLoadingMap={() => setMapReady(true)}
          onRegionIsChanging={(feature: { properties?: { isUserInteraction?: boolean } }) => {
            if (feature?.properties?.isUserInteraction) {
              onUserMapGesture?.();
            }
          }}
        >
          <Mapbox.Camera ref={cameraRef} animationMode="none" animationDuration={0} />

          {!hideRouteLine &&
            altRouteLayers.map((alt) => (
            <Mapbox.ShapeSource key={alt.id} id={alt.id} shape={alt.geoJson}>
              <Mapbox.LineLayer
                id={`${alt.id}-line`}
                style={{
                  lineColor: NAV_ALT_ROUTE_BLUE,
                  lineWidth: NAV_ALT_ROUTE_WIDTH,
                  lineOpacity: 0.88,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ))}

          {showTraveled ? (
            <Mapbox.ShapeSource id="nav-route-traveled" shape={traveledGeoJson}>
              <Mapbox.LineLayer
                id="nav-route-traveled-line"
                style={{
                  lineColor: NAV_ROUTE_TRAVELED,
                  lineWidth: TRAVELED_WIDTH,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {showRemaining ? (
            <Mapbox.ShapeSource id="nav-route-remaining" shape={remainingGeoJson}>
              <Mapbox.LineLayer
                id="nav-route-glow"
                style={{
                  lineColor: NAV_ROUTE_GLOW,
                  lineWidth: NAV_ROUTE_GLOW_WIDTH,
                  lineOpacity: 0.65,
                  lineCap: "round",
                  lineJoin: "round",
                  lineBlur: 2,
                }}
              />
              <Mapbox.LineLayer
                id="nav-route-casing"
                style={{
                  lineColor: NAV_ROUTE_CASING,
                  lineWidth: NAV_ROUTE_CASING_WIDTH,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Mapbox.LineLayer
                id="nav-route-line"
                style={{
                  lineColor: NAV_ROUTE_BLUE,
                  lineWidth: NAV_ROUTE_WIDTH,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {showRemaining && maneuverArrowsGeoJson.features.length > 0 ? (
            <Mapbox.ShapeSource id="nav-maneuver-arrows" shape={maneuverArrowsGeoJson}>
              <Mapbox.SymbolLayer
                id="nav-maneuver-arrows-layer"
                style={{
                  textField: "▶",
                  textSize: 20,
                  textColor: "#ffffff",
                  textHaloColor: "#0f172a",
                  textHaloWidth: 2,
                  textRotate: ["get", "bearing"],
                  textKeepUpright: false,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {routeJoinGeoJson && showRemaining ? (
            <Mapbox.ShapeSource id="nav-route-join" shape={routeJoinGeoJson}>
              <Mapbox.CircleLayer
                id="nav-route-join-dot"
                style={{
                  circleRadius: 7,
                  circleColor: "#94a3b8",
                  circleOpacity: 0.72,
                  circleStrokeWidth: 2.5,
                  circleStrokeColor: "#ffffff",
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {effectiveConnectorGeoJson && showRemaining ? (
            <Mapbox.ShapeSource
              id="nav-rider-route-connector"
              shape={effectiveConnectorGeoJson}
              key={offRouteConnectorKey}
            >
              <Mapbox.LineLayer
                id="nav-rider-route-connector-casing"
                style={{
                  lineColor: "#ffffff",
                  lineWidth: routeDeviationWrongWay ? 8 : 7,
                  lineOpacity: 0.92,
                  lineCap: "round",
                  lineJoin: "round",
                  lineDasharray: [2, 2],
                }}
              />
              <Mapbox.LineLayer
                id="nav-rider-route-connector-line"
                style={{
                  lineColor: routeDeviationWrongWay ? "#EA580C" : NAV_OFF_ROUTE_CONNECTOR,
                  lineWidth: routeDeviationWrongWay ? 5.5 : 5,
                  lineOpacity: 1,
                  lineCap: "round",
                  lineJoin: "round",
                  lineDasharray: [2, 2],
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {pickupConnectorGeoJson && showRemaining ? (
            <Mapbox.ShapeSource id="nav-pickup-connector" shape={pickupConnectorGeoJson}>
              <Mapbox.LineLayer
                id="nav-pickup-connector-line"
                style={{
                  lineColor: NAV_ROUTE_BLUE,
                  lineWidth: CONNECTOR_WIDTH,
                  lineOpacity: CONNECTOR_OPACITY,
                  lineCap: "round",
                  lineJoin: "round",
                  lineDasharray: [1.5, 1.5],
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {previousPickup
            ? renderMarker(
                "nav-prev-pickup",
                [previousPickup.lng, previousPickup.lat],
                PICKUP_ANCHOR,
                <View style={styles.ghostRing} />
              )
            : null}

          {hideRouteLine && riderLocation ? (
            renderMarker(
              "nav-arrived-store",
              [pickup.lng, pickup.lat],
              PICKUP_ANCHOR,
              <NavArrivedAtStoreMarker headingDeg={riderLocation.headingDeg} />
            )
          ) : (
            renderMarker(
              "nav-destination-pin",
              [pickup.lng, pickup.lat],
              PICKUP_ANCHOR,
              <NavStoreGreenPinMarker />
            )
          )}

          {!hideRouteLine &&
            altRouteLayers.map(
              (alt) =>
                alt.midpoint
                  ? renderMarker(
                      `${alt.id}-label`,
                      [alt.midpoint.longitude, alt.midpoint.latitude],
                      { x: 0.5, y: 0.5 },
                      <NavigationRouteAltLabel label={alt.label} />
                    )
                  : null
            )}

          {riderLocation && !hideRouteLine
            ? renderMarker(
                "nav-rider-bike",
                [riderLocation.lng, riderLocation.lat],
                RIDER_ANCHOR,
                <NavigateRideRiderMarker headingDeg={riderLocation.headingDeg} />
              )
            : null}
        </Mapbox.MapView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    zIndex: 1,
    elevation: 0,
  },
  mapPlaceholder: {
    backgroundColor: "#E8F4F1",
  },
  map: {
    flex: 1,
    overflow: "hidden",
  },
  ghostRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#2dd4bf",
    borderStyle: "dashed",
    backgroundColor: "rgba(20, 184, 166, 0.12)",
  },
});
