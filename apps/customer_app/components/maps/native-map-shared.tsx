import { useMemo, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ImageSourcePropType } from "react-native";
import { MAPBOX_RIDE_STYLE } from "@/lib/customer-map-assets";
import type { MapEdgePadding } from "@/lib/customer-map-handle";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import {
  getCustomerMapboxModule,
  initializeCustomerMapbox,
  isCustomerExpoGo,
  isCustomerNativeMapboxAvailable,
} from "@/lib/customer-native-mapbox";
import { getConfig } from "@/config/env";
import { resolveNearbyRiderMarkerImage } from "@/features/ride/rideOptionAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import {
  NAV_OFF_ROUTE_CONNECTOR,
  NAV_ROUTE_BLUE,
  NAV_ROUTE_CASING,
} from "@gatimitra/map-tracking-engine";

export const NATIVE_MAP_STYLE = MAPBOX_RIDE_STYLE;
/** Live tracking route stroke — same mint as Rider App. Booking maps use ROUTE_BOOK_BLUE. */
export const ROUTE_BLUE = NAV_ROUTE_BLUE;
export const ROUTE_CASING = NAV_ROUTE_CASING;
export const ROUTE_CONNECTOR = NAV_OFF_ROUTE_CONNECTOR;
export const ROUTE_BOOK_BLUE = "#2563EB";

export type NativeLatLng = { latitude: number; longitude: number };

export function useCustomerNativeMapbox(): any | null {
  return useMemo(() => {
    try {
      initializeCustomerMapbox();
      return getCustomerMapboxModule();
    } catch {
      return null;
    }
  }, []);
}

export function nativeMapUnavailableReason(): "token" | "dev_build" | null {
  if (!getConfig().mapboxAccessToken?.trim()) return "token";
  if (isCustomerExpoGo() || !isCustomerNativeMapboxAvailable()) return "dev_build";
  return null;
}

export function NativeMapUnavailable({ style }: { style?: object }) {
  const reason = nativeMapUnavailableReason();
  if (reason === "token") return <CustomerMapUnavailable style={style} />;
  return (
    <CustomerMapUnavailable
      style={style}
      message="Live map needs a development build (npx expo run:android). Expo Go cannot load native Mapbox."
    />
  );
}

export function useRiderMarkerSource(imageKey = "bike"): ImageSourcePropType | null {
  const loaded = useAppAssetsStore((s) => s.loaded);
  return useMemo(
    () => resolveNearbyRiderMarkerImage(imageKey),
    [imageKey, loaded]
  );
}

export function latLngsToLine(coords: NativeLatLng[] | undefined | null) {
  if (!coords || coords.length < 2) return null;
  const points = coords.filter((c) => isValidMapCoordinate(c.latitude, c.longitude));
  if (points.length < 2) return null;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((c) => [c.longitude, c.latitude] as [number, number]),
    },
  };
}

export function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64) {
  if (!isValidMapCoordinate(lat, lng) || !Number.isFinite(radiusM) || radiusM <= 0) {
    return null;
  }
  const coords: [number, number][] = [];
  const dist = radiusM / 6378137;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(dist) +
        Math.cos(latRad) * Math.sin(dist) * Math.cos(bearing)
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dist) * Math.cos(latRad),
        Math.cos(dist) - Math.sin(latRad) * Math.sin(pLat)
      );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [coords] },
  };
}

export function fitCameraToPoints(
  camera: {
    fitBounds?: (
      ne: [number, number],
      sw: [number, number],
      padding?: number | number[] | object,
      duration?: number
    ) => void;
    setCamera?: (opts: object) => void;
  } | null,
  points: [number, number][],
  padding: MapEdgePadding | number = 48,
  duration = 650,
  maxZoom = 16
) {
  if (!camera || points.length === 0) return;
  const valid = points.filter(
    ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && isValidMapCoordinate(lat, lng)
  );
  if (valid.length === 0) return;
  if (valid.length === 1) {
    camera.setCamera?.({
      centerCoordinate: valid[0],
      zoomLevel: Math.min(15.4, maxZoom),
      animationDuration: duration,
      animationMode: "easeTo",
    });
    return;
  }
  let minLng = valid[0]![0];
  let minLat = valid[0]![1];
  let maxLng = minLng;
  let maxLat = minLat;
  for (const [lng, lat] of valid) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  const pad =
    typeof padding === "number"
      ? padding
      : [padding.top, padding.right, padding.bottom, padding.left];
  try {
    camera.fitBounds?.([maxLng, maxLat], [minLng, minLat], pad, duration);
  } catch {
    camera.setCamera?.({
      bounds: { ne: [maxLng, maxLat], sw: [minLng, minLat], padding: pad },
      animationDuration: duration,
      animationMode: "easeTo",
    });
  }
}

export function renderNativeMarker(
  Mapbox: any,
  id: string,
  coordinate: [number, number],
  anchor: { x: number; y: number },
  children: ReactNode
) {
  const lng = coordinate[0];
  const lat = coordinate[1];
  if (!isValidMapCoordinate(lat, lng)) return null;
  const MarkerView = Mapbox.MarkerView;
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
}

export function PickupRestaurantPin() {
  return (
    <View style={styles.pinCol} collapsable={false}>
      <View style={[styles.pinOuter, { backgroundColor: "#059669" }]}>
        <View style={styles.pinInnerDark}>
          <Ionicons name="restaurant" size={13} color="#FFFFFF" />
        </View>
      </View>
      <View style={[styles.pinTip, { borderTopColor: "#059669" }]} />
    </View>
  );
}

export function DropHomePin() {
  return (
    <View style={styles.pinCol} collapsable={false}>
      <View style={[styles.pinOuter, { backgroundColor: "#1C1C1C" }]}>
        <Ionicons name="home" size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.pinTip, { borderTopColor: "#1C1C1C" }]} />
    </View>
  );
}

export function VehicleMarker({
  source,
  headingDeg = 0,
  size = 40,
}: {
  source: ImageSourcePropType | null;
  headingDeg?: number;
  size?: number;
}) {
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: "center", justifyContent: "center" }} collapsable={false}>
      <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
        {source ? (
          <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
        ) : (
          <Ionicons name="bicycle" size={size * 0.7} color="#1C1C1C" />
        )}
      </View>
    </View>
  );
}

export function SnapDot({ selected, onPress }: { selected?: boolean; onPress?: () => void }) {
  const size = selected ? 26 : 22;
  return (
    <Pressable onPress={onPress} style={[styles.snap, { width: size, height: size, borderRadius: size / 2, backgroundColor: selected ? "rgba(34,197,94,0.55)" : "rgba(34,197,94,0.35)" }]}>
      <View style={[styles.snapInner, { backgroundColor: selected ? "#15803D" : "#22C55E" }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pinCol: { alignItems: "center", width: 36 },
  pinOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  pinInnerDark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1C1C1C",
    alignItems: "center",
    justifyContent: "center",
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  snap: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  snapInner: { width: 8, height: 8, borderRadius: 4 },
});
