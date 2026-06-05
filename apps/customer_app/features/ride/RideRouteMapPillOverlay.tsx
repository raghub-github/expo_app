/**
 * Pickup/drop pills + dots rendered above MapView (never clipped by native map).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import type { LatLng } from "@/services/directions.service";
import {
  RIDE_MAP_DOT_SIZE,
  RIDE_MAP_PILL_HEIGHT,
  RIDE_MAP_PILL_WIDTH,
  RIDE_MAP_STEM_HEIGHT,
  resolveMarkerOverlays,
  type InwardBias,
  type MarkerOverlayLayout,
  type ScreenPoint,
} from "@/features/ride/ride-map-pill-layout";

const PICKUP_GREEN = "#22C55E";
const DROP_RED = "#EF4444";

type RideRouteMapPillOverlayProps = {
  mapRef: React.RefObject<CustomerMapRef | null>;
  pickupPoint: LatLng | null;
  dropPoint: LatLng | null;
  pickupLabel: string;
  dropLabel: string;
  pickupBias: InwardBias;
  dropBias: InwardBias;
  syncToken: number;
  mapFrameTick: number;
  onEditPickup: () => void;
  onEditDrop: () => void;
};

function RouteDot({ variant }: { variant: "pickup" | "drop" }) {
  if (variant === "pickup") {
    return (
      <View style={styles.pickupDotOuter}>
        <View style={styles.pickupDotInner} />
      </View>
    );
  }
  return (
    <View style={styles.dropDotOuter}>
      <View style={styles.dropDotInner} />
    </View>
  );
}

function RouteMarker({
  variant,
  label,
  layout,
  onEdit,
}: {
  variant: "pickup" | "drop";
  label: string;
  layout: MarkerOverlayLayout;
  onEdit: () => void;
}) {
  const stemTop = layout.pillTop + RIDE_MAP_PILL_HEIGHT;
  const stemHeight = Math.max(RIDE_MAP_STEM_HEIGHT, layout.dotTop - stemTop);
  const roleDotColor = variant === "pickup" ? PICKUP_GREEN : DROP_RED;

  return (
    <>
      <View
        style={[
          styles.pill,
          {
            left: layout.pillLeft,
            top: layout.pillTop,
          },
        ]}
      >
        <View style={[styles.pillRoleDot, { backgroundColor: roleDotColor }]} />
        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
        <TouchableOpacity
          onPress={onEdit}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${variant} location`}
        >
          <Ionicons name="pencil" size={15} color="#6B7280" />
        </TouchableOpacity>
      </View>
      <View
        style={[
          styles.stem,
          {
            left: layout.pillLeft + RIDE_MAP_PILL_WIDTH / 2 - 1,
            top: stemTop,
            height: stemHeight,
          },
        ]}
        pointerEvents="none"
      />
      <View
        style={[styles.dotWrap, { left: layout.dotLeft, top: layout.dotTop }]}
        pointerEvents="none"
      >
        <RouteDot variant={variant} />
      </View>
    </>
  );
}

export function RideRouteMapPillOverlay({
  mapRef,
  pickupPoint,
  dropPoint,
  pickupLabel,
  dropLabel,
  pickupBias,
  dropBias,
  syncToken,
  mapFrameTick,
  onEditPickup,
  onEditDrop,
}: RideRouteMapPillOverlayProps) {
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [pickupPin, setPickupPin] = useState<ScreenPoint | null>(null);
  const [dropPin, setDropPin] = useState<ScreenPoint | null>(null);
  const syncGen = useRef(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMapSize({ width, height });
  }, []);

  const syncPositions = useCallback(async () => {
    const map = mapRef.current;
    if (!map || mapSize.width <= 0) return;

    const generation = ++syncGen.current;
    try {
      const nextPickup = pickupPoint ? await map.pointForCoordinate(pickupPoint) : null;
      const nextDrop = dropPoint ? await map.pointForCoordinate(dropPoint) : null;
      if (generation !== syncGen.current) return;

      setPickupPin(nextPickup ? { x: nextPickup.x, y: nextPickup.y } : null);
      setDropPin(nextDrop ? { x: nextDrop.x, y: nextDrop.y } : null);
    } catch {
      // Map not ready.
    }
  }, [dropPoint, mapRef, mapSize.height, mapSize.width, pickupPoint]);

  useEffect(() => {
    void syncPositions();
  }, [syncPositions, syncToken, mapFrameTick]);

  const { pickup: pickupLayout, drop: dropLayout } = resolveMarkerOverlays(
    pickupPin,
    dropPin,
    mapSize,
    pickupBias,
    dropBias
  );

  return (
    <View style={styles.host} onLayout={onLayout} pointerEvents="box-none">
      {pickupLayout ? (
        <RouteMarker
          variant="pickup"
          label={pickupLabel}
          layout={pickupLayout}
          onEdit={onEditPickup}
        />
      ) : null}
      {dropLayout ? (
        <RouteMarker variant="drop" label={dropLabel} layout={dropLayout} onEdit={onEditDrop} />
      ) : null}
    </View>
  );
}

const pillShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  android: { elevation: 10 },
  default: {},
});

const dotShadow = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  android: { elevation: 6 },
  default: {},
});

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
    overflow: "visible",
  },
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    width: RIDE_MAP_PILL_WIDTH,
    height: RIDE_MAP_PILL_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    gap: 6,
    ...pillShadow,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    includeFontPadding: false,
  },
  pillRoleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stem: {
    position: "absolute",
    width: 2,
    height: RIDE_MAP_STEM_HEIGHT,
    backgroundColor: "#D1D5DB",
    borderRadius: 1,
  },
  dotWrap: {
    position: "absolute",
    width: RIDE_MAP_DOT_SIZE,
    height: RIDE_MAP_DOT_SIZE,
  },
  pickupDotOuter: {
    width: RIDE_MAP_DOT_SIZE,
    height: RIDE_MAP_DOT_SIZE,
    borderRadius: RIDE_MAP_DOT_SIZE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...dotShadow,
  },
  pickupDotInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PICKUP_GREEN,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  dropDotOuter: {
    width: RIDE_MAP_DOT_SIZE,
    height: RIDE_MAP_DOT_SIZE,
    borderRadius: RIDE_MAP_DOT_SIZE / 2,
    backgroundColor: DROP_RED,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    ...dotShadow,
  },
  dropDotInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#FFFFFF",
  },
});
