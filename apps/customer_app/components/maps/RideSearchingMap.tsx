// @ts-nocheck — native Mapbox module is loaded via require()
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { getConfig } from "@/config/env";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import {
  NATIVE_MAP_STYLE,
  NativeMapUnavailable,
  VehicleMarker,
  fitCameraToPoints,
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

/** Spread stacked riders a few metres so every vehicle is visible. */
function spreadOverlappingRiders(
  riders: Array<{ riderId: number; lat: number; lng: number; heading: number | null }>
) {
  const buckets = new Map<string, number>();
  return riders.map((r) => {
    const key = `${r.lat.toFixed(5)},${r.lng.toFixed(5)}`;
    const idx = buckets.get(key) ?? 0;
    buckets.set(key, idx + 1);
    if (idx === 0) return r;
    // ~12–18 m offsets in a small ring around the shared GPS point
    const angle = (idx * 2.2) % (Math.PI * 2);
    const meters = 12 + idx * 4;
    const dLat = (meters / 111_320) * Math.cos(angle);
    const dLng = (meters / (111_320 * Math.cos((r.lat * Math.PI) / 180))) * Math.sin(angle);
    return { ...r, lat: r.lat + dLat, lng: r.lng + dLng };
  });
}

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

function CustomerPickupPin() {
  return (
    <View style={styles.pickupCol} collapsable={false}>
      <View style={styles.youBadge}>
        <Text style={styles.youBadgeText}>You</Text>
      </View>
      <View style={styles.pinOuter}>
        <View style={styles.pinInner} />
      </View>
      <View style={styles.pinTip} />
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

  const mapRiders = useMemo(() => {
    const parsed = nearbyRiders
      .map((r) => ({
        riderId: r.riderId,
        lat: Number(r.lat),
        lng: Number(r.lng),
        heading: r.heading != null && Number.isFinite(Number(r.heading)) ? Number(r.heading) : null,
      }))
      .filter((r) => isValidMapCoordinate(r.lat, r.lng));
    return spreadOverlappingRiders(parsed);
  }, [nearbyRiders]);

  const riderIdsKey = useMemo(
    () => mapRiders.map((r) => `${r.riderId}:${r.lat.toFixed(5)},${r.lng.toFixed(5)}`).join("|"),
    [mapRiders]
  );

  useEffect(() => {
    if (!mapReady || !cameraRef.current) return;
    const bottomPad = Math.max(180, Math.round(bottomMapPadding));
    const points: [number, number][] = [
      [center.longitude, center.latitude],
      ...mapRiders.map((r) => [r.lng, r.lat] as [number, number]),
    ].filter(([lng, lat]) => isValidMapCoordinate(lat, lng));
    if (points.length === 0) return;
    fitCameraToPoints(
      cameraRef.current,
      points,
      {
        top: 80,
        right: 48,
        bottom: Math.round(bottomPad * 0.5),
        left: 48,
      },
      650,
      15.5
    );
  }, [mapReady, center.latitude, center.longitude, riderIdsKey, bottomMapPadding, mapRiders]);

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
          ? renderNativeMarker(
              Mapbox,
              "search-customer-pin",
              [center.longitude, center.latitude],
              { x: 0.5, y: 1 },
              <CustomerPickupPin />
            )
          : null}
        {mapReady
          ? mapRiders.map((r) =>
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
  pickupCol: {
    alignItems: "center",
    width: 72,
  },
  youBadge: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  youBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  pinOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
  },
  pinInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  pinTip: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#22C55E",
  },
});
