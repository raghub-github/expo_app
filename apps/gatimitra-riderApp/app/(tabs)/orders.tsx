// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Platform,
  AppState,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { createForegroundLocationTracker, getSharedLocationEngine, LOCATION_ENGINE_PROFILES, type LocationTrackerState } from "@/src/services/location/locationTracker";
import { useAvailableOrders, useActiveOrders, useRidePaymentHolds, RIDER_ACTIVE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import { useDemandZones } from "@/src/hooks/useDemandZones";
import { useHotZones } from "@/src/hooks/useHotZones";
import { HighDemandZonesPanel } from "@/src/components/home/HighDemandZonesPanel";
import { resolveRiderHomeChrome } from "@/src/lib/rider-home-chrome";
import { useDutyStatus, RIDER_DUTY_STATUS_QUERY_KEY } from "@/src/hooks/useDutyStatus";
import { mergeRiderBlockedServices, shouldShowAccountRestrictedBanner } from "@/src/lib/rider-blocked-services";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { colors } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { permissionManager } from "@/src/services/permissions/permissionManager";
import { type RiderMapViewHandle } from "@/src/components/RiderMapView";
import { HomeMapHeader, ORDERS_HEADER_BG } from "@/src/components/home/HomeMapHeader";
import { AccountRestrictedBanner, PenaltyBanner, OffDutyBanner, RidePaymentHoldBanner } from "@/src/components/home/HomeAlertBanners";
import {
  HomeAlertBannerCarousel,
  homeBannerDuration,
  type HomeBannerSlide,
} from "@/src/components/home/HomeAlertBannerCarousel";
import { SubscriptionDuesBanner } from "@/src/components/subscription/SubscriptionDuesBanner";
import { openSubscriptionDutyBlockedSheet } from "@/src/stores/subscriptionDutyBlockedSheetStore";
import { showRiderPaymentSuccess } from "@/src/stores/paymentSuccessSheetStore";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { MapRightControls } from "@/src/components/home/MapRightControls";
import { SearchingOrdersPill } from "@/src/components/home/SearchingOrdersPill";
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
  extractRazorpayError,
  isRazorpayUserCancel,
} from "@/src/lib/razorpay-native";
import { useRiderPenaltyPayment } from "@/src/hooks/useRiderPenaltyPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { extractApiErrorMessage } from "@/src/services/http";
import { shouldSkipCoalescedFix, COALESCE_IDLE_HOME_MOVE_M, COALESCE_IDLE_HOME_HEADING_DEG, type CoalesceFixSnapshot } from "@/src/lib/coalesceLocationUi";
import { useHomeMapLocationStore } from "@/src/stores/homeMapLocationStore";
import { HomeDutyMap } from "@/src/components/home/HomeDutyMap";

/** Demand heatmap may use a slightly stale fix; map pin stays on a stricter gate. */
const DEMAND_FIX_MAX_AGE_MS = 5 * 60_000;
/** Screen/demand re-render threshold — coarser than the map pin store. */
const DEMAND_SCREEN_MIN_MOVE_M = 40;
const DEMAND_SCREEN_MIN_HEADING_DEG = 25;

