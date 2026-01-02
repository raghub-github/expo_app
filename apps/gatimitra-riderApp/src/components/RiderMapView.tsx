import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform, Animated } from "react-native";
import { getMapboxModule } from "@/src/services/maps/mapbox";
import { colors } from "@/src/theme";
import { Svg, Circle, Path } from "react-native-svg";

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
  style?: any;
}

// High precision coordinate formatter (7+ decimal places)
const formatCoordinate = (coord: number): number => {
  return parseFloat(coord.toFixed(7));
};

// Bike Rider Marker Component
const BikeRiderMarker: React.FC<{ heading?: number }> = ({ heading = 0 }) => {
  const rotationAnim = useRef(new Animated.Value(heading || 0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (heading !== undefined) {
      Animated.timing(rotationAnim, {
        toValue: heading,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [heading, rotationAnim]);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const rotation = rotationAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.riderMarkerContainer}>
      <Animated.View
        style={[
          styles.riderMarker,
          {
            transform: [{ rotate: rotation }],
          },
        ]}
      >
        <Svg width={40} height={40} viewBox="0 0 40 40">
          {/* Bike body */}
          <Path
            d="M20 8 L16 20 L12 24 L8 24 L10 20 L14 12 Z M20 8 L24 20 L28 24 L32 24 L30 20 L26 12 Z"
            fill={colors.primary[500]}
            stroke={colors.primary[700]}
            strokeWidth="1.5"
          />
          {/* Wheels */}
          <Circle cx={12} cy={24} r="4" fill={colors.gray[800]} />
          <Circle cx={28} cy={24} r="4" fill={colors.gray[800]} />
          {/* Rider */}
          <Circle cx={20} cy={12} r="3" fill={colors.primary[600]} />
          <Path
            d="M20 15 L20 20 L18 22 L22 22 Z"
            fill={colors.primary[600]}
          />
        </Svg>
      </Animated.View>
      {/* Pulse animation ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.3],
              outputRange: [0.3, 0],
            }),
          },
        ]}
      />
    </View>
  );
};

// Order Marker Component
const OrderMarker: React.FC<{
  order: Order;
  onPress?: () => void;
}> = ({ order, onPress }) => {
  return (
    <View style={styles.orderMarkerContainer} onTouchEnd={onPress}>
      <View style={styles.orderMarker}>
        <View style={styles.orderMarkerInner}>
          <Text style={styles.orderMarkerText}>₹{order.estimatedEarning}</Text>
        </View>
        <View style={styles.orderMarkerPin} />
      </View>
    </View>
  );
};

// Default location (Mumbai, India) - used when location is not yet available
const DEFAULT_LOCATION = {
  lat: 19.0760,
  lng: 72.8777,
};

export const RiderMapView: React.FC<RiderMapViewProps> = ({
  riderLocation,
  orders,
  onOrderPress,
  style,
}) => {
  const Mapbox = Platform.OS !== "web" ? getMapboxModule() : null;
  const cameraRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Debug: Log Mapbox status (only once, not on every render)
  useEffect(() => {
    if (Platform.OS !== "web" && !Mapbox) {
      const config = require("@/src/config/env").getRiderAppConfig();
      const mapboxService = require("@/src/services/maps/mapbox");
      console.log("[RiderMapView] Mapbox Status:", {
        hasMapbox: !!Mapbox,
        hasToken: !!config.mapboxToken,
        tokenPrefix: config.mapboxToken?.substring(0, 10),
        isAvailable: mapboxService.isMapboxAvailable(),
      });
    }
  }, []); // Empty deps - only log once

  // Use default location if rider location is not available yet
  const currentLocation = riderLocation || DEFAULT_LOCATION;
  const lat = formatCoordinate(currentLocation.lat);
  const lng = formatCoordinate(currentLocation.lng);

  // Update camera when rider location changes (with high precision)
  useEffect(() => {
    if (riderLocation && cameraRef.current && mapReady) {
      const lat = formatCoordinate(riderLocation.lat);
      const lng = formatCoordinate(riderLocation.lng);

      cameraRef.current.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: 16,
        animationMode: "flyTo",
        animationDuration: 1000,
      });
    }
  }, [riderLocation, mapReady]);

  // If Mapbox is not available, show helpful error message
  if (!Mapbox) {
    const config = require("@/src/config/env").getRiderAppConfig();
    const hasToken = !!config.mapboxToken;
    
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Map Not Available</Text>
          {!hasToken ? (
            <Text style={styles.errorText}>
              ⚠️ Mapbox token not found.{'\n'}
              Set EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN in .env file
            </Text>
          ) : (
            <>
              <Text style={styles.errorText}>
                ⚠️ Mapbox requires a development build{'\n'}
                Expo Go does not support native modules
              </Text>
              <Text style={[styles.errorText, { marginTop: 12, fontSize: 11 }]}>
                To fix:{'\n'}
                1. Run: npx expo prebuild{'\n'}
                2. Then: npx expo run:android (or run:ios){'\n'}
                3. Or use: eas build --profile development
              </Text>
            </>
          )}
          {mapError && (
            <Text style={[styles.errorText, { marginTop: 8, fontSize: 10 }]}>
              Error: {mapError}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Mapbox.MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/streets-v12"
        logoEnabled={false}
        attributionEnabled={false}
        onDidFinishLoadingMap={() => {
          setMapReady(true);
          // Update camera immediately when map loads
          if (cameraRef.current && riderLocation) {
            const lat = formatCoordinate(riderLocation.lat);
            const lng = formatCoordinate(riderLocation.lng);
            try {
              cameraRef.current.setCamera({
                centerCoordinate: [lng, lat],
                zoomLevel: 16,
                animationMode: "none",
                animationDuration: 0,
              });
            } catch (error) {
              console.warn("[RiderMapView] Camera update error on map load:", error);
            }
          }
        }}
        onDidFailLoadingMap={(error) => {
          console.error("[RiderMapView] Map failed to load:", error);
          setMapError(String(error));
        }}
      >
        {/* Camera - Initialize with current location */}
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={16}
          centerCoordinate={[lng, lat]}
          animationMode="none"
          animationDuration={0}
        />

        {/* Rider Location Marker - only show if we have actual location */}
        {riderLocation && (
          <Mapbox.PointAnnotation
            id="rider-location"
            coordinate={[lng, lat]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <BikeRiderMarker heading={riderLocation.heading} />
          </Mapbox.PointAnnotation>
        )}

        {/* Order Markers */}
        {orders
          .filter((order) => order.pickupLat != null && order.pickupLng != null)
          .map((order) => {
            const orderLat = formatCoordinate(order.pickupLat);
            const orderLng = formatCoordinate(order.pickupLng);

            return (
              <Mapbox.PointAnnotation
                key={order.id}
                id={`order-${order.id}`}
                coordinate={[orderLng, orderLat]}
                anchor={{ x: 0.5, y: 1 }}
                onSelected={() => onOrderPress?.(order.id)}
              >
                <OrderMarker
                  order={order}
                  onPress={() => onOrderPress?.(order.id)}
                />
              </Mapbox.PointAnnotation>
            );
          })}
      </Mapbox.MapView>

      {/* Location Info Overlay - only show if we have actual location */}
      {riderLocation && (
        <View style={styles.locationInfo}>
          <Text style={styles.locationInfoText}>
            {lat.toFixed(7)}, {lng.toFixed(7)}
          </Text>
          {riderLocation.accuracyM && (
            <Text style={styles.accuracyText}>
              Acc: {Math.round(riderLocation.accuracyM)}m
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[100],
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.gray[100],
  },
  loadingText: {
    fontSize: 16,
    color: colors.gray[600],
  },
  riderMarkerContainer: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  riderMarker: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  pulseRing: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.primary[500],
    backgroundColor: "transparent",
    zIndex: 1,
  },
  orderMarkerContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  orderMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  orderMarkerInner: {
    backgroundColor: colors.primary[500],
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
    borderTopColor: colors.primary[500],
    marginTop: -2,
  },
  locationInfo: {
    position: "absolute",
    bottom: 16,
    left: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.gray[700],
    fontWeight: "600",
  },
  accuracyText: {
    fontSize: 10,
    color: colors.gray[600],
    marginTop: 2,
  },
  errorText: {
    fontSize: 12,
    color: colors.error[600],
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
