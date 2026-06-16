import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { getMapboxModule, isMapboxAvailable } from "@/src/services/maps/mapbox";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import { MapboxUnavailablePanel } from "@/src/components/maps/MapboxUnavailablePanel";
import { YouRiderMarker } from "@/src/components/home/YouRiderMarker";
import { RiderRadarPulse } from "@/src/components/home/RiderRadarPulse";
import { isOrderPinAwayFromRider } from "@/src/lib/geo-distance";
import { colors } from "@/src/theme";
import { MAPBOX_HOME_STYLE, HOME_MAP_ZOOM } from "@/src/lib/map-assets";

const BRAND = colors.primary[500];
const DEFAULT = { lat: 24.796, lng: 85.0 };

interface Location {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  heading?: number;
}

interface Order {
  id: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat?: number;
  deliveryLng?: number;
  estimatedEarning: number;
  category: string;
  distanceKm?: number;
}

interface RiderMapViewProps {
  riderLocation: Location | undefined;
  orders: Order[];
  onOrderPress?: (orderId: string) => void;
  style?: object;
  showRadar?: boolean;
}

export type RiderMapViewHandle = {
  recenter: () => void;
};

const formatCoordinate = (coord: number): number => parseFloat(coord.toFixed(7));

const OrderPin: React.FC<{ order: Order; onPress?: () => void }> = ({ order, onPress }) => (
  <View style={styles.orderMarkerContainer} onTouchEnd={onPress}>
    <View style={styles.orderMarkerInner}>
      <Text style={styles.orderMarkerText}>₹{order.estimatedEarning}</Text>
    </View>
    <View style={styles.orderMarkerPin} />
  </View>
);

export const RiderMapView = forwardRef<RiderMapViewHandle, RiderMapViewProps>(function RiderMapView(
  { riderLocation, orders, onOrderPress, style, showRadar = false },
  ref
) {
  const cameraRef = useRef<{ setCamera: (opts: object) => void } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const Mapbox = useMemo(() => {
    if (Platform.OS === "web") return null;
    try {
      return getMapboxModule();
    } catch {
      return null;
    }
  }, []);

  const currentLocation = riderLocation || DEFAULT;
  const lat = formatCoordinate(currentLocation.lat);
  const lng = formatCoordinate(currentLocation.lng);

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.pickupLat != null &&
          order.pickupLng != null &&
          isOrderPinAwayFromRider(lat, lng, order.pickupLat, order.pickupLng)
      ),
    [orders, lat, lng]
  );

  const recenter = useCallback(() => {
    if (!cameraRef.current) return;
    const target = riderLocation || DEFAULT;
    try {
      cameraRef.current.setCamera({
        centerCoordinate: [formatCoordinate(target.lng), formatCoordinate(target.lat)],
        zoomLevel: HOME_MAP_ZOOM,
        animationMode: "flyTo",
        animationDuration: 700,
      });
    } catch {
      // ignore
    }
  }, [riderLocation]);

  useImperativeHandle(ref, () => ({ recenter }), [recenter]);

  useEffect(() => {
    if (!Mapbox || !riderLocation || !cameraRef.current || !mapReady) return;
    recenter();
  }, [riderLocation?.lat, riderLocation?.lng, mapReady, Mapbox, recenter]);

  if (Platform.OS === "web") {
    return <View style={[styles.container, style, { backgroundColor: "#ECECEC" }]} />;
  }

  if (!resolveMapboxPublicToken()) {
    return (
      <View style={[styles.container, style]}>
        <MapboxUnavailablePanel context="home" missingToken />
      </View>
    );
  }

  if (!Mapbox || !isMapboxAvailable()) {
    return (
      <View style={[styles.container, style]}>
        <MapboxUnavailablePanel context="home" needsDevBuild />
      </View>
    );
  }

  const MarkerView = Mapbox.MarkerView ?? null;

  const renderMarker = (
    id: string,
    coordinate: [number, number],
    anchor: { x: number; y: number },
    children: React.ReactNode
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
    <View style={[styles.container, style]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={MAPBOX_HOME_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled
        zoomEnabled
        pitchEnabled
        rotateEnabled
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={HOME_MAP_ZOOM}
          centerCoordinate={[lng, lat]}
          animationMode="none"
          animationDuration={0}
        />

        {riderLocation && showRadar
          ? renderMarker("rider-radar", [lng, lat], { x: 0.5, y: 0.5 }, <RiderRadarPulse />)
          : null}

        {riderLocation
          ? renderMarker("rider-location", [lng, lat], { x: 0.5, y: 1 }, <YouRiderMarker />)
          : null}

        {visibleOrders
          .filter((order) => order.pickupLat != null && order.pickupLng != null)
          .map((order) => {
            const orderLat = formatCoordinate(order.pickupLat);
            const orderLng = formatCoordinate(order.pickupLng);
            return (
              <React.Fragment key={order.id}>
                {renderMarker(
                  `order-${order.id}`,
                  [orderLng, orderLat],
                  { x: 0.5, y: 1 },
                  <OrderPin order={order} onPress={() => onOrderPress?.(order.id)} />
                )}
              </React.Fragment>
            );
          })}
      </Mapbox.MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECECEC",
  },
  map: {
    flex: 1,
  },
  orderMarkerContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  orderMarkerInner: {
    backgroundColor: BRAND,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 60,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  orderMarkerText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  orderMarkerPin: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: BRAND,
    marginTop: -2,
  },
});
