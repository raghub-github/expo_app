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
import {
  DropHomePin,
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  PickupRestaurantPin,
  ROUTE_BLUE,
  ROUTE_CASING,
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
  center: LatLng;
  routeCoordinates: LatLng[];
  riderPosition: LatLng | null;
  riderHeading?: number | null;
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
  function MapboxWebRideTrackingMap(
    {
      center,
      routeCoordinates,
      riderPosition,
      riderHeading,
      pickupPosition,
      dropPosition = null,
      riderMarkerImageKey = "bike",
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
    const followRef = useRef(true);
    const geofenceCameraRef = useRef(false);
    const pendingFitRef = useRef<{
      coords: LatLng[];
      options: { edgePadding: MapEdgePadding; maxZoom?: number };
    } | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const markerSource = useRiderMarkerSource(riderMarkerImageKey);
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
          if (geofenceCameraRef.current || !riderPosition) return;
          cameraRef.current?.setCamera?.({
            centerCoordinate: [riderPosition.longitude, riderPosition.latitude],
            animationDuration: 450,
            animationMode: "easeTo",
          });
        },
      }),
      [applyFit, riderPosition]
    );

    useEffect(() => {
      if (!mapReady || !navigationMode || !riderPosition) return;
      cameraRef.current?.setCamera?.({
        centerCoordinate: [riderPosition.longitude, riderPosition.latitude],
        zoomLevel: 16,
        pitch: 48,
        heading: riderHeading ?? 0,
        animationDuration: 380,
        animationMode: "easeTo",
      });
    }, [
      mapReady,
      navigationMode,
      riderPosition?.latitude,
      riderPosition?.longitude,
      riderHeading,
    ]);

    useEffect(() => {
      if (!mapReady || navigationMode || geofenceCameraRef.current) return;
      if (!followRef.current || !riderPosition) return;
      cameraRef.current?.setCamera?.({
        centerCoordinate: [riderPosition.longitude, riderPosition.latitude],
        animationDuration: 420,
        animationMode: "easeTo",
      });
    }, [mapReady, navigationMode, riderPosition?.latitude, riderPosition?.longitude]);

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
          pitchEnabled={navigationMode}
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
                id="ride-track-route-casing"
                style={{ lineColor: ROUTE_CASING, lineWidth: 7, lineJoin: "round", lineCap: "round" }}
              />
              <Mapbox.LineLayer
                id="ride-track-route-line"
                style={{ lineColor: ROUTE_BLUE, lineWidth: 4.5, lineOpacity: 0.96, lineJoin: "round", lineCap: "round" }}
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
                <VehicleMarker source={markerSource} headingDeg={riderHeading ?? 0} size={44} />
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
