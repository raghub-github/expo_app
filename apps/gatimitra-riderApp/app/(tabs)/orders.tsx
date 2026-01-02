import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Linking, Platform, AppState, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { createForegroundLocationTracker, type LocationTrackerState } from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";
import { useAvailableOrders, useAcceptOrder, useRejectOrder } from "@/src/hooks/useOrders";
import { DutyToggle } from "@/src/components/DutyToggle";
import { colors } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { RiderMapView } from "@/src/components/RiderMapView";
import { MapboxDebug } from "@/src/components/MapboxDebug";

export default function OrdersScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const tracker = useMemo(() => createForegroundLocationTracker(), []);
  const [state, setState] = useState<LocationTrackerState>(tracker.getState());
  const [fraud, setFraud] = useState<{ score: number; signals: string[] } | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);

  // API Hooks
  const { data: availableOrders = [], isLoading: ordersLoading } = useAvailableOrders();
  const acceptOrder = useAcceptOrder();
  const rejectOrder = useRejectOrder();

  const lastPingAtRef = useRef<number>(0);
  const locationCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<any>(null);

  useEffect(() => tracker.subscribe(setState), [tracker]);

  // Mandatory location monitoring - check every 3 seconds and show popup if disabled
  useEffect(() => {
    let alertShown = false;
    
    const checkLocationStatus = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        
        if (status !== "granted") {
          setState((prev) => ({ ...prev, status: "permission_denied" }));
          if (!alertShown && isOnDuty) {
            alertShown = true;
            Alert.alert(
              t("location.required"),
              t("location.permissionDenied"),
              [
                {
                  text: t("location.openSettings"),
                  onPress: async () => {
                    await permissionManager.openSettings("location_foreground");
                    alertShown = false;
                  },
                },
              ],
              { cancelable: false }
            );
          }
        } else if (!enabled) {
          setState((prev) => ({ ...prev, status: "services_disabled" }));
          if (!alertShown && isOnDuty) {
            alertShown = true;
            Alert.alert(
              t("location.servicesRequired"),
              t("location.servicesMessage"),
              [
                {
                  text: t("location.openSettings"),
                  onPress: async () => {
                    await permissionManager.openSettings("location_foreground");
                    alertShown = false;
                  },
                },
              ],
              { cancelable: false }
            );
          }
        } else {
          alertShown = false; // Reset if location is enabled
        }
      } catch (error) {
        console.warn("Location check error:", error);
      }
    };

    checkLocationStatus();
    locationCheckIntervalRef.current = setInterval(checkLocationStatus, 3000);

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        checkLocationStatus();
      }
    });

    return () => {
      if (locationCheckIntervalRef.current) {
        clearInterval(locationCheckIntervalRef.current);
      }
      subscription.remove();
    };
  }, [isOnDuty]);

  useEffect(() => {
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker]);

  // Update location and ping backend (throttled)
  useEffect(() => {
    if (state.status !== "tracking" || !state.lastFix || !session) return;

    const now = Date.now();
    if (now - lastPingAtRef.current < 3000) return;
    lastPingAtRef.current = now;

    void (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const resp = await pingLocation({ session, deviceId, fix: state.lastFix! });
        setFraud({ score: resp.fraudScore, signals: resp.fraudSignals });
      } catch {
        // Silent fail
      }
    })();
  }, [state, session]);

  // Update map camera when location changes (only on native platforms)
  useEffect(() => {
    if (
      Platform.OS !== "web" &&
      state.status === "tracking" &&
      state.lastFix &&
      cameraRef.current
    ) {
      const { lat, lng } = state.lastFix;
      try {
        cameraRef.current.setCamera({
          centerCoordinate: [lng, lat],
          zoomLevel: 16,
          animationDuration: 500,
        });
      } catch (error) {
        console.warn("Map camera update error:", error);
      }
    }
  }, [state.lastFix, state.status]);

  const handleEnableLocation = useCallback(async () => {
    setCheckingLocation(true);
    try {
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else {
        await Linking.openSettings();
      }
    } catch (error) {
      console.error("Failed to open settings:", error);
    } finally {
      setCheckingLocation(false);
    }
  }, []);

  const handleAcceptOrder = useCallback((orderId: string) => {
    acceptOrder.mutate(orderId);
  }, [acceptOrder]);

  const handleRejectOrder = useCallback((orderId: string) => {
    rejectOrder.mutate(orderId);
  }, [rejectOrder]);

  if (state.status === "permission_denied") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 40 }} className="flex-1 bg-white px-4 pt-10">
        <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827' }} className="text-xl font-semibold text-gray-900">{t("location.required")}</Text>
        <Text style={{ marginTop: 8, color: colors.text.primary.light }} className="mt-2 text-text-light">{t("location.permissionDenied")}</Text>
        <Button onPress={handleEnableLocation} style={{ marginTop: 16 }} className="mt-4" disabled={checkingLocation}>
          {t("location.enableLocation")}
        </Button>
      </SafeAreaView>
    );
  }

  if (state.status === "services_disabled") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 40 }} className="flex-1 bg-white px-4 pt-10">
        <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827' }} className="text-xl font-semibold text-gray-900">{t("location.gpsDisabled")}</Text>
        <Text style={{ marginTop: 8, color: colors.text.primary.light }} className="mt-2 text-text-light">{t("location.gpsDisabledMessage")}</Text>
        <Button onPress={() => void tracker.start()} style={{ marginTop: 16 }} className="mt-4">
          {t("location.turnedOn")}
        </Button>
      </SafeAreaView>
    );
  }

  const fix = state.status === "tracking" ? state.lastFix : undefined;
  const isDevice = Platform.OS !== "web";

  // Transform orders to map format with high precision coordinates
  const mapOrders = availableOrders
    .filter((order) => order.pickupLat != null && order.pickupLng != null)
    .map((order) => ({
      id: order.id,
      pickupLat: parseFloat(Number(order.pickupLat).toFixed(7)),
      pickupLng: parseFloat(Number(order.pickupLng).toFixed(7)),
      deliveryLat: order.deliveryLat ? parseFloat(Number(order.deliveryLat).toFixed(7)) : undefined,
      deliveryLng: order.deliveryLng ? parseFloat(Number(order.deliveryLng).toFixed(7)) : undefined,
      estimatedEarning: order.estimatedEarning,
      category: order.category,
      distanceKm: order.distanceKm,
    }));

  // Transform rider location with high precision
  const riderLocation = fix
    ? {
        lat: parseFloat(fix.lat.toFixed(7)),
        lng: parseFloat(fix.lng.toFixed(7)),
        accuracyM: fix.accuracyM,
        speedMps: fix.speedMps,
        heading: fix.heading,
      }
    : undefined;

  return (
    <View style={styles.container}>
      {/* Debug component - remove after fixing */}
      {__DEV__ && <MapboxDebug />}
      
      {/* Map View with Rider and Orders - Always render map, even without location */}
      {isDevice ? (
        <RiderMapView
          riderLocation={riderLocation}
          orders={mapOrders}
          onOrderPress={(orderId) => {
            // Scroll to order card when marker is pressed
            const orderIndex = availableOrders.findIndex((o) => o.id === orderId);
            if (orderIndex >= 0) {
              // Could add scroll to order functionality here
            }
          }}
          style={styles.map}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB' }} className="flex-1 items-center justify-center bg-gray-200">
          {fix ? (
            <>
              <Text style={{ color: colors.text.primary.light, marginBottom: 8 }} className="text-text-light mb-2">{t("location.liveLocation")}</Text>
              <Text style={{ color: colors.text.primary.light }} className="text-text-light">
                {fix.lat.toFixed(7)}, {fix.lng.toFixed(7)}
              </Text>
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary[500]} size="large" />
              <Text style={{ marginTop: 8, color: colors.text.primary.light }} className="mt-2 text-text-light">{t("location.gettingLocation")}</Text>
            </>
          )}
        </View>
      )}

      {/* Top Overlay with Duty Toggle */}
      <View style={styles.topOverlay}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }} className="flex-row items-center justify-between mb-2">
          <Text style={styles.overlayTitle}>{t("location.liveLocation")}</Text>
          <DutyToggle />
        </View>
        <Text style={styles.overlayText}>
          {fix
            ? `Acc: ${Math.round(fix.accuracyM ?? 0)}m · Speed: ${Math.round((fix.speedMps ?? 0) * 3.6)} km/h`
            : t("location.waitingForFix")}
        </Text>
        {!!fraud && (
          <Text style={styles.overlayText}>
            Fraud: {fraud.score} {fraud.signals.length ? `(${fraud.signals.join(", ")})` : ""}
          </Text>
        )}
        {!isOnDuty && (
          <View style={{ marginTop: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }} className="mt-2 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
            <Text style={{ fontSize: 12, fontWeight: '500', color: colors.warning[800] }} className="text-xs font-medium text-warning-800">
              {t("orders.goOnDutyMessage", "Go ON-DUTY to receive orders")}
            </Text>
          </View>
        )}
      </View>

      {/* Order Cards */}
      <ScrollView
        style={styles.orderCardsContainer}
        contentContainerStyle={styles.orderCardsContent}
        showsVerticalScrollIndicator={false}
      >
        {ordersLoading ? (
          <View style={{ padding: 16, backgroundColor: '#FFFFFF', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, alignItems: 'center' }} className="p-4 bg-white rounded-lg shadow-md items-center">
            <ActivityIndicator color={colors.primary[500]} />
            <Text style={{ marginTop: 8, color: '#4B5563' }} className="mt-2 text-gray-600">{t("orders.loading", "Loading orders...")}</Text>
          </View>
        ) : availableOrders.length === 0 ? (
          <View style={{ padding: 16, backgroundColor: '#FFFFFF', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }} className="p-4 bg-white rounded-lg shadow-md">
            <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text.primary.light }} className="text-lg font-semibold text-text-DEFAULT">{t("orders.noOrders")}</Text>
            <Text style={{ color: colors.text.primary.light, marginTop: 4 }} className="text-text-light mt-1">
              {isOnDuty
                ? t("orders.noOrdersMessage")
                : t("orders.goOnDutyMessage", "Go ON-DUTY to receive orders")}
            </Text>
          </View>
        ) : (
          availableOrders.map((order) => (
            <View key={order.id} style={{ padding: 16, backgroundColor: '#FFFFFF', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 12 }} className="p-4 bg-white rounded-lg shadow-md mb-3">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }} className="flex-row items-start justify-between mb-2">
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text.primary.light }} className="text-lg font-semibold text-text-DEFAULT">Order #{order.id.slice(0, 8)}</Text>
                  <Text style={{ fontSize: 14, color: colors.text.primary.light, marginTop: 4 }} className="text-sm text-text-light mt-1">
                    {order.category.toUpperCase()} · ₹{order.estimatedEarning}
                  </Text>
                  {order.distanceKm && (
                    <Text style={{ fontSize: 12, color: colors.text.primary.light, marginTop: 4 }} className="text-xs text-text-light mt-1">{order.distanceKm.toFixed(1)} km away</Text>
                  )}
                </View>
              </View>
              <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }} className="mt-3 flex-row gap-2">
                <Button
                  style={{ flex: 1 }}
                  className="flex-1 bg-primary-DEFAULT"
                  onPress={() => handleAcceptOrder(order.id)}
                  loading={acceptOrder.isPending}
                >
                  {t("orders.accept")}
                </Button>
                <Button
                  variant="outline"
                  style={{ flex: 1 }}
                  className="flex-1"
                  onPress={() => handleRejectOrder(order.id)}
                  disabled={rejectOrder.isPending}
                >
                  {t("orders.reject")}
                </Button>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    borderWidth: 3,
    borderColor: colors.background.light,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  topOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  overlayTitle: {
    fontWeight: "700",
    fontSize: 16,
    color: colors.text.primary.light,
  },
  overlayText: {
    opacity: 0.75,
    fontSize: 13,
    color: colors.text.primary.light,
    marginTop: 2,
  },
  orderCardsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "40%",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  orderCardsContent: {
    paddingTop: 12,
  },
});
