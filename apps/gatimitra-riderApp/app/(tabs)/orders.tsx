import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  AppState,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { createForegroundLocationTracker, type LocationTrackerState } from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";
import { useAvailableOrders, useActiveOrders, useRidePaymentHolds, RIDER_ACTIVE_ORDERS_QUERY_KEY, RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY } from "@/src/hooks/useOrders";
import { useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";
import { ActiveRideResumePill } from "@/src/components/orders/ActiveRideResumePill";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import { useDutyStatus, RIDER_DUTY_STATUS_QUERY_KEY } from "@/src/hooks/useDutyStatus";
import { mergeRiderBlockedServices, shouldShowAccountRestrictedBanner } from "@/src/lib/rider-blocked-services";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { colors } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { RiderMapView, type RiderMapViewHandle } from "@/src/components/RiderMapView";
import { HomeMapHeader, ORDERS_HEADER_BG } from "@/src/components/home/HomeMapHeader";
import { AccountRestrictedBanner, PenaltyBanner, OffDutyBanner, RidePaymentHoldBanner } from "@/src/components/home/HomeAlertBanners";
import {
  HomeAlertBannerCarousel,
  homeBannerDuration,
  type HomeBannerSlide,
} from "@/src/components/home/HomeAlertBannerCarousel";
import { SubscriptionDuesBanner } from "@/src/components/subscription/SubscriptionDuesBanner";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { MapRightControls } from "@/src/components/home/MapRightControls";
import { SearchingOrdersPill } from "@/src/components/home/SearchingOrdersPill";
import { RazorpayCheckoutModal, type RazorpayOrderParams } from "@/src/components/payment/RazorpayCheckoutModal";
import { useRiderPenaltyPayment } from "@/src/hooks/useRiderPenaltyPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { extractApiErrorMessage } from "@/src/services/http";

export default function OrdersScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { setDuty, isPending: dutyPending } = useDutyToggle();
  const tracker = useMemo(() => createForegroundLocationTracker(), []);
  const [state, setState] = useState<LocationTrackerState>(tracker.getState());
  const [checkingLocation, setCheckingLocation] = useState(false);
  const mapRef = useRef<RiderMapViewHandle>(null);

  const queryClient = useQueryClient();
  const { data: availableOrders = [] } = useAvailableOrders();
  const { data: activeOrders = [] } = useActiveOrders();
  const { data: ridePaymentHolds = [] } = useRidePaymentHolds();
  const { data: earnings } = useEarningsSummary();
  const { data: dutyStatus } = useDutyStatus();
  const { data: subscriptionStatus } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const penaltyPayment = useRiderPenaltyPayment();
  const [penaltyCheckout, setPenaltyCheckout] = useState<RazorpayOrderParams | null>(null);
  const [penaltyPaying, setPenaltyPaying] = useState(false);
  const restrictions = earnings?.accountRestrictions;
  const walletBalance = earnings?.totalBalance ?? 0;
  const blockedServices = useMemo(
    () =>
      mergeRiderBlockedServices(
        restrictions?.blacklistBlockedServices,
        dutyStatus?.blockedServiceTypes,
        restrictions?.globalWalletBlock ? ["food", "parcel", "person_ride"] : []
      ),
    [
      restrictions?.blacklistBlockedServices,
      restrictions?.globalWalletBlock,
      dutyStatus?.blockedServiceTypes,
    ]
  );
  const allServicesBlacklisted =
    restrictions?.allServicesBlacklisted ??
    dutyStatus?.allServicesBlacklisted ??
    (restrictions?.globalWalletBlock === true || blockedServices.length >= 3);
  const showServiceRestrictedBanner = shouldShowAccountRestrictedBanner({
    accountRestricted: restrictions?.accountRestricted ?? dutyStatus?.accountRestricted,
    globalWalletBlock: restrictions?.globalWalletBlock,
    blockedServices,
    dutyAccountRestricted: dutyStatus?.accountRestricted,
  });
  const penaltyDue = Math.max(restrictions?.penaltyDue ?? 0, earnings?.locked ?? 0);
  const showPenaltyBanner = walletBalance < 0 && penaltyDue > 0;

  const refreshRestrictionQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
    void queryClient.invalidateQueries({ queryKey: RIDER_DUTY_STATUS_QUERY_KEY });
  }, [queryClient]);

  const handleVerifyPenaltyPayment = useCallback(
    async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) => {
      setPenaltyPaying(true);
      try {
        const result = await penaltyPayment.verifyPayment.mutateAsync({
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        });
        setPenaltyCheckout(null);
        refreshRestrictionQueries();
        Alert.alert(
          t("home.penaltyPaidTitle", "Payment successful"),
          t("home.penaltyPaidMessage", "₹{{amount}} added to your wallet.", {
            amount: Number.isInteger(result.creditedAmount)
              ? result.creditedAmount
              : result.creditedAmount.toFixed(2),
          })
        );
      } catch (err) {
        Alert.alert(
          t("home.penaltyPayFailedTitle", "Payment failed"),
          extractApiErrorMessage(err, t("home.penaltyPayFailedMessage", "Could not verify payment. Try again."))
        );
      } finally {
        setPenaltyPaying(false);
      }
    },
    [penaltyPayment.verifyPayment, refreshRestrictionQueries, t]
  );

  const handlePayPenalty = useCallback(async () => {
    if (penaltyPaying || penaltyPayment.createOrder.isPending) return;
    setPenaltyPaying(true);
    try {
      const order = await penaltyPayment.createOrder.mutateAsync();
      if (!order.success || !order.orderId || !order.keyId) {
        throw new Error(t("home.penaltyPayFailedMessage", "Could not start payment. Try again."));
      }

      if (order.dummyMode || order.keyId === "dummy_key") {
        Alert.alert(
          t("home.penaltyPayTitle", "Pay penalty"),
          t(
            "home.penaltyPayDummyMessage",
            "Dummy payment mode — simulate Razorpay success for ₹{{amount}}?",
            { amount: order.amountRupees ?? penaltyDue }
          ),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel", onPress: () => setPenaltyPaying(false) },
            {
              text: t("home.simulatePayment", "Simulate payment"),
              onPress: () => {
                void handleVerifyPenaltyPayment(order.orderId, `pay_${Date.now()}`, "simulated_signature");
              },
            },
          ]
        );
        return;
      }

      setPenaltyCheckout({
        orderId: order.orderId,
        keyId: order.keyId,
        amount: order.amount,
      });
    } catch (err) {
      Alert.alert(
        t("home.penaltyPayFailedTitle", "Payment failed"),
        extractApiErrorMessage(err, t("home.penaltyPayFailedMessage", "Could not start payment. Try again."))
      );
    } finally {
      setPenaltyPaying(false);
    }
  }, [
    handleVerifyPenaltyPayment,
    penaltyDue,
    penaltyPaying,
    penaltyPayment.createOrder,
    t,
  ]);
  const subscriptionBannerVisible =
    subscriptionStatus?.dues?.alertBanner?.visible ?? false;
  const primaryPaymentHold = ridePaymentHolds[0] ?? null;

  const homeBannerSlides = useMemo((): HomeBannerSlide[] => {
    const slides: HomeBannerSlide[] = [];

    if (showServiceRestrictedBanner) {
      slides.push({
        id: "account_restricted",
        type: "account_restricted",
        durationMs: homeBannerDuration("account_restricted"),
        element: (
          <AccountRestrictedBanner
            blockedServices={blockedServices}
            allServicesBlacklisted={allServicesBlacklisted}
            globalWalletBlock={restrictions?.globalWalletBlock === true}
          />
        ),
      });
    }

    if (showPenaltyBanner) {
      slides.push({
        id: "penalty",
        type: "penalty",
        durationMs: homeBannerDuration("penalty"),
        element: (
          <PenaltyBanner
            amount={penaltyDue}
            paying={penaltyPaying}
            onPay={() => void handlePayPenalty()}
          />
        ),
      });
    }

    if (!showServiceRestrictedBanner && primaryPaymentHold) {
      slides.push({
        id: "ride_payment_hold",
        type: "ride_payment_hold",
        durationMs: homeBannerDuration("ride_payment_hold"),
        element: <RidePaymentHoldBanner hold={primaryPaymentHold} />,
      });
    }

    if (!showServiceRestrictedBanner && subscriptionBannerVisible) {
      slides.push({
        id: "subscription",
        type: "subscription",
        durationMs: homeBannerDuration("subscription"),
        element: <SubscriptionDuesBanner embedded />,
      });
    }

    return slides;
  }, [
    showServiceRestrictedBanner,
    blockedServices,
    allServicesBlacklisted,
    restrictions?.globalWalletBlock,
    showPenaltyBanner,
    penaltyDue,
    penaltyPaying,
    handlePayPenalty,
    primaryPaymentHold,
    subscriptionBannerVisible,
  ]);

  const hasActiveOrder = useMemo(
    () => activeOrders.some(isActiveRiderOrder),
    [activeOrders]
  );

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
      void queryClient.invalidateQueries({ queryKey: RIDER_DUTY_STATUS_QUERY_KEY });
    }, [queryClient])
  );

  const lastPingAtRef = useRef<number>(0);
  const locationCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => tracker.subscribe(setState), [tracker]);

  useEffect(() => {
    if (!isOnDuty) return;
    let alertShown = false;
    const checkLocationStatus = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (status !== "granted" || !enabled) {
          if (!alertShown) {
            alertShown = true;
            Alert.alert(
              t("location.required"),
              enabled ? t("location.permissionDenied") : t("location.servicesMessage"),
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
          alertShown = false;
          if (state.status !== "tracking") void tracker.start();
        }
      } catch (error) {
        console.warn("Location check error:", error);
      }
    };
    void checkLocationStatus();
    locationCheckIntervalRef.current = setInterval(checkLocationStatus, 5000);
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") void checkLocationStatus();
    });
    return () => {
      if (locationCheckIntervalRef.current) clearInterval(locationCheckIntervalRef.current);
      subscription.remove();
    };
  }, [isOnDuty, state.status, t, tracker]);

  useEffect(() => {
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker]);

  useEffect(() => {
    if (state.status !== "tracking" || !state.lastFix || !session || !isOnDuty) return;
    const now = Date.now();
    if (now - lastPingAtRef.current < 3000) return;
    lastPingAtRef.current = now;
    void (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        await pingLocation({ session, deviceId, fix: state.lastFix! });
      } catch {
        // silent
      }
    })();
  }, [state, session, isOnDuty]);

  const handleEnableLocation = useCallback(async () => {
    setCheckingLocation(true);
    try {
      if (Platform.OS === "ios") await Linking.openURL("app-settings:");
      else await Linking.openSettings();
    } catch (error) {
      console.error("Failed to open settings:", error);
    } finally {
      setCheckingLocation(false);
    }
  }, []);

  const handleRecenter = useCallback(() => {
    mapRef.current?.recenter();
    if (state.status !== "tracking") void tracker.start();
  }, [state.status, tracker]);

  if (state.status === "permission_denied") {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Text style={styles.permissionTitle}>{t("location.required")}</Text>
        <Text style={styles.permissionSub}>{t("location.permissionDenied")}</Text>
        <Button onPress={handleEnableLocation} style={{ marginTop: 16 }} disabled={checkingLocation}>
          {t("location.enableLocation")}
        </Button>
        <Button onPress={() => void tracker.start()} variant="outline" style={{ marginTop: 12 }}>
          {t("location.turnedOn", "I allowed location — retry")}
        </Button>
      </SafeAreaView>
    );
  }

  if (state.status === "services_disabled") {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Text style={styles.permissionTitle}>{t("location.gpsDisabled")}</Text>
        <Text style={styles.permissionSub}>{t("location.gpsDisabledMessage")}</Text>
        <Button onPress={() => void tracker.start()} style={{ marginTop: 16 }}>
          {t("location.turnedOn")}
        </Button>
      </SafeAreaView>
    );
  }

  const fix = state.status === "tracking" ? state.lastFix : undefined;
  const isLocating = state.status === "tracking" && !fix;

  const mapOrders = availableOrders
    .filter((order) => order.pickup?.lat != null && order.pickup?.lng != null)
    .map((order) => ({
      id: order.id,
      pickupLat: parseFloat(Number(order.pickup.lat).toFixed(7)),
      pickupLng: parseFloat(Number(order.pickup.lng).toFixed(7)),
      deliveryLat: order.delivery?.lat ? parseFloat(Number(order.delivery.lat).toFixed(7)) : undefined,
      deliveryLng: order.delivery?.lng ? parseFloat(Number(order.delivery.lng).toFixed(7)) : undefined,
      estimatedEarning: order.estimatedEarning,
      category: order.category,
      distanceKm: order.distanceKm,
    }));

  const riderLocation = fix
    ? {
        lat: parseFloat(fix.lat.toFixed(7)),
        lng: parseFloat(fix.lng.toFixed(7)),
        accuracyM: fix.accuracyM,
        speedMps: fix.speedMps,
      }
    : undefined;

  const showOffDutyBanner = !isOnDuty;
  /** Pulse radar whenever ON-DUTY (alert banners must not hide it). */
  const showSearchingRadar = isOnDuty;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor={ORDERS_HEADER_BG} />
      <SafeAreaView edges={["top"]} style={styles.chrome}>
        <HomeMapHeader />
      </SafeAreaView>
      <View style={styles.bannerHost}>
        <HomeAlertBannerCarousel slides={homeBannerSlides} />
      </View>

      <View style={styles.mapSection}>
        <RiderMapView
          ref={mapRef}
          riderLocation={riderLocation}
          orders={mapOrders}
          style={styles.map}
          showRadar={isOnDuty && !!riderLocation}
        />

        {showSearchingRadar ? <SearchingOrdersPill /> : null}
        {hasActiveOrder ? <ActiveRideResumePill /> : null}

        {isLocating ? (
          <View style={styles.locatingPill}>
            <ActivityIndicator size="small" color={colors.primary[500]} />
            <Text style={styles.locatingText}>{t("location.gettingLocation", "Getting your location…")}</Text>
          </View>
        ) : null}

        <MapRightControls
          onRecenter={handleRecenter}
          showOffDutyBanner={showOffDutyBanner}
          hasActiveRideDock={hasActiveOrder}
        />

        {showOffDutyBanner ? (
          <View style={styles.offDutyHost}>
            <OffDutyBanner visible onTurnOn={() => void setDuty(true)} loading={dutyPending} />
          </View>
        ) : null}
      </View>

      <RazorpayCheckoutModal
        visible={penaltyCheckout != null}
        orderParams={penaltyCheckout}
        prefill={{
          contact: riderProfile?.mobile ?? null,
          name: riderProfile?.name ?? null,
        }}
        themeColor="#EAB308"
        onSuccess={(result) => {
          void handleVerifyPenaltyPayment(
            result.razorpayOrderId,
            result.razorpayPaymentId,
            result.razorpaySignature
          );
        }}
        onCancel={() => setPenaltyCheckout(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  mapSection: {
    flex: 1,
    position: "relative",
    overflow: "visible",
  },
  locatingPill: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 8,
  },
  locatingText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.gray[700],
  },
  map: {
    flex: 1,
  },
  chrome: {
    backgroundColor: ORDERS_HEADER_BG,
    zIndex: 100,
    elevation: 0,
  },
  bannerHost: {
    width: "100%",
    alignSelf: "stretch",
    zIndex: 10,
  },
  offDutyHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 12,
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  permissionSub: {
    marginTop: 8,
    color: colors.gray[600],
  },
});

