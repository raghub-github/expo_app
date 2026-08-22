// @ts-nocheck — native Mapbox module is loaded via require()
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import {
  DropHomePin,
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  PickupRestaurantPin,
  ROUTE_BLUE,
  ROUTE_CASING,
  ROUTE_CONNECTOR,
  VehicleMarker,
  circlePolygon,
  fitCameraToPoints,
  latLngsToLine,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
  useRiderMarkerSource,
} from "@/components/maps/native-map-shared";

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
  const [mapReady, setMapReady] = useState(false);
  const bikeSource = useRiderMarkerSource("bike");
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
    cameraRef.current?.setCamera?.({
      centerCoordinate: [payload.riderLng, payload.riderLat],
      animationDuration: 420,
      animationMode: "easeTo",
    });
  }, [mapReady, payload.riderLat, payload.riderLng]);

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
              id="cx-connector-line"
              style={{
                lineColor: ROUTE_CONNECTOR,
                lineWidth: 4,
                lineOpacity: 0.85,
                lineDasharray: [1.5, 1.5],
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {remainingLine ? (
          <Mapbox.ShapeSource id="cx-remaining" shape={remainingLine}>
            <Mapbox.LineLayer
              id="cx-remaining-casing"
              style={{
                lineColor: ROUTE_CASING,
                lineWidth: 6,
                lineOpacity: 0.9,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
            <Mapbox.LineLayer
              id="cx-remaining-line"
              style={{
                lineColor: ROUTE_BLUE,
                lineWidth: 4,
                lineOpacity: 0.96,
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
                circleRadius: 5,
                circleColor: ROUTE_BLUE,
                circleStrokeWidth: 2,
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
              <VehicleMarker source={bikeSource} headingDeg={payload.riderHeading ?? 0} />
            )
          : null}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
