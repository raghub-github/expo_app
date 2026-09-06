// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback, useMemo, memo } from "react";
import { View, Text, StyleSheet, Platform, type StyleProp, type ViewStyle } from "react-native";
import { getMapboxModule, isMapboxAvailable } from "@/src/services/maps/mapbox";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";
import { MapboxUnavailablePanel } from "@/src/components/maps/MapboxUnavailablePanel";
import Constants from "expo-constants";
import { YouRiderMarker } from "@/src/components/home/YouRiderMarker";
import { RiderRadarPulse } from "@/src/components/home/RiderRadarPulse";
import { isOrderPinAwayFromRider } from "@/src/lib/geo-distance";
import { colors } from "@/src/theme";
import { MAPBOX_HOME_STYLE, HOME_MAP_ZOOM } from "@/src/lib/map-assets";
import {
  demandZonesToGeoJson,
  type DemandZone,
} from "@/src/lib/demand-zones";
import { hotZonesToGeoJson, type HotZoneCell } from "@/src/lib/hot-zones";
import { nearbyStoresToGeoJson, type NearbyStore } from "@/src/lib/nearby-stores";

const BRAND = colors.primary[500];
/** Service → light translucent fill colour (Food green / Parcel blue / Ride violet). */
const SERVICE_FILL = {
  food: "#16A34A",
  parcel: "#2563EB",
  person_ride: "#7C3AED",
} as const;
/** Store marker + cluster colours (kept distinct from hot-zone service colours). */
const STORE_COLOR = "#EA580C";
const STORE_CLOSED_COLOR = "#9CA3AF";
/** Last successful camera center — never jump to a hardcoded city while waiting for GPS. */
let lastCameraCenter: { lat: number; lng: number } | null = null;
const DEMAND_FILL = "rgba(239, 68, 68, 0.22)";
const DEMAND_STROKE = "#DC2626";

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
  style?: StyleProp<ViewStyle>;
  showRadar?: boolean;
  /** Unmount native Mapbox while another tab is showing — GL keeps compositing even if JS is frozen. */
  paused?: boolean;
  /** Legacy restaurant-cluster zones (hexagons). Used when backend hot zones are empty. */
  demandZones?: DemandZone[];
  /** Backend-authoritative H3 hot zones (preferred over legacy demandZones). */
  hotZones?: HotZoneCell[];
  /** Nearby-stores discovery layer (independent of hot zones; clustered store markers). */
  nearbyStores?: NearbyStore[];
  isOnDuty?: boolean;
}

export type RiderMapViewHandle = {
  recenter: () => void;
};

const formatCoordinate = (coord: number): number => parseFloat(coord.toFixed(7));

function riderMapPropsAreEqual(prev: RiderMapViewProps, next: RiderMapViewProps): boolean {
  if (prev.paused !== next.paused) return false;
  if (prev.showRadar !== next.showRadar || prev.isOnDuty !== next.isOnDuty) return false;
  if (prev.style !== next.style || prev.onOrderPress !== next.onOrderPress) return false;
  const a = prev.riderLocation;
  const b = next.riderLocation;
  if (a?.lat !== b?.lat || a?.lng !== b?.lng || a?.heading !== b?.heading || a?.speedMps !== b?.speedMps) {
    return false;
  }
  if (prev.orders.length !== next.orders.length) return false;
  for (let i = 0; i < prev.orders.length; i++) {
    const po = prev.orders[i];
    const no = next.orders[i];
    if (
      po.id !== no.id ||
      po.estimatedEarning !== no.estimatedEarning ||
      po.pickupLat !== no.pickupLat ||
      po.pickupLng !== no.pickupLng
    ) {
      return false;
    }
  }
  const prevHot = prev.hotZones ?? [];
  const nextHot = next.hotZones ?? [];
  if (prevHot.length !== nextHot.length) return false;
  for (let i = 0; i < prevHot.length; i++) {
    if (prevHot[i].h3Index !== nextHot[i].h3Index || prevHot[i].validUntil !== nextHot[i].validUntil) {
      return false;
    }
  }
  const prevDemand = prev.demandZones ?? [];
  const nextDemand = next.demandZones ?? [];
  if (prevDemand.length !== nextDemand.length) return false;
  for (let i = 0; i < prevDemand.length; i++) {
    if (prevDemand[i].id !== nextDemand[i].id || prevDemand[i].storeCount !== nextDemand[i].storeCount) {
      return false;
    }
  }
  const prevStores = prev.nearbyStores ?? [];
  const nextStores = next.nearbyStores ?? [];
  if (prevStores.length !== nextStores.length) return false;
  for (let i = 0; i < prevStores.length; i++) {
    if (prevStores[i].id !== nextStores[i].id || prevStores[i].isOpen !== nextStores[i].isOpen) {
      return false;
    }
  }
  return true;
}