export default function OrdersScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const homeFocused = useIsFocused();
  const { setDuty, isPending: dutyPending, dutyGoOnBlocked } = useDutyToggle();
  const tracker = useMemo(
    () =>
      createForegroundLocationTracker({
        profileId: "orders-map",
        ...LOCATION_ENGINE_PROFILES.dutyIdleBg,
      }),
    []
  );
  const [state, setState] = useState<LocationTrackerState>(tracker.getState());
  const [checkingLocation, setCheckingLocation] = useState(false);
  const mapRef = useRef<RiderMapViewHandle>(null);
  /** Keep last known GPS so home never sits on a blank "Getting location…" state. */
  const stickyFixRef = useRef<
    NonNullable<Extract<LocationTrackerState, { status: "tracking" }>["lastFix"]> | undefined
  >(undefined);

  const queryClient = useQueryClient();
  const { data: availableOrders = [] } = useAvailableOrders();
  const { data: activeOrders = [] } = useActiveOrders();
  const { data: ridePaymentHolds = [] } = useRidePaymentHolds();
  const { data: earnings } = useEarningsSummary();
  const { data: dutyStatus } = useDutyStatus();
  const { data: subscriptionStatus } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const penaltyPayment = useRiderPenaltyPayment();
  const [penaltyPaying, setPenaltyPaying] = useState(false);
  const restrictions = earnings?.accountRestrictions;
  const walletBalance = earnings?.totalBalance ?? 0;
  // Negative-wallet recovery: the ONLY payable amount is the exact current
  // negative balance (read-only). Shown only when the wallet is below zero.
  const negativeWalletDue = walletBalance < 0 ? Math.round(-walletBalance * 100) / 100 : 0;
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
        refreshRestrictionQueries();
        showRiderPaymentSuccess(
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
            { amount: order.amountRupees ?? negativeWalletDue }
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

      if (!isNativeRazorpayAvailable()) {
        Alert.alert(
          t("home.penaltyPayFailedTitle", "Payment failed"),
          t(
            "home.penaltyPayNativeMissing",
            "Native Razorpay is not available in this build. Please install the latest Play Store / APK build (not Expo Go)."
          )
        );
        setPenaltyPaying(false);
        return;
      }

      try {
        const result = await openRazorpayCheckout({
          order: {
            orderId: order.orderId,
            amount: order.amount,
            currency: order.currency,
            keyId: order.keyId,
          },
          prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
          name: "GatiMitra",
          description: "Negative wallet settlement",
          themeColor: "#D4A017",
        });
        await handleVerifyPenaltyPayment(
          result.razorpayOrderId,
          result.razorpayPaymentId,
          result.razorpaySignature
        );
      } catch (rzpErr) {
        const { code, description } = extractRazorpayError(rzpErr);
        void penaltyPayment.recordAttempt
          .mutateAsync({
            razorpayOrderId: order.orderId,
            status: isRazorpayUserCancel(rzpErr) ? "cancelled" : "failed",
            reason: description || code || "cancelled",
          })
          .catch(() => undefined);
        if (!isRazorpayUserCancel(rzpErr)) {
          Alert.alert(
            t("home.penaltyPayFailedTitle", "Payment failed"),
            description ||
              code ||
              t("home.penaltyPayFailedMessage", "Could not start payment. Try again.")
          );
        }
        setPenaltyPaying(false);
      }
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
    negativeWalletDue,
    penaltyPaying,
    penaltyPayment.createOrder,
    penaltyPayment.recordAttempt,
    riderProfile?.name,
    riderProfile?.mobile,
    t,
  ]);
  const subscriptionBannerVisible =
    subscriptionStatus?.dues?.alertBanner?.visible ?? false;
  const subscriptionDispatchBlocked = subscriptionStatus?.dues?.dispatchBlocked ?? false;
  // Avoid stacking two yellow Pay banners for the same ₹ dues (subscription + wallet).
  // Pager dots under Pay looked like a second/duplicate banner.
  const showPenaltyBanner = negativeWalletDue > 0 && !subscriptionBannerVisible;
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

    // Always show subscription dues/pay slide when dues exist — do not hide behind Account Restricted.
    if (subscriptionBannerVisible) {
      slides.push({
        id: "subscription",
        type: "subscription",
        durationMs: homeBannerDuration("subscription"),
        element: <SubscriptionDuesBanner embedded />,
      });
    }

    if (showPenaltyBanner) {
      slides.push({
        id: "penalty",
        type: "penalty",
        durationMs: homeBannerDuration("penalty"),
        element: (
          <PenaltyBanner
            amount={negativeWalletDue}
            paying={penaltyPaying}
            onPay={() => void handlePayPenalty()}
          />
        ),
      });
    }

    if (primaryPaymentHold) {
      slides.push({
        id: "ride_payment_hold",
        type: "ride_payment_hold",
        durationMs: homeBannerDuration("ride_payment_hold"),
        element: <RidePaymentHoldBanner hold={primaryPaymentHold} />,
      });
    }

    return slides;
  }, [
    showServiceRestrictedBanner,
    blockedServices,
    allServicesBlacklisted,
    restrictions?.globalWalletBlock,
    showPenaltyBanner,
    negativeWalletDue,
    penaltyPaying,
    handlePayPenalty,
    primaryPaymentHold,
    subscriptionBannerVisible,
  ]);

  const homeChrome = useMemo(
    () =>
      resolveRiderHomeChrome({
        isOnDuty,
        activeOrders,
        availableOrders,
      }),
    [isOnDuty, activeOrders, availableOrders]
  );

  const demandExtraPoints = useMemo(
    () =>
      homeChrome.fetchDemandZones
        ? availableOrders
            .filter(
              (o) =>
                o.category === "food" &&
                o.pickup?.lat != null &&
                o.pickup?.lng != null &&
                Number.isFinite(Number(o.pickup.lat)) &&
                Number.isFinite(Number(o.pickup.lng))
            )
            .map((o) => ({
              lat: Number(o.pickup.lat),
              lng: Number(o.pickup.lng),
            }))
        : [],
    [availableOrders, homeChrome.fetchDemandZones]
  );

  const rawFixPreview = state.status === "tracking" ? state.lastFix : undefined;
  if (rawFixPreview) stickyFixRef.current = rawFixPreview;
  /**
   * Demand zones accept a slightly older sticky fix so the HDZ banner stays useful
   * while GPS watch briefly stalls.
   */
  const demandFix =
    stickyFixRef.current &&
    Number.isFinite(stickyFixRef.current.tsMs) &&
    Date.now() - stickyFixRef.current.tsMs <= DEMAND_FIX_MAX_AGE_MS
      ? stickyFixRef.current
      : undefined;

  const { zones: demandZones, isLoading: demandZonesLoading } = useDemandZones({
    riderLat: demandFix?.lat,
    riderLng: demandFix?.lng,
    extraPoints: demandExtraPoints,
    enabled: homeChrome.fetchDemandZones,
  });

  // Real backend H3 hot zones for the MAP (replaces the legacy store-cluster circles).
  const { zones: hotZones } = useHotZones({
    riderLat: demandFix?.lat,
    riderLng: demandFix?.lng,
    enabled: homeChrome.fetchDemandZones,
  });

  useFocusEffect(
    useCallback(() => {
      // Light refresh only — avoid invalidating everything on every Orders focus (tab lag).
      void queryClient.refetchQueries({
        queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY,
        type: "active",
        stale: true,
      });
      void queryClient.refetchQueries({
        queryKey: RIDER_DUTY_STATUS_QUERY_KEY,
        type: "active",
        stale: true,
      });
    }, [queryClient])
  );

  useEffect(() => {
    if (!subscriptionDispatchBlocked && !dutyGoOnBlocked) return;
    if (!isOnDuty) return;
    void useDutyStore.getState().setDutyStatus(false);
    void queryClient.invalidateQueries({ queryKey: RIDER_DUTY_STATUS_QUERY_KEY });
  }, [subscriptionDispatchBlocked, dutyGoOnBlocked, isOnDuty, queryClient]);

  const lastEmittedFixRef = useRef<CoalesceFixSnapshot | null>(null);
  const lastScreenFixRef = useRef<CoalesceFixSnapshot | null>(null);

  useEffect(
    () =>
      tracker.subscribe((next) => {
        const nextFix = next.status === "tracking" ? next.lastFix : undefined;
        const now = Date.now();

        // Map pin store — update at idle-home coalesce without re-rendering OrdersScreen.
        if (nextFix) {
          if (
            !shouldSkipCoalescedFix(lastEmittedFixRef.current, nextFix, now, {
              minMoveM: COALESCE_IDLE_HOME_MOVE_M,
              minHeadingDeg: COALESCE_IDLE_HOME_HEADING_DEG,
            })
          ) {
            lastEmittedFixRef.current = {
              lat: nextFix.lat,
              lng: nextFix.lng,
              heading: nextFix.headingDeg,
              atMs: now,
            };
            stickyFixRef.current = nextFix;
            useHomeMapLocationStore.getState().setFix({
              lat: parseFloat(nextFix.lat.toFixed(7)),
              lng: parseFloat(nextFix.lng.toFixed(7)),
              accuracyM: nextFix.accuracyM,
              speedMps: nextFix.speedMps,
              heading: nextFix.headingDeg,
              tsMs: nextFix.tsMs,
            });
          }
        } else if (next.status !== "tracking") {
          lastEmittedFixRef.current = null;
          useHomeMapLocationStore.getState().setFix(null);
        }

        setState((prev) => {
          if (next.status !== prev.status) {
            return next;
          }
          if (!nextFix || prev.status !== "tracking") {
            return prev;
          }
          // Coarse updates only — demand zones / HDZ panel, not the map pin.
          if (
            shouldSkipCoalescedFix(lastScreenFixRef.current, nextFix, now, {
              minMoveM: DEMAND_SCREEN_MIN_MOVE_M,
              minHeadingDeg: DEMAND_SCREEN_MIN_HEADING_DEG,
            })
          ) {
            return prev;
          }
          lastScreenFixRef.current = {
            lat: nextFix.lat,
            lng: nextFix.lng,
            heading: nextFix.headingDeg,
            atMs: now,
          };
          return next;
        });
      }),
    [tracker]
  );

  // Paint last-known coords immediately so home never waits on cold GPS.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60_000,
          requiredAccuracy: 1000,
        });
        if (!lastKnown || cancelled) return;
        const fix = {
          tsMs: lastKnown.timestamp,
          lat: lastKnown.coords.latitude,
          lng: lastKnown.coords.longitude,
          accuracyM: lastKnown.coords.accuracy ?? undefined,
          altitudeM: lastKnown.coords.altitude ?? undefined,
          speedMps: lastKnown.coords.speed ?? undefined,
          headingDeg: lastKnown.coords.heading ?? undefined,
        };
        stickyFixRef.current = fix;
        getSharedLocationEngine().ingestExternalFix(fix);
        useHomeMapLocationStore.getState().setFix({
          lat: parseFloat(fix.lat.toFixed(7)),
          lng: parseFloat(fix.lng.toFixed(7)),
          accuracyM: fix.accuracyM,
          speedMps: fix.speedMps,
          heading: fix.headingDeg,
          tsMs: fix.tsMs,
        });
        setState(getSharedLocationEngine().getState());
      } catch {
        /* tracker.start still runs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOnDuty) return;
    let alertShown = false;
    const checkLocationStatus = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const enabled = await Location.hasServicesEnabledAsync();
        if (status !== "granted") {
          if (!alertShown) {
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
          alertShown = false;
        } else {
          alertShown = false;
          if (tracker.getState().status !== "tracking") void tracker.start();
        }
      } catch (error) {
        console.warn("Location check error:", error);
      }
    };
    void checkLocationStatus();
    // Permission/GPS recovery is AppState-driven. A 5s poll while tracking
    // burned CPU/battery for no UI change (OS dialogs already cover GPS-off).
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") void checkLocationStatus();
    });
    return () => {
      subscription.remove();
    };
  }, [isOnDuty, t, tracker]);

  useEffect(() => {
    const needsWatch = homeFocused && (isOnDuty || activeOrders.length > 0);
    if (!needsWatch) {
      void tracker.stop();
      return;
    }
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker, isOnDuty, activeOrders.length, homeFocused]);

  // Foreground resume: refresh without tearing down the shared watch (keeps last fix).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active") return;
      if (!isOnDuty && activeOrders.length === 0) return;
      void tracker.start();
    });
    return () => sub.remove();
  }, [tracker, isOnDuty, activeOrders.length]);

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

  // Google-Maps-style: pop the native "Turn on location" system dialog IN-APP
  // (Android) instead of dumping the rider on the Settings screen. On success the
  // OS enables GPS and we immediately restart the watch. `enableNetworkProviderAsync`
  // rejects if the rider declines — we swallow that and leave the fallback UI.
  // iOS has no per-app GPS toggle, so fall back to app settings there.
  const handleTurnOnGps = useCallback(async () => {
    setCheckingLocation(true);
    try {
      if (Platform.OS === "android") {
        await Location.enableNetworkProviderAsync();
      } else {
        await Linking.openURL("app-settings:");
      }
      await tracker.start();
    } catch {
      /* rider dismissed the dialog, or it is unavailable — keep the gate UI */
    } finally {
      setCheckingLocation(false);
    }
  }, [tracker]);

  const handleRecenter = useCallback(() => {
    mapRef.current?.recenter();
    if (state.status !== "tracking") void tracker.start();
  }, [state.status, tracker]);

  // GPS-off recovery for the "GPS Disabled" gate. While it is showing:
  //   (1) proactively pop the native turn-on dialog once (like Google Maps), and
  //   (2) keep polling so that if the rider enables GPS by ANY means — the dialog,
  //       the quick-settings shade, or Settings — the map recovers automatically.
  // The engine only re-checks GPS when start() is called; off-duty nothing calls
  // it unless the app is backgrounded+foregrounded, which is why the rider had to
  // kill/reopen. This poll fixes that regardless of duty or AppState.
  const gpsAutoPromptRef = useRef(false);
  useEffect(() => {
    if (state.status !== "services_disabled") {
      gpsAutoPromptRef.current = false;
      return;
    }
    let cancelled = false;

    if (!gpsAutoPromptRef.current && Platform.OS === "android") {
      gpsAutoPromptRef.current = true;
      void handleTurnOnGps();
    }

    const recover = async () => {
      try {
        if (!cancelled && (await Location.hasServicesEnabledAsync())) {
          void tracker.start();
        }
      } catch {
        /* ignore transient errors */
      }
    };
    const intervalId = setInterval(recover, 2500);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void recover();
    });
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      sub.remove();
    };
  }, [state.status, tracker, handleTurnOnGps]);

  const gpsBlocked =
    state.status === "permission_denied" || state.status === "services_disabled";

  const rawFix = state.status === "tracking" ? state.lastFix : undefined;
  if (rawFix) stickyFixRef.current = rawFix;

  const mapOrders = useMemo(
    () =>
      availableOrders
        .filter((order) => order.pickup?.lat != null && order.pickup?.lng != null)
        .map((order) => ({
          id: order.id,
          pickupLat: parseFloat(Number(order.pickup.lat).toFixed(7)),
          pickupLng: parseFloat(Number(order.pickup.lng).toFixed(7)),
          deliveryLat: order.delivery?.lat
            ? parseFloat(Number(order.delivery.lat).toFixed(7))
            : undefined,
          deliveryLng: order.delivery?.lng
            ? parseFloat(Number(order.delivery.lng).toFixed(7))
            : undefined,
          estimatedEarning: order.estimatedEarning,
          category: order.category,
          distanceKm: order.distanceKm,
        })),
    [availableOrders]
  );

  const showOffDutyBanner = homeChrome.showOffDutyBanner;
  const mapHasPin = useHomeMapLocationStore((s) => s.fix != null);

  return (
    <View style={styles.container}>
      {/* Header owns status-bar padding — avoids translucent leftover from splash. */}
      <View style={styles.chrome}>
        <HomeMapHeader />
      </View>
      <View style={styles.bannerHost}>
        <HomeAlertBannerCarousel slides={homeBannerSlides} />
      </View>

      <View style={styles.mapSection}>
        <HomeDutyMap
          ref={mapRef}
          orders={mapOrders}
          style={styles.map}
          paused={!homeFocused}
          showRadar={homeChrome.showSearchingRadar && mapHasPin && !gpsBlocked}
          demandZones={hotZones.length > 0 ? [] : demandZones}
          hotZones={homeChrome.fetchDemandZones ? hotZones : []}
          isOnDuty={isOnDuty}
        />

        {homeChrome.showSearchingPill && !gpsBlocked && homeFocused ? <SearchingOrdersPill /> : null}

        {gpsBlocked ? (
          <View style={styles.gpsOverlay} pointerEvents="box-none">
            <View style={styles.gpsCard}>
              <Text style={styles.permissionTitle}>
                {state.status === "permission_denied"
                  ? t("location.required")
                  : t("location.gpsDisabled")}
              </Text>
              <Text style={styles.permissionSub}>
                {state.status === "permission_denied"
                  ? t("location.permissionDenied")
                  : t("location.gpsDisabledMessage")}
              </Text>
              {state.status === "permission_denied" ? (
                <>
                  <Button
                    onPress={handleEnableLocation}
                    style={{ marginTop: 16 }}
                    disabled={checkingLocation}
                  >
                    {t("location.enableLocation")}
                  </Button>
                  <Button
                    onPress={() => void tracker.start()}
                    variant="outline"
                    style={{ marginTop: 12 }}
                  >
                    {t("location.turnedOn", "I allowed location — retry")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onPress={() => void handleTurnOnGps()}
                    style={{ marginTop: 16 }}
                    disabled={checkingLocation}
                  >
                    {t("location.turnOnGps", "Turn On Location")}
                  </Button>
                  <Button
                    onPress={handleEnableLocation}
                    variant="outline"
                    style={{ marginTop: 12 }}
                    disabled={checkingLocation}
                  >
                    {t("location.openSettings")}
                  </Button>
                </>
              )}
            </View>
          </View>
        ) : null}

        <MapRightControls
          onRecenter={handleRecenter}
          showOffDutyBanner={showOffDutyBanner}
          hasDemandZonesDock={homeChrome.showHighDemandSection}
          showActiveRideFab={homeChrome.showActiveRideFab}
        />

        {homeChrome.showHighDemandSection ? (
          <View style={styles.demandHost} pointerEvents="box-none">
            <HighDemandZonesPanel
              visible
              zones={demandZones}
              isLoading={demandZonesLoading}
              riderLat={demandFix?.lat}
              riderLng={demandFix?.lng}
            />
          </View>
        ) : null}

        {showOffDutyBanner ? (
          <View style={styles.offDutyHost} pointerEvents="box-none">
            <OffDutyBanner
              visible
              dutyLocked={dutyGoOnBlocked || subscriptionDispatchBlocked}
              onTurnOn={() => {
                if (dutyPending) return;
                if (dutyGoOnBlocked || subscriptionDispatchBlocked) {
                  openSubscriptionDutyBlockedSheet();
                  return;
                }
                void setDuty(true).then((result) => {
                  if (result?.blockedFromGoingOn) {
                    openSubscriptionDutyBlockedSheet();
                  }
                });
              }}
              loading={dutyPending}
            />
          </View>
        ) : null}
      </View>
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
    overflow: "hidden",
    minHeight: 0,
  },
  demandHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 24,
  },
  offDutyHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    elevation: 28,
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
  gpsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 16,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    zIndex: 80,
    elevation: 30,
  },
  gpsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
});

