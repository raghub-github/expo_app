import React, { memo, forwardRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { RiderMapView, type RiderMapViewHandle } from "@/src/components/RiderMapView";
import { useHomeMapLocationStore } from "@/src/stores/homeMapLocationStore";
import type { DemandZone } from "@/src/lib/demand-zones";
import type { HotZoneCell } from "@/src/lib/hot-zones";
import type { NearbyStore } from "@/src/lib/nearby-stores";

type OrderPin = {
  id: string;
  pickupLat: number;
  pickupLng: number;
  deliveryLat?: number;
  deliveryLng?: number;
  estimatedEarning: number;
  category: string;
  distanceKm?: number;
};

type Props = {
  orders: OrderPin[];
  style?: StyleProp<ViewStyle>;
  paused?: boolean;
  showRadar: boolean;
  demandZones?: DemandZone[];
  hotZones?: HotZoneCell[];
  nearbyStores?: NearbyStore[];
  isOnDuty?: boolean;
};

/**
 * Subscribes to home GPS store so OrdersScreen chrome/header do not re-render on pin updates.
 */
export const HomeDutyMap = memo(
  forwardRef<RiderMapViewHandle, Props>(function HomeDutyMap(
    { orders, style, paused, showRadar, demandZones, hotZones, nearbyStores, isOnDuty },
    ref
  ) {
    const fix = useHomeMapLocationStore((s) => s.fix);
    const riderLocation = fix
      ? {
          lat: fix.lat,
          lng: fix.lng,
          accuracyM: fix.accuracyM,
          speedMps: fix.speedMps,
          heading: fix.heading,
        }
      : undefined;

    return (
      <RiderMapView
        ref={ref}
        riderLocation={riderLocation}
        orders={orders}
        style={style}
        paused={paused}
        showRadar={showRadar && !!riderLocation}
        demandZones={demandZones}
        hotZones={hotZones}
        nearbyStores={nearbyStores}
        isOnDuty={isOnDuty}
      />
    );
  })
);
HomeDutyMap.displayName = "HomeDutyMap";
