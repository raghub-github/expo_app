// @ts-nocheck — native Mapbox module is loaded via require()
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import type { CustomerMapRef, MapEdgePadding } from "@/lib/customer-map-handle";
import type { LatLng } from "@/services/directions.service";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { NavRiderDotMarker } from "@/components/maps/NavRiderDotMarker";
import { RIDE_GPS_AUTO_FOLLOW_DEFAULT } from "@/lib/ride-map-coords";
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
  NAV_FOLLOW_PITCH,
  NAV_FOLLOW_ZOOM,
  NAV_LOOK_AHEAD_M,
  NAV_ROUTE_BLUE,
  NAV_ROUTE_CASING,
  NAV_ROUTE_CASING_WIDTH,
  NAV_ROUTE_GLOW,
  NAV_ROUTE_GLOW_WIDTH,
  NAV_ROUTE_WIDTH,
  normalizeBearing,
  offsetPoint,
  shouldSkipStationaryCamera,
  shouldThrottleNavigationCamera,
} from "@gatimitra/map-tracking-engine";

type Props = {
  center: LatLng;
  routeCoordinates: LatLng[];
  riderPosition: LatLng | null;
  riderHeading?: number | null;
  riderSpeedMps?: number | null;
  pickupPosition?: LatLng | null;
  dropPosition?: LatLng | null;
  riderMarkerImageKey?: string;
  navigationMode?: boolean;
  highlightPickupZone?: boolean;
  highlightDropZone?: boolean;
  geofenceRadiusM?: number;
  onMapReady?: () => void;
  onRegionChangeComplete?: () => void;
  onUserPan?: () => void;
  style?: object;
};

export const MapboxWebRideTrackingMap = forwardRef<CustomerMapRef, Props>(
  function MapboxWebRideTrackingMap(props, ref) {
    return (
      <AppErrorBoundary
        source="mapbox-ride-tracking"
        fallback={() => <NativeMapUnavailable style={props.style} />}
      >
        <MapboxWebRideTrackingMapInner {...props} ref={ref} />
      </AppErrorBoundary>
    );
  }
);

