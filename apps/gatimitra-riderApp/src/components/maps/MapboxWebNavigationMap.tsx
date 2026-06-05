import React, { useCallback, useImperativeHandle, useMemo, useRef, forwardRef, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import {
  MAPBIKE_IMAGE,
  MAPBOX_NAV_WEB_STYLE,
  NAV_MAP_ZOOM,
  mapStyleForNavViewMode,
  type NavMapViewMode,
} from "@/src/lib/map-assets";
import type { ManeuverArrowCollection } from "@/src/lib/navigation-route-arrows";
import { resolveMapImageDataUri } from "@/src/lib/map-webview-image-uri";
import { buildNavigationMapHtml } from "@/src/components/maps/mapbox-web-html";
import { routeMidpoint } from "@/src/lib/navigation-alternative-routes";
import type {
  LatLng,
  NavigationAlternativeRoute,
} from "@/src/services/maps/directions.service";
import {
  buildRiderRouteConnectorGeoJson,
  type RouteConnectorFeature,
} from "@/src/lib/navigation-route-progress";

type Props = {
  rider: { lat: number; lng: number; headingDeg?: number };
  pickup: { lat: number; lng: number };
  remainingCoordinates: LatLng[];
  fullRouteCoordinates?: LatLng[];
  previousPickup?: { lat: number; lng: number } | null;
  alternativeRoutes?: NavigationAlternativeRoute[];
  offRouteConnectorGeoJson?: RouteConnectorFeature | null;
  routeJoinPoint?: LatLng | null;
  routeDeviationWrongWay?: boolean;
  navigationFollowMode?: boolean;
  mapViewMode?: NavMapViewMode;
  maneuverArrowsGeoJson?: ManeuverArrowCollection;
  destinationLabel?: string;
  onUserMapGesture?: () => void;
  style?: object;
};

export type MapboxWebNavigationMapHandle = {
  recenter: (followNavigation?: boolean) => void;
  showRouteOverview: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export const MapboxWebNavigationMap = forwardRef<MapboxWebNavigationMapHandle, Props>(
  function MapboxWebNavigationMap(
    {
      rider,
      pickup,
      remainingCoordinates,
      fullRouteCoordinates = [],
      previousPickup = null,
      alternativeRoutes = [],
      offRouteConnectorGeoJson = null,
      routeJoinPoint = null,
      routeDeviationWrongWay = false,
      navigationFollowMode = false,
      mapViewMode = "navigation",
      maneuverArrowsGeoJson,
      destinationLabel = "Pickup",
      onUserMapGesture,
      style,
    },
    ref
  ) {
    const webRef = useRef<WebView>(null);
    const webReadyRef = useRef(false);
    const forceNavCamPassesRef = useRef(0);
    const mapStyleUrl = mapStyleForNavViewMode(mapViewMode);
    const lastSyncRef = useRef<{ key: string; atMs: number }>({ key: "", atMs: 0 });
    const token = resolveMapboxPublicToken();
    const destinationRef = useRef(pickup);
    destinationRef.current = pickup;

    const webViewKey = `${pickup.lat.toFixed(5)},${pickup.lng.toFixed(5)},${destinationLabel}`;
    const [bikeDataUri, setBikeDataUri] = useState<string | null>(null);

    const webAlternativesPayload = useMemo(
      () =>
        alternativeRoutes.map((alt) => {
          const mid = routeMidpoint(alt.coordinates);
          return {
            geojson: {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: alt.coordinates.map((c) => [c.longitude, c.latitude]),
              },
            },
            label: alt.label,
            labelLng: mid?.longitude ?? null,
            labelLat: mid?.latitude ?? null,
          };
        }),
      [alternativeRoutes]
    );

    useEffect(() => {
      let cancelled = false;
      void resolveMapImageDataUri(MAPBIKE_IMAGE).then((uri) => {
        if (!cancelled) setBikeDataUri(uri);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    const html = useMemo(() => {
      if (!token || !bikeDataUri) return "";
      return buildNavigationMapHtml(
        token,
        rider,
        destinationRef.current,
        [],
        bikeDataUri,
        mapStyleUrl,
        NAV_MAP_ZOOM,
        destinationLabel
      );
    }, [token, bikeDataUri, webViewKey, destinationLabel, mapStyleUrl]);

    const effectiveConnector = useMemo(() => {
      if (offRouteConnectorGeoJson?.geometry?.coordinates?.length >= 2) {
        return offRouteConnectorGeoJson;
      }
      const join = routeJoinPoint ?? remainingCoordinates[0];
      if (!join) return null;
      return buildRiderRouteConnectorGeoJson(
        { latitude: rider.lat, longitude: rider.lng },
        join
      );
    }, [
      offRouteConnectorGeoJson,
      routeJoinPoint,
      remainingCoordinates,
      rider.lat,
      rider.lng,
    ]);

    const syncMap = useCallback(
      (opts?: { forceCamera?: boolean }) => {
        if (!webReadyRef.current) return;

        const coords = remainingCoordinates.map((c) => [c.longitude, c.latitude]);
        const coordKey = coords
          .map((c) => `${(c[0] as number).toFixed(5)},${(c[1] as number).toFixed(5)}`)
          .join(";");
        const altKey = webAlternativesPayload
          .map((a) => a.label)
          .join(",");
        const offKey = effectiveConnector
          ? effectiveConnector.geometry.coordinates
              .map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`)
              .join(";")
          : "";
        const syncKey = `${coordKey}|${rider.lat.toFixed(5)},${rider.lng.toFixed(5)}|${navigationFollowMode}|${pickup.lat},${pickup.lng}|${altKey}|${offKey}|${routeDeviationWrongWay}`;
        const now = Date.now();
        if (
          !opts?.forceCamera &&
          syncKey === lastSyncRef.current.key &&
          now - lastSyncRef.current.atMs < 420
        ) {
          return;
        }
        lastSyncRef.current = { key: syncKey, atMs: now };

        const geo = JSON.stringify({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
        });
        const heading = rider.headingDeg ?? 0;
        const follow = navigationFollowMode ? "true" : "false";
        const forceNavCam =
          opts?.forceCamera ||
          (navigationFollowMode && forceNavCamPassesRef.current > 0);
        if (forceNavCam && navigationFollowMode) {
          forceNavCamPassesRef.current -= 1;
        }
        const forceCam = forceNavCam ? "true" : "false";
        const altsJson = JSON.stringify(webAlternativesPayload);
        const offJson = effectiveConnector ? JSON.stringify(effectiveConnector) : "null";
        const wrongWay = routeDeviationWrongWay ? "true" : "false";
        const join = routeJoinPoint ?? remainingCoordinates[0];
        const joinLng = join?.longitude ?? "null";
        const joinLat = join?.latitude ?? "null";
        const arrowsJson = JSON.stringify(
          maneuverArrowsGeoJson ?? { type: "FeatureCollection", features: [] }
        );
        webRef.current?.injectJavaScript(
          `(function(){
            window.updateRoute && window.updateRoute(${geo}, ${rider.lng}, ${rider.lat}, ${pickup.lng}, ${pickup.lat}, ${heading}, ${follow}, ${forceCam}, ${offJson}, ${wrongWay});
            window.setAlternativeRoutes && window.setAlternativeRoutes(${altsJson});
            window.setRouteJoinPoint && window.setRouteJoinPoint(${joinLng}, ${joinLat});
            window.setManeuverArrows && window.setManeuverArrows(${arrowsJson});
          })(); true;`
        );
      },
      [
        remainingCoordinates,
        webAlternativesPayload,
        rider.lat,
        rider.lng,
        rider.headingDeg,
        pickup.lat,
        pickup.lng,
        navigationFollowMode,
        effectiveConnector,
        routeJoinPoint,
        routeDeviationWrongWay,
        maneuverArrowsGeoJson,
      ]
    );

    const recenter = useCallback(
      (followNavigation?: boolean) => {
        const follow = followNavigation ?? navigationFollowMode;
        if (follow) {
          forceNavCamPassesRef.current = 1;
          webRef.current?.injectJavaScript(
            `window.setFollowNavigation && window.setFollowNavigation(true); true;`
          );
          syncMap({ forceCamera: true });
          return;
        }
        webRef.current?.injectJavaScript(`window.recenterMap && window.recenterMap(false); true;`);
      },
      [navigationFollowMode, syncMap]
    );

    const zoomIn = useCallback(() => {
      webRef.current?.injectJavaScript(`window.zoomMap && window.zoomMap(1); true;`);
    }, []);

    const zoomOut = useCallback(() => {
      webRef.current?.injectJavaScript(`window.zoomMap && window.zoomMap(-1); true;`);
    }, []);

    const overviewExtraCoords = useMemo(() => {
      const out: [number, number][] = [];
      const seen = new Set<string>();
      const push = (lat: number, lng: number) => {
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push([lng, lat]);
      };
      for (const c of fullRouteCoordinates) push(c.latitude, c.longitude);
      if (previousPickup) push(previousPickup.lat, previousPickup.lng);
      return out;
    }, [fullRouteCoordinates, previousPickup?.lat, previousPickup?.lng]);

    const showRouteOverview = useCallback(() => {
      const extra = JSON.stringify(overviewExtraCoords);
      webRef.current?.injectJavaScript(
        `window.showRouteOverview && window.showRouteOverview(${extra}); true;`
      );
    }, [overviewExtraCoords]);

    useImperativeHandle(
      ref,
      () => ({ recenter, showRouteOverview, zoomIn, zoomOut }),
      [recenter, showRouteOverview, zoomIn, zoomOut]
    );

    useEffect(() => {
      syncMap();
    }, [syncMap]);

    useEffect(() => {
      if (!webReadyRef.current) return;
      const on = navigationFollowMode ? "true" : "false";
      webRef.current?.injectJavaScript(
        `window.setFollowNavigation && window.setFollowNavigation(${on}); true;`
      );
    }, [navigationFollowMode]);

    if (!token || !html) {
      return <View style={[styles.fill, style]} />;
    }

    return (
      <View style={[styles.fill, style]}>
        <WebView
          key={`${webViewKey}|${mapStyleUrl}`}
          ref={webRef}
          source={{ html }}
          onLoadStart={() => {
            webReadyRef.current = false;
            forceNavCamPassesRef.current = 0;
          }}
          style={styles.fill}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          allowsInlineMediaPlayback
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data) as { type?: string };
              if (msg.type === "ready") {
                webReadyRef.current = true;
                const on = navigationFollowMode ? "true" : "false";
                webRef.current?.injectJavaScript(
                  `window.setFollowNavigation && window.setFollowNavigation(${on}); true;`
                );
                syncMap({ forceCamera: navigationFollowMode });
              }
              if (msg.type === "userGesture") {
                onUserMapGesture?.();
              }
            } catch {
              // ignore
            }
          }}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