const OrderPin: React.FC<{ order: Order; onPress?: () => void }> = ({ order, onPress }) => (
  <View style={styles.orderMarkerContainer} onTouchEnd={onPress}>
    <View style={styles.orderMarkerInner}>
      <Text style={styles.orderMarkerText}>₹{order.estimatedEarning}</Text>
    </View>
    <View style={styles.orderMarkerPin} />
  </View>
);

const RiderMapViewInner = forwardRef(function RiderMapViewInner(
  {
    riderLocation,
    orders,
    onOrderPress,
    style,
    showRadar = false,
    paused = false,
    demandZones = [],
    hotZones = [],
    nearbyStores = [],
    isOnDuty = false,
  }: RiderMapViewProps,
  ref: React.Ref<RiderMapViewHandle>
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

  const hasLiveFix = !!riderLocation;
  if (riderLocation) {
    lastCameraCenter = { lat: riderLocation.lat, lng: riderLocation.lng };
  }
  const cameraSeed = riderLocation ?? lastCameraCenter;
  const lat = formatCoordinate(cameraSeed?.lat ?? 0);
  const lng = formatCoordinate(cameraSeed?.lng ?? 0);

  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.pickupLat != null &&
          order.pickupLng != null &&
          (!hasLiveFix ||
            isOrderPinAwayFromRider(lat, lng, order.pickupLat, order.pickupLng))
      ),
    [orders, lat, lng, hasLiveFix]
  );

  const demandGeoJson = useMemo(
    () => (demandZones.length > 0 ? demandZonesToGeoJson(demandZones) : null),
    [demandZones]
  );

  // Real H3 hot zones (backend). Preferred; when present the legacy demandZones
  // are not drawn (orders.tsx passes only one of the two).
  const hotGeoJson = useMemo(
    () => (hotZones.length > 0 ? hotZonesToGeoJson(hotZones) : null),
    [hotZones]
  );

  // Nearby-stores point layer (Mapbox native clustering). Independent of hot zones.
  const storesGeoJson = useMemo(
    () => (nearbyStores.length > 0 ? nearbyStoresToGeoJson(nearbyStores) : null),
    [nearbyStores]
  );

  const recenter = useCallback(() => {
    if (!cameraRef.current || !riderLocation) return;
    try {
      cameraRef.current.setCamera({
        centerCoordinate: [formatCoordinate(riderLocation.lng), formatCoordinate(riderLocation.lat)],
        zoomLevel: HOME_MAP_ZOOM,
        animationMode: "flyTo",
        animationDuration: 700,
      });
    } catch {
      // ignore
    }
  }, [riderLocation]);

  useImperativeHandle(ref, () => ({ recenter }), [recenter]);

  // Center on the rider ONCE — when the first fix + map are ready. After that the
  // camera is fully user-controlled: GPS ticks, hot-zone refreshes, order events and
  // realtime updates must NOT recenter or re-zoom the map. The previous version ran
  // this on every riderLocation change, which (together with the controlled Camera
  // props below) fought the user's manual zoom/pan — the root cause of the zoom-reset
  // bug. The Locate Me FAB still recenters on demand via the exposed recenter() ref.
  const didInitialCenterRef = useRef(false);
  useEffect(() => {
    if (didInitialCenterRef.current) return;
    if (!Mapbox || !riderLocation || !cameraRef.current || !mapReady) return;
    didInitialCenterRef.current = true;
    recenter();
  }, [riderLocation?.lat, riderLocation?.lng, mapReady, Mapbox, recenter]);

  if (Platform.OS === "web") {
    return <View style={[styles.container, style, { backgroundColor: "#ECECEC" }]} />;
  }

  if (paused) {
    return <View style={[styles.container, style, { backgroundColor: "#ECECEC" }]} />;
  }

  if (!resolveMapboxPublicToken()) {
    return (
      <View style={[styles.container, style]}>
        <MapboxUnavailablePanel context="home" missingToken isOnDuty={isOnDuty} />
      </View>
    );
  }

  if (!Mapbox || !isMapboxAvailable()) {
    return (
      <View style={[styles.container, style]}>
        <MapboxUnavailablePanel
          context="home"
          needsDevBuild={Constants.appOwnership === "expo"}
          isOnDuty={isOnDuty}
        />
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
        pitchEnabled={false}
        rotateEnabled
        preferredFramesPerSecond={20}
        onDidFinishLoadingMap={() => setMapReady(true)}
      >
        <Mapbox.Camera
          ref={cameraRef}
          // INITIAL-ONLY positioning via defaultSettings (applied once on mount).
          // Controlled `zoomLevel` / `centerCoordinate` props re-apply on every
          // re-render — and cameraSeed changes on every GPS tick — so they
          // continuously overrode the user's manual zoom/pan (the zoom-reset bug).
          // defaultSettings positions the map once when a fix/last-known center is
          // available at mount; if the first fix arrives later, the one-time effect
          // above calls recenter(). After that the camera stays user-controlled.
          {...(cameraSeed
            ? {
                defaultSettings: {
                  centerCoordinate: [
                    formatCoordinate(cameraSeed.lng),
                    formatCoordinate(cameraSeed.lat),
                  ] as [number, number],
                  zoomLevel: HOME_MAP_ZOOM,
                },
              }
            : {})}
          animationMode="none"
          animationDuration={0}
        />

        {demandGeoJson ? (
          <Mapbox.ShapeSource id="demand-zones" shape={demandGeoJson}>
            <Mapbox.FillLayer
              id="demand-zones-fill"
              style={{
                fillColor: DEMAND_FILL,
                fillOpacity: 1,
              }}
            />
            <Mapbox.LineLayer
              id="demand-zones-outline"
              style={{
                lineColor: DEMAND_STROKE,
                lineWidth: 2,
                lineDasharray: [2, 1.5],
                lineOpacity: 0.95,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {hotGeoJson ? (
          <Mapbox.ShapeSource id="hot-zones" shape={hotGeoJson}>
            {/* H3 hexagons (NOT circles). COLOUR = dominant service (Food green / Parcel blue /
                Ride violet) so overlapping-service areas are distinguishable; light translucent
                so the map stays readable. OPACITY = pressure status (hotter = stronger). */}
            <Mapbox.FillLayer
              id="hot-zones-fill"
              style={{
                fillColor: [
                  "match",
                  ["get", "service"],
                  "food",
                  SERVICE_FILL.food,
                  "parcel",
                  SERVICE_FILL.parcel,
                  "person_ride",
                  SERVICE_FILL.person_ride,
                  "#9CA3AF",
                ],
                fillOpacity: [
                  "match",
                  ["get", "status"],
                  "CRITICAL",
                  0.34,
                  "HOT",
                  0.26,
                  "WARM",
                  0.18,
                  0.1,
                ],
              }}
            />
            <Mapbox.LineLayer
              id="hot-zones-outline"
              style={{
                lineColor: [
                  "match",
                  ["get", "service"],
                  "food",
                  SERVICE_FILL.food,
                  "parcel",
                  SERVICE_FILL.parcel,
                  "person_ride",
                  SERVICE_FILL.person_ride,
                  "#6B7280",
                ],
                lineWidth: 1.4,
                lineOpacity: 0.85,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

        {storesGeoJson ? (
          <Mapbox.ShapeSource
            id="nearby-stores"
            shape={storesGeoJson}
            cluster
            clusterRadius={50}
            clusterMaxZoomLevel={14}
          >
            {/* Cluster bubbles (zoomed out) */}
            <Mapbox.CircleLayer
              id="store-clusters"
              filter={["has", "point_count"]}
              style={{
                circleColor: STORE_COLOR,
                circleOpacity: 0.9,
                circleRadius: ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
                circleStrokeWidth: 2,
                circleStrokeColor: "#ffffff",
              }}
            />
            <Mapbox.SymbolLayer
              id="store-cluster-count"
              filter={["has", "point_count"]}
              style={{
                textField: ["get", "point_count_abbreviated"],
                textSize: 12,
                textColor: "#ffffff",
                textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
                textAllowOverlap: true,
              }}
            />
            {/* Individual store markers (zoomed in) — colour by open/closed */}
            <Mapbox.CircleLayer
              id="store-points"
              filter={["!", ["has", "point_count"]]}
              style={{
                circleColor: ["case", ["get", "isOpen"], STORE_COLOR, STORE_CLOSED_COLOR],
                circleOpacity: 0.95,
                circleRadius: 7,
                circleStrokeWidth: 2,
                circleStrokeColor: "#ffffff",
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}

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

export const RiderMapView = memo(RiderMapViewInner, riderMapPropsAreEqual);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECECEC",
  },
  placeholder: {
    backgroundColor: "#E8F4F1",
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
