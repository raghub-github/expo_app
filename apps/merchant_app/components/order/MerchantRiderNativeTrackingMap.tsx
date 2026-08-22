// @ts-nocheck — Mapbox native module is loaded via require(); types follow rider app.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import type { MerchantRiderTrackingPayload } from "@/services/riderTrackingApi";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  getMerchantMapboxModule,
  initializeMerchantMapbox,
  isMerchantExpoGo,
  isMerchantNativeMapboxAvailable,
} from "@/lib/merchant-native-mapbox";
import {
  fetchMerchantDrivingRoute,
  pinToLngLat,
  trackingRouteDestination,
  type LngLat,
} from "@/lib/merchant-tracking-route";

type Props = {
  payload: MerchantRiderTrackingPayload;
  mapboxToken: string;
  bikeUri: string;
};

const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const ROUTE_GREEN = "#22C55E";

function StorePin() {
  return (
    <View style={styles.storePinWrap} collapsable={false}>
      <View style={styles.storePin}>
        <Ionicons name="home" size={13} color="#FFFFFF" />
      </View>
      <View style={styles.storePinTip} />
    </View>
  );
}

function RiderBikeMarker({ uri, headingDeg }: { uri: string; headingDeg: number }) {
  return (
    <View style={styles.bikeWrap} collapsable={false}>
      <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
        {uri ? (
          <Image source={{ uri }} style={styles.bike} resizeMode="contain" />
        ) : (
          <Ionicons name="bicycle" size={28} color={GatiMitraMerchant.navy} />
        )}
      </View>
    </View>
  );
}

