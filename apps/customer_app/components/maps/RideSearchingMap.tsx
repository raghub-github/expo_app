// @ts-nocheck — native Mapbox module is loaded via require()
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { getConfig } from "@/config/env";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";
import {
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  VehicleMarker,
  nativeMapUnavailableReason,
  renderNativeMarker,
  useCustomerNativeMapbox,
  useRiderMarkerSource,
} from "@/components/maps/native-map-shared";

type Props = {
  center: { latitude: number; longitude: number };
  nearbyRiders?: NearbySupplyRider[];
  riderMarkerImageKey?: string;
  bottomMapPadding?: number;
  style?: object;
};

function SearchRadar() {
  const scale = useRef(new Animated.Value(0.35)).current;
  const opacity = useRef(new Animated.Value(0.65)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.35, duration: 2400, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 2400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.35, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.65, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);
  return (
    <View style={styles.radarHost} pointerEvents="none">
      <Animated.View style={[styles.radarRing, { opacity, transform: [{ scale }] }]} />
    </View>
  );
}

export function RideSearchingMap({
  center,
  nearbyRiders = [],
  riderMarkerImageKey = "bike",
  bottomMapPadding = 360,
  style,
}: Props) {
  const Mapbox = useCustomerNativeMapbox();
  const cameraRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const markerSource = useRiderMarkerSource(riderMarkerImageKey);
  const initialCenterRef = useRef(center);
  const token = getConfig().mapboxAccessToken?.trim() ?? "";

  if (!token || nativeMapUnavailableReason() || !Mapbox) {
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
        rotateEnabled={false}
        surfaceView={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [initialCenterRef.current.longitude, initialCenterRef.current.latitude],
            zoomLevel: 14.8,
            padding: { paddingBottom: Math.max(180, bottomMapPadding) * 0.35 },
          }}
        />
        {mapReady
          ? renderNativeMarker(
              Mapbox,
              "search-radar",
              [center.longitude, center.latitude],
              { x: 0.5, y: 0.5 },
              <SearchRadar />
            )
          : null}
        {mapReady
          ? nearbyRiders
              .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
              .map((r) =>
                renderNativeMarker(
                  Mapbox,
                  `search-rider-${r.riderId}`,
                  [r.lng, r.lat],
                  { x: 0.5, y: 0.5 },
                  <VehicleMarker source={markerSource} headingDeg={r.heading ?? 0} size={34} />
                )
              )
          : null}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  radarHost: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "rgba(59,130,246,0.42)",
    backgroundColor: "rgba(59,130,246,0.07)",
  },
});
