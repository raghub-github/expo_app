// @ts-nocheck — native Mapbox module is loaded via require()
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import { NavRiderDotMarker } from "@/components/maps/NavRiderDotMarker";
import {
  DropHomePin,
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  PickupRestaurantPin,
  circlePolygon,
  fitCameraToPoints,
  latLngsToLine,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
} from "@/components/maps/native-map-shared";
import {
  NAV_JOIN_DOT_COLOR,
  NAV_OFF_ROUTE_CONNECTOR,
  NAV_ROUTE_BLUE,
  NAV_ROUTE_CASING,
  NAV_ROUTE_CASING_WIDTH,
  NAV_ROUTE_GLOW,
  NAV_ROUTE_GLOW_WIDTH,
  NAV_ROUTE_WIDTH,
  shouldSkipStationaryCamera,
  shouldThrottleNavigationCamera,
} from "@gatimitra/map-tracking-engine";

type Props = {
  center: { latitude: number; longitude: number };
  payload: DeliveryMapPayload;
  refitNonce?: number;
  onReady?: () => void;
  style?: object;
};

export function MapboxWebDeliveryMap({
  center,
  payload,
  refitNonce = 0,
  onReady,
  style,
}: Props) {
  const Mapbox = useCustomerNativeMapbox();
  const cameraRef = useRef(null);
  const followRiderRef = useRef(true);
  const lastFollowCameraRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const lastFitKeyRef = useRef("");

  const remaining = payload.remainingRoute.length >= 2
    ? payload.remainingRoute
    : payload.fullRoute ?? payload.route ?? [];
  const remainingLine = payload.hideRouteLine ? null : latLngsToLine(remaining);
  const connectorLine = payload.hideRouteLine ? null : latLngsToLine(payload.connectorRoute);
  const preRiderLine = latLngsToLine(payload.preRiderArcRoute);
  const pickupVisible = payload.showPickupMarker !== false && payload.pickupLat != null && payload.pickupLng != null;
  const dropVisible = payload.showDropMarker !== false && payload.dropLat != null && payload.dropLng != null;
  const riderVisible = payload.riderLat != null && payload.riderLng != null;
  const geofenceRadius = payload.geofenceRadiusM ?? 200;
  const pickupZone =
    payload.highlightPickupZone && payload.pickupLat != null && payload.pickupLng != null
      ? circlePolygon(payload.pickupLng, payload.pickupLat, geofenceRadius)
      : null;
  const dropZone =
    payload.highlightDropZone && payload.dropLat != null && payload.dropLng != null
      ? circlePolygon(payload.dropLng, payload.dropLat, geofenceRadius)
      : null;
  const joinVisible =
    !payload.hideRouteLine && payload.routeJoinLat != null && payload.routeJoinLng != null;
  const joinGeo = joinVisible
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Point" as const,
          coordinates: [payload.routeJoinLng!, payload.routeJoinLat!] as [number, number],
        },
      }
    : null;

  const fitMap = useCallback(() => {
    const pts: [number, number][] = [];
    if (remaining.length >= 2) {
      for (const c of remaining) pts.push([c.longitude, c.latitude]);
    } else if (payload.preRiderArcRoute && payload.preRiderArcRoute.length >= 2) {
      for (const c of payload.preRiderArcRoute) pts.push([c.longitude, c.latitude]);
    } else {
      if (payload.pickupLat != null && payload.pickupLng != null) {
        pts.push([payload.pickupLng, payload.pickupLat]);
      }
      if (payload.dropLat != null && payload.dropLng != null) {
        pts.push([payload.dropLng, payload.dropLat]);
      }
      if (payload.riderLat != null && payload.riderLng != null) {
        pts.push([payload.riderLng, payload.riderLat]);
      }
    }
    if (pts.length === 0) {
      pts.push([center.longitude, center.latitude]);
    }
    const pad = payload.mapPadding ?? { top: 48, bottom: 40, left: 28, right: 28 };
    fitCameraToPoints(cameraRef.current, pts, pad, 650, 16);
  }, [remaining, payload, center.latitude, center.longitude]);

  useEffect(() => {
    if (!mapReady) return;
    const key = [
      remaining.length,
      remaining[0]?.latitude.toFixed(4),
      remaining[remaining.length - 1]?.latitude.toFixed(4),
      payload.mapPhase ?? "",
      payload.hideRouteLine ? "1" : "0",
      payload.highlightPickupZone ? "1" : "0",
      payload.highlightDropZone ? "1" : "0",
      String(refitNonce),
    ].join("|");
    if (key === lastFitKeyRef.current && refitNonce === 0) return;
    lastFitKeyRef.current = key;
    if (refitNonce > 0) followRiderRef.current = true;
    const t = setTimeout(fitMap, 180);
    return () => clearTimeout(t);
  }, [mapReady, fitMap, remaining, payload.mapPhase, payload.hideRouteLine, payload.highlightPickupZone, payload.highlightDropZone, refitNonce]);

  useEffect(() => {
    if (!mapReady || !followRiderRef.current) return;
    if (payload.highlightPickupZone || payload.highlightDropZone) return;
    if (payload.riderLat == null || payload.riderLng == null) return;
    if (shouldSkipStationaryCamera(payload.riderSpeedMps)) return;

    const centerPt = { latitude: payload.riderLat, longitude: payload.riderLng };
    const bearing = payload.riderHeading ?? 0;
    if (shouldThrottleNavigationCamera(lastFollowCameraRef.current, centerPt, bearing)) {
      return;
    }
    lastFollowCameraRef.current = {
      lat: centerPt.latitude,
      lng: centerPt.longitude,
      bearing,
      atMs: Date.now(),
    };
    cameraRef.current?.setCamera?.({
      centerCoordinate: [payload.riderLng, payload.riderLat],
      animationDuration: 420,
      animationMode: "easeTo",
    });
  }, [
    mapReady,
    payload.riderLat,
    payload.riderLng,
    payload.riderHeading,
    payload.riderSpeedMps,
    payload.highlightPickupZone,
    payload.highlightDropZone,
  ]);

  if (nativeMapUnavailableReason() || !Mapbox) {
    return <NativeMapUnavailable style={style} />;
  }

  return (
    <View style={[styles.fill, style]} collapsable={false}>
      <Mapbox.MapView
        style={styles.fill}
        styleURL={NATIVE_MAP_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled
        zoomEnabled
        pitchEnabled={false}
        rotateEnabled
        surfaceView={false}
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          onReady?.();
        }}
        onCameraChanged={(e) => {
          if (e?.gestures?.isGestureActive) followRiderRef.current = false;
        }}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [center.longitude, center.latitude],
            zoomLevel: 14.5,
          }}
        />

        {pickupZone ? (
          <Mapbox.ShapeSource id="cx-pickup-zone" shape={pickupZone}>
            <Mapbox.FillLayer id="cx-pickup-zone-fill" style={{ fillColor: "#22C55E", fillOpacity: 0.14 }} />
            <Mapbox.LineLayer id="cx-pickup-zone-line" style={{ lineColor: "#22C55E", lineOpacity: 0.35, lineWidth: 1.5 }} />
          </Mapbox.ShapeSource>
        ) : null}

        {dropZone ? (
          <Mapbox.ShapeSource id="cx-drop-zone" shape={dropZone}>
            <Mapbox.FillLayer id="cx-drop-zone-fill" style={{ fillColor: "#22C55E", fillOpacity: 0.14 }} />
            <Mapbox.LineLayer id="cx-drop-zone-line" style={{ lineColor: "#22C55E", lineOpacity: 0.35, lineWidth: 1.5 }} />
          </Mapbox.ShapeSource>
        ) : null}

        {preRiderLine ? (
          <Mapbox.ShapeSource id="cx-pre-rider" shape={preRiderLine}>
            <Mapbox.LineLayer
              id="cx-pre-rider-line"
              style={{
                lineColor: "#1C1C1C",
                lineWidth: 3,
                lineOpacity: 0.9,
                lineDasharray: [2, 2],
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {connectorLine ? (
          <Mapbox.ShapeSource id="cx-connector" shape={connectorLine}>
            <Mapbox.LineLayer
              id="cx-connector-casing"
              style={{
                lineColor: "#ffffff",
                lineWidth: 7,
                lineOpacity: 0.92,
                lineDasharray: [2, 2],
                lineJoin: "round",
                lineCap: "round",
              }}
            />
            <Mapbox.LineLayer
              id="cx-connector-line"
              style={{
                lineColor: NAV_OFF_ROUTE_CONNECTOR,
                lineWidth: 5,
                lineOpacity: 1,
                lineDasharray: [2, 2],
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {remainingLine ? (
          <Mapbox.ShapeSource id="cx-remaining" shape={remainingLine}>
            <Mapbox.LineLayer
              id="cx-remaining-glow"
              style={{
                lineColor: NAV_ROUTE_GLOW,
                lineWidth: NAV_ROUTE_GLOW_WIDTH,
                lineOpacity: 0.65,
                lineJoin: "round",
                lineCap: "round",
                lineBlur: 2,
              }}
            />
            <Mapbox.LineLayer
              id="cx-remaining-casing"
              style={{
                lineColor: NAV_ROUTE_CASING,
                lineWidth: NAV_ROUTE_CASING_WIDTH,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
            <Mapbox.LineLayer
              id="cx-remaining-line"
              style={{
                lineColor: NAV_ROUTE_BLUE,
                lineWidth: NAV_ROUTE_WIDTH,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {joinGeo ? (
          <Mapbox.ShapeSource id="cx-join" shape={joinGeo}>
            <Mapbox.CircleLayer
              id="cx-join-dot"
              style={{
                circleRadius: 7,
                circleColor: NAV_JOIN_DOT_COLOR,
                circleOpacity: 0.72,
                circleStrokeWidth: 2.5,
                circleStrokeColor: "#ffffff",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {pickupVisible
          ? renderNativeMarker(
              Mapbox,
              "cx-pickup",
              [payload.pickupLng!, payload.pickupLat!],
              { x: 0.5, y: 1 },
              <PickupRestaurantPin />
            )
          : null}
        {dropVisible
          ? renderNativeMarker(
              Mapbox,
              "cx-drop",
              [payload.dropLng!, payload.dropLat!],
              { x: 0.5, y: 1 },
              <DropHomePin />
            )
          : null}
        {riderVisible
          ? renderNativeMarker(
              Mapbox,
              "cx-rider",
              [payload.riderLng!, payload.riderLat!],
              { x: 0.5, y: 0.5 },
              <NavRiderDotMarker />
            )
          : null}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