export function MerchantRiderNativeTrackingMap({ payload, mapboxToken, bikeUri }: Props) {
  const cameraRef = useRef<{
    setCamera?: (opts: object) => void;
    fitBounds?: (
      ne: [number, number],
      sw: [number, number],
      padding?: number,
      duration?: number
    ) => void;
  } | null>(null);
  const zoomRef = useRef(14);
  const [mapReady, setMapReady] = useState(false);
  const [routeCoords, setRouteCoords] = useState<LngLat[]>([]);
  const lastRouteKeyRef = useRef("");

  const Mapbox = useMemo(() => {
    initializeMerchantMapbox();
    return getMerchantMapboxModule();
  }, []);

  const riderLL = pinToLngLat(payload.location);
  const storeLL =
    pinToLngLat(payload.store) ?? pinToLngLat(payload.pickup);
  const destLL = trackingRouteDestination(payload);
  const dropLL = pinToLngLat(payload.drop);
  const heading = payload.location?.heading_degrees ?? 0;
  const showDropPin =
    !!dropLL &&
    (payload.rider_display_variant === "picked_up" ||
      payload.rider_display_variant === "delivered" ||
      payload.rider_display_variant === "rto") &&
    (!storeLL || dropLL[0] !== storeLL[0] || dropLL[1] !== storeLL[1]);

  const center = riderLL ?? storeLL ?? destLL ?? ([78.9629, 20.5937] as LngLat);

  useEffect(() => {
    if (!mapboxToken || !riderLL || !destLL) return;
    const key = `${riderLL[0].toFixed(4)},${riderLL[1].toFixed(4)}>${destLL[0].toFixed(4)},${destLL[1].toFixed(4)}`;
    if (key === lastRouteKeyRef.current && routeCoords.length >= 2) return;
    lastRouteKeyRef.current = key;
    let cancelled = false;
    void fetchMerchantDrivingRoute(mapboxToken, riderLL, destLL).then((coords) => {
      if (!cancelled) setRouteCoords(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [mapboxToken, riderLL?.[0], riderLL?.[1], destLL?.[0], destLL?.[1], routeCoords.length]);

  const fitRoute = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const pts: LngLat[] = [];
    if (routeCoords.length >= 2) pts.push(...routeCoords);
    else {
      if (riderLL) pts.push(riderLL);
      if (storeLL) pts.push(storeLL);
      if (destLL) pts.push(destLL);
    }
    if (pts.length === 0) return;
    if (pts.length === 1) {
      cam.setCamera?.({
        centerCoordinate: pts[0],
        zoomLevel: 15,
        animationDuration: 500,
        animationMode: "easeTo",
      });
      zoomRef.current = 15;
      return;
    }
    let minLng = pts[0]![0];
    let minLat = pts[0]![1];
    let maxLng = minLng;
    let maxLat = minLat;
    for (const [lng, lat] of pts) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
    try {
      cam.fitBounds?.([maxLng, maxLat], [minLng, minLat], 56, 700);
    } catch {
      cam.setCamera?.({
        bounds: { ne: [maxLng, maxLat], sw: [minLng, minLat], padding: 56 },
        animationDuration: 700,
        animationMode: "easeTo",
      });
    }
  }, [routeCoords, riderLL, storeLL, destLL]);

  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(fitRoute, 280);
    return () => clearTimeout(t);
  }, [mapReady, fitRoute]);

  const bumpZoom = (delta: number) => {
    zoomRef.current = Math.max(3, Math.min(20, zoomRef.current + delta));
    cameraRef.current?.setCamera?.({
      zoomLevel: zoomRef.current,
      animationDuration: 180,
      animationMode: "easeTo",
    });
  };

  if (isMerchantExpoGo() || !Mapbox || !isMerchantNativeMapboxAvailable()) {
    return (
      <View style={styles.fallback}>
        <Ionicons name="map-outline" size={28} color={GatiMitraMerchant.primary} />
        <Text style={styles.fallbackTitle}>Native map needs a development build</Text>
        <Text style={styles.fallbackBody}>
          Live tracking uses the Android Mapbox view (not WebView). Open the GatiMitra Partner
          app or run npx expo run:android — Expo Go cannot load native maps.
        </Text>
      </View>
    );
  }

  const routeGeoJson =
    routeCoords.length >= 2
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: routeCoords },
        }
      : null;

  const MarkerView = Mapbox.MarkerView ?? null;
  const renderMarker = (
    id: string,
    coordinate: LngLat,
    anchor: { x: number; y: number },
    children: ReactNode
  ) => {
    if (MarkerView) {
      return (
        <MarkerView id={id} coordinate={coordinate} anchor={anchor} allowOverlap>
          {children}
        </MarkerView>
      );
    }
    return (
      <Mapbox.PointAnnotation id={id} coordinate={coordinate} anchor={anchor}>
        {children}
      </Mapbox.PointAnnotation>
    );
  };

  return (
    <View style={styles.fill} collapsable={false}>
      <Mapbox.MapView
        style={styles.fill}
        styleURL={MAP_STYLE}
        logoEnabled
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled
        zoomEnabled
        pitchEnabled={false}
        rotateEnabled
        surfaceView={false}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: center,
            zoomLevel: 14,
          }}
        />
        {routeGeoJson ? (
          <Mapbox.ShapeSource id="merchant-rider-route" shape={routeGeoJson}>
            <Mapbox.LineLayer
              id="merchant-rider-route-casing"
              style={{
                lineColor: "#FFFFFF",
                lineWidth: 7,
                lineOpacity: 1,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
            <Mapbox.LineLayer
              id="merchant-rider-route-line"
              style={{
                lineColor: ROUTE_GREEN,
                lineWidth: 4,
                lineOpacity: 0.95,
                lineJoin: "round",
                lineCap: "round",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {storeLL
          ? renderMarker("merchant-store-pin", storeLL, { x: 0.5, y: 1 }, <StorePin />)
          : null}
        {showDropPin && dropLL
          ? renderMarker("merchant-drop-pin", dropLL, { x: 0.5, y: 1 }, <StorePin />)
          : null}
        {riderLL
          ? renderMarker(
              "merchant-rider-bike",
              riderLL,
              { x: 0.5, y: 0.5 },
              <RiderBikeMarker uri={bikeUri} headingDeg={heading} />
            )
          : null}
      </Mapbox.MapView>

      {!mapReady ? (
        <View style={styles.mapLoader} pointerEvents="none">
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : null}

      <View style={styles.zoomCol} pointerEvents="box-none">
        <View style={styles.zoomGroup}>
          <Pressable
            onPress={() => bumpZoom(1)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomPressed]}
            accessibilityLabel="Zoom in"
          >
            <Ionicons name="add" size={20} color="#5F6368" />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable
            onPress={() => bumpZoom(-1)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomPressed]}
            accessibilityLabel="Zoom out"
          >
            <Ionicons name="remove" size={20} color="#5F6368" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: "100%", height: "100%", backgroundColor: "#E8EEF5" },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  fallbackBody: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  mapLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomCol: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 8,
  },
  zoomGroup: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  zoomBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomPressed: { backgroundColor: "#F3F4F6" },
  zoomDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#DADCE0" },
  storePinWrap: { alignItems: "center", width: 28 },
  storePin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
  },
  storePinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1A1A1A",
    marginTop: -1,
  },
  bikeWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  bike: { width: 34, height: 34 },
});