const MapboxWebRideTrackingMapInner = forwardRef<CustomerMapRef, Props>(
  function MapboxWebRideTrackingMapInner(
    {
      center,
      routeCoordinates,
      riderPosition,
      riderHeading,
      riderSpeedMps = null,
      pickupPosition,
      dropPosition = null,
      navigationMode = false,
      highlightPickupZone = false,
      highlightDropZone = false,
      geofenceRadiusM = 200,
      onMapReady,
      onRegionChangeComplete,
      onUserPan,
      style,
    },
    ref
  ) {
    const Mapbox = useCustomerNativeMapbox();
    const mapRef = useRef(null);
    const cameraRef = useRef(null);
    const readyRef = useRef(false);
    const followRef = useRef(RIDE_GPS_AUTO_FOLLOW_DEFAULT);
    const geofenceCameraRef = useRef(false);
    const lastFollowCameraRef = useRef(null);
    const pendingFitRef = useRef<{
      coords: LatLng[];
      options: { edgePadding: MapEdgePadding; maxZoom?: number };
    } | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const initialCenterRef = useRef(center);

    const routeLine = latLngsToLine(routeCoordinates);
    const pickupZone =
      highlightPickupZone && pickupPosition
        ? circlePolygon(pickupPosition.longitude, pickupPosition.latitude, geofenceRadiusM)
        : null;
    const dropZone =
      highlightDropZone && dropPosition
        ? circlePolygon(dropPosition.longitude, dropPosition.latitude, geofenceRadiusM)
        : null;

    const applyFit = useCallback(
      (coords: LatLng[], options: { edgePadding: MapEdgePadding; maxZoom?: number }) => {
        if (navigationMode) return;
        const pts = coords.map((c) => [c.longitude, c.latitude] as [number, number]);
        fitCameraToPoints(cameraRef.current, pts, options.edgePadding, 650, options.maxZoom ?? 15);
      },
      [navigationMode]
    );

    const followRiderCamera = useCallback(
      (opts?: { force?: boolean }) => {
        if (!mapReady || !riderPosition || geofenceCameraRef.current) return;
        if (!followRef.current && !opts?.force) return;
        if (!opts?.force && shouldSkipStationaryCamera(riderSpeedMps)) return;

        const bearing = normalizeBearing(riderHeading ?? 0);
        const centerPt = navigationMode
          ? offsetPoint(riderPosition, bearing, NAV_LOOK_AHEAD_M)
          : riderPosition;

        if (
          !opts?.force &&
          shouldThrottleNavigationCamera(lastFollowCameraRef.current, centerPt, bearing)
        ) {
          return;
        }

        lastFollowCameraRef.current = {
          lat: centerPt.latitude,
          lng: centerPt.longitude,
          bearing,
          atMs: Date.now(),
        };

        cameraRef.current?.setCamera?.({
          centerCoordinate: [centerPt.longitude, centerPt.latitude],
          ...(navigationMode
            ? {
                zoomLevel: NAV_FOLLOW_ZOOM,
                pitch: NAV_FOLLOW_PITCH,
                heading: bearing,
              }
            : {}),
          animationDuration: 420,
          animationMode: "easeTo",
        });
      },
      [mapReady, riderPosition, riderHeading, riderSpeedMps, navigationMode]
    );

    useImperativeHandle(
      ref,
      () => ({
        pointForCoordinate: async (coord) => {
          try {
            const pt = await mapRef.current?.getPointInView?.([coord.longitude, coord.latitude]);
            if (!pt || pt.length < 2) return null;
            return { x: pt[0], y: pt[1] };
          } catch {
            return null;
          }
        },
        fitToCoordinates: (coords, options) => {
          if (!readyRef.current) {
            pendingFitRef.current = { coords, options };
            return;
          }
          applyFit(coords, options);
        },
        fitToGeofence: (c, radiusM, options) => {
          if (!readyRef.current) return;
          geofenceCameraRef.current = true;
          const r = Math.max(radiusM || 200, 120) * 1.28;
          const latOffset = (r / 6378137) * (180 / Math.PI);
          const lngOffset = latOffset / Math.max(0.35, Math.cos((c.latitude * Math.PI) / 180));
          fitCameraToPoints(
            cameraRef.current,
            [
              [c.longitude + lngOffset, c.latitude + latOffset],
              [c.longitude - lngOffset, c.latitude - latOffset],
            ],
            options.edgePadding,
            options.animated === false ? 0 : 750,
            options.maxZoom ?? 16.4
          );
        },
        clearGeofenceCamera: () => {
          geofenceCameraRef.current = false;
        },
        recenterOnRider: () => {
          followRef.current = true;
          followRiderCamera({ force: true });
        },
      }),
      [applyFit, followRiderCamera]
    );

    useEffect(() => {
      followRiderCamera();
    }, [followRiderCamera]);

    if (nativeMapUnavailableReason() || !Mapbox) {
      return <NativeMapUnavailable style={style} />;
    }

    return (
      <View style={[styles.fill, style]} collapsable={false}>
        <Mapbox.MapView
          ref={mapRef}
          style={styles.fill}
          styleURL={NATIVE_MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled
          zoomEnabled
          pitchEnabled={true}
          rotateEnabled
          surfaceView={false}
          onDidFinishLoadingMap={() => {
            readyRef.current = true;
            setMapReady(true);
            if (pendingFitRef.current && !navigationMode) {
              applyFit(pendingFitRef.current.coords, pendingFitRef.current.options);
              pendingFitRef.current = null;
            }
            onMapReady?.();
          }}
          onCameraChanged={(e) => {
            if (e?.gestures?.isGestureActive) {
              followRef.current = false;
              onUserPan?.();
            }
          }}
          onMapIdle={() => onRegionChangeComplete?.()}
        >
          <Mapbox.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [initialCenterRef.current.longitude, initialCenterRef.current.latitude],
              zoomLevel: 14.5,
            }}
          />
          {pickupZone ? (
            <Mapbox.ShapeSource id="ride-pickup-zone" shape={pickupZone}>
              <Mapbox.FillLayer id="ride-pickup-zone-fill" style={{ fillColor: "#22C55E", fillOpacity: 0.14 }} />
              <Mapbox.LineLayer id="ride-pickup-zone-line" style={{ lineColor: "#22C55E", lineWidth: 1.5, lineOpacity: 0.35 }} />
            </Mapbox.ShapeSource>
          ) : null}
          {dropZone ? (
            <Mapbox.ShapeSource id="ride-drop-zone" shape={dropZone}>
              <Mapbox.FillLayer id="ride-drop-zone-fill" style={{ fillColor: "#22C55E", fillOpacity: 0.14 }} />
              <Mapbox.LineLayer id="ride-drop-zone-line" style={{ lineColor: "#22C55E", lineWidth: 1.5, lineOpacity: 0.35 }} />
            </Mapbox.ShapeSource>
          ) : null}
          {routeLine ? (
            <Mapbox.ShapeSource id="ride-track-route" shape={routeLine}>
              <Mapbox.LineLayer
                id="ride-track-route-glow"
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
                id="ride-track-route-casing"
                style={{
                  lineColor: NAV_ROUTE_CASING,
                  lineWidth: NAV_ROUTE_CASING_WIDTH,
                  lineJoin: "round",
                  lineCap: "round",
                }}
              />
              <Mapbox.LineLayer
                id="ride-track-route-line"
                style={{
                  lineColor: NAV_ROUTE_BLUE,
                  lineWidth: NAV_ROUTE_WIDTH,
                  lineJoin: "round",
                  lineCap: "round",
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}
          {pickupPosition
            ? renderNativeMarker(
                Mapbox,
                "ride-pickup",
                [pickupPosition.longitude, pickupPosition.latitude],
                { x: 0.5, y: 1 },
                <PickupRestaurantPin />
              )
            : null}
          {dropPosition
            ? renderNativeMarker(
                Mapbox,
                "ride-drop",
                [dropPosition.longitude, dropPosition.latitude],
                { x: 0.5, y: 1 },
                <DropHomePin />
              )
            : null}
          {riderPosition
            ? renderNativeMarker(
                Mapbox,
                "ride-captain",
                [riderPosition.longitude, riderPosition.latitude],
                { x: 0.5, y: 0.5 },
                <NavRiderDotMarker />
              )
            : null}
        </Mapbox.MapView>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
