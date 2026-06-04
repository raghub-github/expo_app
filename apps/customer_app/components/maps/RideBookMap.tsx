import React, { forwardRef } from "react";
import { StyleSheet } from "react-native";
import { MapboxWebRideBookMap } from "@/components/maps/MapboxWebRideBookMap";
import { CustomerMapUnavailable } from "@/components/maps/CustomerMapUnavailable";
import { getConfig } from "@/config/env";
import type { CustomerMapRef } from "@/lib/customer-map-handle";
import type { LatLng } from "@/services/directions.service";
import type { NearbySupplyRider } from "@/services/rideAvailability.service";

type Props = {
  center: LatLng;
  routeCoordinates: LatLng[];
  showRoadPolyline: boolean;
  stopCoords: LatLng[];
  nearbyRiders: NearbySupplyRider[];
  onMapReady?: () => void;
  onRegionChange?: () => void;
  onRegionChangeComplete?: () => void;
  style?: object;
};

/** Ride book route map — Mapbox only (no Google Maps). */
export const RideBookMap = forwardRef<CustomerMapRef, Props>(function RideBookMap(props, ref) {
  const token = getConfig().mapboxAccessToken?.trim() ?? "";

  if (!token) {
    return <CustomerMapUnavailable style={[styles.fill, props.style]} />;
  }

  return <MapboxWebRideBookMap ref={ref} {...props} style={[styles.fill, props.style]} />;
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
