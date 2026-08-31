// @ts-nocheck — native Mapbox module is loaded via require()
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { latitudeDeltaToZoom } from "@/components/maps/mapbox-web-shared";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import {
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  SnapDot,
  circlePolygon,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
} from "@/components/maps/native-map-shared";

const FALLBACK_REGION: MapRegion = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

function safeMapRegion(region: MapRegion): MapRegion {
  if (isValidMapCoordinate(region.latitude, region.longitude)) return region;
  return FALLBACK_REGION;
}

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
};

export type SnapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  selected?: boolean;
};

type Props = {
  initialRegion: MapRegion;
  circleRadiusMeters?: number;
  snapPoints?: SnapPoint[];
  onRegionChange?: (region: MapRegion) => void;
  onRegionChangeComplete?: (region: MapRegion) => void;
  onSnapPointPress?: (id: string) => void;
  onMapReady?: () => void;
  style?: object;
};

export const MapboxWebPannableMap = forwardRef<CustomerMapRef, Props>(function MapboxWebPannableMap(
  {
    initialRegion,
    circleRadiusMeters,
    snapPoints = [],
    onRegionChange,
    onRegionChangeComplete,
    onSnapPointPress,
    onMapReady,
    style,
  },
  ref
) {
  const Mapbox = useCustomerNativeMapbox();
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const lastPostedRef = useRef<{ lat: number; lng: number } | null>(null);
  const ignoreUntilMsRef = useRef(0);
  const origin = safeMapRegion(initialRegion);
  const originRef = useRef({
    latitude: origin.latitude,
    longitude: origin.longitude,
    zoom: latitudeDeltaToZoom(origin.latitudeDelta ?? 0.01),
  });

  const postRegion = useCallback(
    (phase: "change" | "complete", lat: number, lng: number) => {
      if (!readyRef.current) return;
      if (!isValidMapCoordinate(lat, lng)) return;
      if (Date.now() < ignoreUntilMsRef.current) return;
      if (lastPostedRef.current) {
        const dLat = Math.abs(lat - lastPostedRef.current.lat);
        const dLng = Math.abs(lng - lastPostedRef.current.lng);
        // ~11m — ignore camera jitter / map-resize idles that aren't a real pan.
        if (dLat < 1e-4 && dLng < 1e-4) return;
      }
      lastPostedRef.current = { lat, lng };
      const region: MapRegion = { latitude: lat, longitude: lng };
      if (phase === "complete") onRegionChangeComplete?.(region);
      else onRegionChange?.(region);
    },
    [onRegionChange, onRegionChangeComplete]
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
      fitToCoordinates: () => {
        /* not used on pannable maps */
      },
      animateToRegion: (region: MapRegion) => {
        if (!readyRef.current) return;
        const next = safeMapRegion(region);
        ignoreUntilMsRef.current = Date.now() + 420;
        lastPostedRef.current = { lat: next.latitude, lng: next.longitude };
        const zoom = latitudeDeltaToZoom(next.latitudeDelta ?? 0.01);
        cameraRef.current?.setCamera?.({
          centerCoordinate: [next.longitude, next.latitude],
          zoomLevel: zoom,
          animationDuration: 320,
          animationMode: "flyTo",
        });
      },
    }),
    []
  );

  const rangeCircle =
    circleRadiusMeters && circleRadiusMeters > 0
      ? circlePolygon(originRef.current.longitude, originRef.current.latitude, circleRadiusMeters)
      : null;

  const validSnaps = snapPoints.filter((p) => isValidMapCoordinate(p.latitude, p.longitude));

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
          lastPostedRef.current = {
            lat: originRef.current.latitude,
            lng: originRef.current.longitude,
          };
          setMapReady(true);
          onMapReady?.();
        }}
        onCameraChanged={(e) => {
          const coords = e?.properties?.center;
          if (!coords || coords.length < 2) return;
          postRegion("change", coords[1], coords[0]);
        }}
        onMapIdle={(e) => {
          const coords = e?.properties?.center;
          if (!coords || coords.length < 2) return;
          postRegion("complete", coords[1], coords[0]);
        }}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [originRef.current.longitude, originRef.current.latitude],
            zoomLevel: originRef.current.zoom,
          }}
          minZoomLevel={8}
          maxZoomLevel={20}
        />
        {rangeCircle ? (
          <Mapbox.ShapeSource id="cx-pin-range" shape={rangeCircle}>
            <Mapbox.FillLayer
              id="cx-pin-range-fill"
              style={{ fillColor: "rgba(59,130,246,0.18)" }}
            />
            <Mapbox.LineLayer
              id="cx-pin-range-line"
              style={{ lineColor: "rgba(59,130,246,0.45)", lineWidth: 1.5 }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {mapReady
          ? validSnaps.map((p) =>
              renderNativeMarker(
                Mapbox,
                `snap-${p.id}`,
                [p.longitude, p.latitude],
                { x: 0.5, y: 0.5 },
                <SnapDot selected={p.selected} onPress={() => onSnapPointPress?.(p.id)} />
              )
            )
          : null}
      </Mapbox.MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
