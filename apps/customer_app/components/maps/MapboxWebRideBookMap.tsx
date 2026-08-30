// @ts-nocheck — native Mapbox module is loaded via require()
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import type { CustomerMapRef, MapEdgePadding } from "@/lib/customer-map-handle";
import type { LatLng } from "@/services/directions.service";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";
import {
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  ROUTE_BOOK_BLUE,
  ROUTE_CASING,
  VehicleMarker,
  fitCameraToPoints,
  latLngsToLine,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
  useRiderMarkerSource,
} from "@/components/maps/native-map-shared";
import { isValidMapCoordinate } from "@/lib/map-coordinates";

type FitOptions = {
  edgePadding: MapEdgePadding;
  animated?: boolean;
  maxZoom?: number;
};

type Props = {
  center: LatLng;
  routeCoordinates: LatLng[];
  showRoadPolyline: boolean;
  stopCoords: LatLng[];
  nearbyRiders: NearbySupplyRider[];
  riderMarkerImageKey?: string;
  onMapReady?: () => void;
  onRegionChange?: () => void;
  onRegionChangeComplete?: () => void;
  onUserMapGesture?: () => void;
  style?: object;
};

export const MapboxWebRideBookMap = forwardRef<CustomerMapRef, Props>(function MapboxWebRideBookMap(
  {
    center,
    routeCoordinates,
    showRoadPolyline,
    stopCoords,
    nearbyRiders,
    riderMarkerImageKey = "bike",
    onMapReady,
    onRegionChange,
    onRegionChangeComplete,
    onUserMapGesture,
    style,
  },
  ref
) {
  const Mapbox = useCustomerNativeMapbox();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const readyRef = useRef(false);
  const pendingFitRef = useRef<{ coords: LatLng[]; options: FitOptions } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markerSource = useRiderMarkerSource(riderMarkerImageKey);
  const initialCenterRef = useRef(
    isValidMapCoordinate(center.latitude, center.longitude)
      ? center
      : { latitude: 20.5937, longitude: 78.9629 }
  );

  const routeLine = showRoadPolyline ? latLngsToLine(routeCoordinates) : null;

  const applyFitToCoordinates = useCallback((coords: LatLng[], options: FitOptions) => {
    if (coords.length < 1) return;
    const pts = coords.map((c) => [c.longitude, c.latitude] as [number, number]);
    fitCameraToPoints(
      cameraRef.current,
      pts,
      options.edgePadding,
      options.animated === false ? 0 : 650,
      options.maxZoom ?? 15
    );
  }, []);

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
        applyFitToCoordinates(coords, options);
      },
    }),
    [applyFitToCoordinates]
  );

  const riders = useMemo(
    () =>
      nearbyRiders.filter(
        (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)
      ),
    [nearbyRiders]
  );

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
        pitchEnabled={false}
        rotateEnabled
        surfaceView={false}
        onDidFinishLoadingMap={() => {
          readyRef.current = true;
          setMapReady(true);
          if (pendingFitRef.current) {
            applyFitToCoordinates(pendingFitRef.current.coords, pendingFitRef.current.options);
            pendingFitRef.current = null;
          }
          onMapReady?.();
        }}
        onCameraChanged={(e) => {
          if (e?.gestures?.isGestureActive) onUserMapGesture?.();
          onRegionChange?.();
        }}
        onMapIdle={() => onRegionChangeComplete?.()}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [initialCenterRef.current.longitude, initialCenterRef.current.latitude],
            zoomLevel: 14.2,
          }}
        />
        {routeLine ? (
          <Mapbox.ShapeSource id="ride-book-route" shape={routeLine}>
            <Mapbox.LineLayer
              id="ride-book-route-casing"
              style={{ lineColor: ROUTE_CASING, lineWidth: 6, lineJoin: "round", lineCap: "round" }}
            />
            <Mapbox.LineLayer
              id="ride-book-route-line"
              style={{
                lineColor: ROUTE_BOOK_BLUE,
                lineWidth: 3.5,
                lineOpacity: 0.95,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {mapReady
          ? stopCoords.map((s, i) =>
              renderNativeMarker(
                Mapbox,
                `stop-${i}`,
                [s.longitude, s.latitude],
                { x: 0.5, y: 1 },
                <View style={styles.stopDot} />
              )
            )
          : null}
        {mapReady
          ? riders.map((r) =>
              renderNativeMarker(
                Mapbox,
                `nearby-${r.riderId}`,
                [r.lng, r.lat],
                { x: 0.5, y: 0.5 },
                <VehicleMarker source={markerSource} headingDeg={r.heading ?? 0} size={34} />
              )
            )
          : null}
      </Mapbox.MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#111827",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});
