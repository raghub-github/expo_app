import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  ActiveRideNavigationMap,
  type ActiveRideNavigationMapHandle,
  type MapEdgeInsets,
} from "@/src/components/orders/ActiveRideNavigationMap";
import { PersonRideNavigateBottomSheet } from "@/src/components/orders/PersonRideNavigateBottomSheet";
import type { NavMapViewMode } from "@/src/lib/map-assets";
import {
  FoodNavigateBottomSheet,
  FOOD_NAV_SHEET_COLLAPSED_HEIGHT,
  FOOD_NAV_SHEET_HEIGHT,
} from "@/src/components/orders/FoodNavigateBottomSheet";
import {
  PERSON_RIDE_NAV_SHEET_COLLAPSED_HEIGHT,
  PERSON_RIDE_NAV_SHEET_HEIGHT,
} from "@/src/components/orders/PersonRideNavigateBottomSheet";
import { buildNavMapEdgeInsets } from "@/src/lib/navigation-camera-fit";
import { openGoogleMapsNavigation } from "@/src/lib/open-google-maps-navigation";
import { FoodNavigationMapChrome } from "@/src/components/orders/FoodNavigationMapChrome";
import { FoodPickOrderSheet } from "@/src/components/orders/FoodPickOrderSheet";
import { FoodPickOrderDetailScreen } from "@/src/components/orders/FoodPickOrderDetailScreen";
import { FoodDropOrderScreen } from "@/src/components/orders/FoodDropOrderScreen";
import { RestaurantFeedbackBottomSheet } from "@/src/components/orders/RestaurantFeedbackBottomSheet";
import { CustomerFeedbackBottomSheet } from "@/src/components/orders/CustomerFeedbackBottomSheet";
import { FoodPickupVerificationScreen } from "@/src/components/orders/FoodPickupVerificationScreen";
import { FoodBarcodeScannerScreen } from "@/src/components/orders/FoodBarcodeScannerScreen";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { createForegroundLocationTracker, type LocationTrackerState } from "@/src/services/location/locationTracker";
import {
  getNavigationRouteToPickup,
  latLngFromRider,
  type LatLng,
  type NavigationRoute,
} from "@/src/services/maps/directions.service";
import {
  useRideOrder,
  syncRiderOrderDetailCache,
  useReachedPickup,
  useSubmitMerchantPickupFeedback,
  useSubmitCustomerDeliveryFeedback,
  useReachedCustomer,
  useCancelAssignedRide,
  useVerifyPickupOtp,
  useVerifyPickupBarcode,
  useFoodPickupVerificationSettings,
  useMarkFoodPickup,
  useStartRide,
  useCompleteRide,
  useVerifyDeliveryOtp,
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
} from "@/src/hooks/useOrders";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { useQueryClient } from "@tanstack/react-query";
import { buildFoodDeliverySuccessParams } from "@/src/lib/food-delivery-success-nav";
import { buildRideDeliverySuccessParams } from "@/src/lib/ride-delivery-success-nav";
import { useNavScreenBottomInset } from "@/src/hooks/useRiderBottomInset";
import { useMilestoneGeoFence } from "@/src/hooks/useMilestoneGeoFence";
import { resolveMilestoneGeoUi } from "@/src/lib/milestone-geo-hint";
import { RiderRideCancelReasonSheet } from "@/src/components/orders/RiderRideCancelReasonSheet";
import { PickupUpdatedBanner } from "@/src/components/orders/PickupUpdatedBanner";
import { PickupOtpBottomSheet } from "@/src/components/orders/PickupOtpBottomSheet";
import {
  FoodDeliveryConfirmBottomSheet,
} from "@/src/components/orders/FoodDeliveryConfirmBottomSheet";
import { captureDeliveryProofPhoto } from "@/src/lib/capture-delivery-proof-photo";
import { buildOrderDeliveryProofKey, uploadToR2 } from "@/src/services/storage/cloudflareR2";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useSmoothedRiderPosition } from "@/src/hooks/useSmoothedRiderPosition";
import { extractApiErrorMessage } from "@/src/services/http";
import {
  splitRouteProgress,
  etaMinutesFromMeters,
  analyzeRiderOnRoute,
  buildRiderRouteConnectorGeoJson,
  OFF_ROUTE_REROUTE_M,
} from "@/src/lib/navigation-route-progress";
import {
  resolveCustomerDropPin,
  resolveRestaurantPickupPin,
  resolveRidePickupPin,
} from "@/src/lib/order-map-coordinates";

type Props = {
  orderId: string;
  mode?: "ride" | "food";
};

function compactAddress(raw: string): { line1: string; landmark?: string } {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 2) {
    return { line1: parts.join(", ") || raw };
  }
  return {
    line1: parts.slice(0, 2).join(", "),
    landmark: parts.slice(2).join(", "),
  };
}

export function ActiveRideNavigationScreen({ orderId, mode = "ride" }: Props) {
  const isFoodOrder = mode === "food";
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<ActiveRideNavigationMapHandle>(null);
  const tracker = useMemo(
    () =>
      createForegroundLocationTracker({
        timeIntervalMs: 800,
        distanceIntervalM: 2,
        minAccuracyM: 80,
      }),
    []
  );
  const [trackerState, setTrackerState] = useState<LocationTrackerState>(tracker.getState());
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState(false);
  const lastRouteFromRef = useRef<string | null>(null);
  const lastPickupKeyRef = useRef<string | null>(null);
  const routeFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offRouteRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadRouteRef = useRef(false);
  const [previousPickup, setPreviousPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupBannerVisible, setPickupBannerVisible] = useState(false);
  const [pickupBannerMessage, setPickupBannerMessage] = useState<string | undefined>(
    undefined
  );
  const [cameraFitTrigger, setCameraFitTrigger] = useState(0);
  const [mapFollowEnabled, setMapFollowEnabled] = useState(true);
  const [mapViewMode, setMapViewMode] = useState<NavMapViewMode>("street");
  const initialNavCamDoneRef = useRef(false);
  const userControllingMapRef = useRef(false);
  const autoFollowResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: order, isLoading, isError } = useRideOrder(orderId, {
    refetchInterval: isFoodOrder ? 5000 : 8000,
  });
  const reachedPickup = useReachedPickup();
  const submitMerchantFeedback = useSubmitMerchantPickupFeedback();
  const submitCustomerFeedback = useSubmitCustomerDeliveryFeedback();
  const reachedCustomer = useReachedCustomer();
  const cancelAssigned = useCancelAssignedRide();
  const verifyPickupOtp = useVerifyPickupOtp();
  const verifyPickupBarcode = useVerifyPickupBarcode();
  const markFoodPickup = useMarkFoodPickup();
  const { data: pickupVerificationSettings } = useFoodPickupVerificationSettings();
  const startRide = useStartRide();
  const completeRide = useCompleteRide();
  const verifyDeliveryOtp = useVerifyDeliveryOtp();
  const queryClient = useQueryClient();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [otpSheetOpen, setOtpSheetOpen] = useState(false);
  const [deliveryOtpSheetOpen, setDeliveryOtpSheetOpen] = useState(false);
  /** Local capture only until delivery OTP is verified; R2 + DB happen on OTP submit. */
  const [deliveryProof, setDeliveryProof] = useState<{ localUri: string } | null>(null);
  const [deliveryPhotoUploading, setDeliveryPhotoUploading] = useState(false);
  const session = useSessionStore((s) => s.session);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResetKey, setOtpResetKey] = useState(0);
  const [reachSliderDone, setReachSliderDone] = useState(false);
  const [pickOrderSheetDismissed, setPickOrderSheetDismissed] = useState(false);
  const [pickOrderDetailOpen, setPickOrderDetailOpen] = useState(false);
  const [restaurantFeedbackOpen, setRestaurantFeedbackOpen] = useState(false);
  const [pickupVerificationOpen, setPickupVerificationOpen] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const foodPickupOtpFromVerificationRef = useRef(false);
  const prevFoodPickupMarkedRef = useRef<boolean | null>(null);
  const prevReachSliderDoneRef = useRef(false);
  const [navSheetExpanded, setNavSheetExpanded] = useState(true);
  const [dropOrderScreenOpen, setDropOrderScreenOpen] = useState(false);
  const [customerFeedbackOpen, setCustomerFeedbackOpen] = useState(false);
  const deliveredOrderForSuccessRef = useRef<RiderOrderSummary | null>(null);
  const sheetBottomInset = useNavScreenBottomInset();
  const riderFix = trackerState.status === "tracking" ? trackerState.lastFix : undefined;
  const smoothDurationMs = useMemo(() => {
    const speed = riderFix?.speedMps;
    if (speed == null || speed < 0.5) return 550;
    if (speed < 3) return 420;
    if (speed < 8) return 320;
    return 240;
  }, [riderFix?.speedMps]);

  const smoothedRider = useSmoothedRiderPosition(
    riderFix
      ? {
          lat: riderFix.lat,
          lng: riderFix.lng,
          headingDeg: riderFix.headingDeg,
          speedMps: riderFix.speedMps,
        }
      : undefined,
    smoothDurationMs
  );

  const riderLocation = smoothedRider
    ? { lat: smoothedRider.lat, lng: smoothedRider.lng, headingDeg: smoothedRider.headingDeg }
    : undefined;

  const { byMilestone: milestoneGeo } = useMilestoneGeoFence(
    orderId,
    riderLocation ? { lat: riderLocation.lat, lng: riderLocation.lng } : undefined
  );

  const riderForRoute = riderFix
    ? { lat: riderFix.lat, lng: riderFix.lng }
    : undefined;

  const pickup = order?.pickup;
  const delivery = order?.delivery;
  const pickupConfirmed = isFoodOrder ? !!order?.atPickup : !!order?.pickupOtpVerified;
  const pickupOtpVerified = !!order?.pickupOtpVerified;

  useEffect(() => {
    if (isFoodOrder) {
      setReachSliderDone(!!order?.atPickup);
    } else if (order?.pickupOtpVerified) {
      setReachSliderDone(true);
    }
  }, [isFoodOrder, order?.atPickup, order?.pickupOtpVerified]);

  const foodOrderStatus = (order?.foodOrderStatus ?? "").trim().toUpperCase();
  const coreOrderStatus = (order?.status ?? "").toLowerCase();
  const rideStarted = isFoodOrder
    ? !!order?.rideStarted &&
      (foodOrderStatus === "OUT_FOR_DELIVERY" ||
        coreOrderStatus === "in_transit" ||
        coreOrderStatus === "delivered")
    : !!order?.rideStarted;
  /** Food: rider confirmed Mark Pickup (OTP) — not merchant Dispatch Ready alone. */
  const foodPickupMarked =
    isFoodOrder &&
    (coreOrderStatus === "in_transit" ||
      coreOrderStatus === "picked_up" ||
      coreOrderStatus === "delivered");
  const showDropOnMap = isFoodOrder ? foodPickupMarked : rideStarted;
  const foodDeliveryActive = isFoodOrder ? foodPickupMarked : rideStarted;
  const atCustomer = !!order?.atCustomer;
  const orderDelivered = order?.status === "delivered";

  const showRestaurantFeedbackSheet =
    isFoodOrder &&
    restaurantFeedbackOpen &&
    order?.merchantFeedbackSubmitted !== true &&
    !orderDelivered;

  const showFoodPickOrderSheet =
    isFoodOrder &&
    reachSliderDone &&
    !pickOrderSheetDismissed &&
    !pickOrderDetailOpen &&
    !foodDeliveryActive &&
    !orderDelivered &&
    !otpSheetOpen &&
    !showRestaurantFeedbackSheet &&
    !pickupVerificationOpen &&
    !barcodeScannerOpen;

  useEffect(() => {
    if (!isFoodOrder || foodDeliveryActive || orderDelivered) {
      prevReachSliderDoneRef.current = reachSliderDone;
      return;
    }
    if (reachSliderDone && !prevReachSliderDoneRef.current) {
      setPickOrderSheetDismissed(false);
      setNavSheetExpanded(false);
    }
    prevReachSliderDoneRef.current = reachSliderDone;
  }, [isFoodOrder, reachSliderDone, foodDeliveryActive, orderDelivered]);

  useEffect(() => {
    if (foodDeliveryActive || otpSheetOpen) {
      setPickOrderDetailOpen(false);
    }
  }, [foodDeliveryActive, otpSheetOpen]);

  useEffect(() => {
    if (!isFoodOrder) return;
    if (atCustomer && !orderDelivered) {
      setDropOrderScreenOpen(true);
      setNavSheetExpanded(false);
    }
    if (orderDelivered) {
      setDropOrderScreenOpen(false);
    }
  }, [isFoodOrder, atCustomer, orderDelivered]);

  useEffect(() => {
    if (!isFoodOrder || !order || orderDelivered) return;
    const nowPickedUp = foodPickupMarked;
    const prev = prevFoodPickupMarkedRef.current;
    prevFoodPickupMarkedRef.current = nowPickedUp;
    if (prev === null) return;
    if (!prev && nowPickedUp && order.merchantFeedbackSubmitted !== true) {
      setRestaurantFeedbackOpen(true);
    }
  }, [isFoodOrder, order, foodPickupMarked, orderDelivered]);

  useEffect(() => {
    if (isFoodOrder && reachSliderDone && order?.merchantOrderReady) {
      setPickOrderSheetDismissed(false);
    }
  }, [isFoodOrder, reachSliderDone, order?.merchantOrderReady]);

  const riderGps = useCallback(() => {
    const fix = trackerState.status === "tracking" ? trackerState.lastFix : undefined;
    if (!fix) return undefined;
    return { lat: fix.lat, lng: fix.lng };
  }, [trackerState]);

  const customerDropPin = useMemo(() => resolveCustomerDropPin(order), [order]);
  const restaurantPickupPin = useMemo(() => resolveRestaurantPickupPin(order), [order]);
  const ridePickupPin = useMemo(() => resolveRidePickupPin(order), [order]);

  const navDestination = useMemo(() => {
    if (showDropOnMap) {
      const drop = customerDropPin;
      if (drop) {
        return {
          lat: drop.lat,
          lng: drop.lng,
          address: drop.address ?? delivery?.address ?? "",
          mapLabel: "Drop" as const,
        };
      }
      return null;
    }
    const pickupPin = isFoodOrder ? restaurantPickupPin : ridePickupPin;
    if (!pickupPin) return null;
    return {
      lat: pickupPin.lat,
      lng: pickupPin.lng,
      address: pickupPin.address ?? pickup?.address ?? "",
      mapLabel: "Pickup" as const,
    };
  }, [
    showDropOnMap,
    isFoodOrder,
    customerDropPin,
    restaurantPickupPin,
    ridePickupPin,
    delivery?.address,
    pickup?.address,
  ]);

  useEffect(() => tracker.subscribe(setTrackerState), [tracker]);
  useEffect(() => {
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [tracker]);

  const fetchRoute = useCallback(
    async (force = false) => {
      const navRider = riderForRoute ?? riderLocation;
      if (!navRider || !navDestination) return;

      const pickupLat = Number(navDestination.lat);
      const pickupLng = Number(navDestination.lng);
      if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || (pickupLat === 0 && pickupLng === 0)) {
        setRoute(null);
        setRouteError(true);
        setRouteLoading(false);
        return;
      }

      const fromKey = `${pickupLat.toFixed(5)},${pickupLng.toFixed(5)}|${navRider.lat.toFixed(3)},${navRider.lng.toFixed(3)}`;
      if (!force && lastRouteFromRef.current === fromKey) return;

      const isInitialRoute = !route?.coordinates?.length;
      if (isInitialRoute) setRouteLoading(true);
      setRouteError(false);
      try {
        const result = await getNavigationRouteToPickup(
          latLngFromRider(navRider.lat, navRider.lng),
          latLngFromRider(pickupLat, pickupLng),
          order?.rideType
        );
        if (result) {
          setRoute(result);
          lastRouteFromRef.current = fromKey;
        } else {
          setRoute(null);
          setRouteError(true);
        }
      } catch {
        setRoute(null);
        setRouteError(true);
      } finally {
        setRouteLoading(false);
      }
    },
    [riderForRoute, riderLocation, navDestination, order?.rideType, route?.coordinates?.length]
  );

  useEffect(() => {
    if (!showDropOnMap) return;
    lastRouteFromRef.current = null;
    void fetchRoute(true);
  }, [showDropOnMap, delivery?.lat, delivery?.lng, fetchRoute]);

  useEffect(() => {
    const hasRoute = (route?.coordinates?.length ?? 0) > 0;
    if (hasRoute && !hadRouteRef.current) {
      hadRouteRef.current = true;
      setCameraFitTrigger((n) => n + 1);
    }
    if (!hasRoute) hadRouteRef.current = false;
  }, [route?.coordinates?.length]);

  useEffect(() => {
    if (!navDestination?.lat || !navDestination?.lng) return;
    const pickupKey = `${navDestination.lat.toFixed(5)},${navDestination.lng.toFixed(5)}`;
    const prev = lastPickupKeyRef.current;
    if (prev && prev !== pickupKey) {
      setPreviousPickup(() => {
        const [lat, lng] = prev.split(",").map(Number);
        return { lat, lng };
      });
      setPickupBannerMessage(
        t("orders.activeFood.pickupLocationUpdated", "Pickup location updated")
      );
      setPickupBannerVisible(true);
      lastRouteFromRef.current = null;
      setCameraFitTrigger((n) => n + 1);
      void fetchRoute(true);
    }
    lastPickupKeyRef.current = pickupKey;
  }, [navDestination?.lat, navDestination?.lng, fetchRoute, t]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination) return;
    if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);
    routeFetchTimerRef.current = setTimeout(() => {
      void fetchRoute();
    }, 300);
    return () => {
      if (routeFetchTimerRef.current) clearTimeout(routeFetchTimerRef.current);
    };
  }, [navDestination?.lat, navDestination?.lng, fetchRoute]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination || route?.coordinates?.length) return;
    void fetchRoute();
  }, [
    riderForRoute?.lat,
    riderForRoute?.lng,
    navDestination?.lat,
    navDestination?.lng,
    route?.coordinates?.length,
    fetchRoute,
  ]);

  const routeDeviation = useMemo(() => {
    if (!route?.coordinates?.length || !riderLocation) return null;
    return analyzeRiderOnRoute(route.coordinates, {
      latitude: riderLocation.lat,
      longitude: riderLocation.lng,
      headingDeg: riderLocation.headingDeg,
    });
  }, [route?.coordinates, riderLocation?.lat, riderLocation?.lng, riderLocation?.headingDeg]);

  useEffect(() => {
    const navRider = riderForRoute ?? riderLocation;
    if (!navRider || !navDestination || !route?.coordinates?.length) return;

    const deviation = analyzeRiderOnRoute(route.coordinates, {
      latitude: navRider.lat,
      longitude: navRider.lng,
      headingDeg: "headingDeg" in navRider ? navRider.headingDeg : riderLocation?.headingDeg,
    });
    if (!deviation) return;

    const shouldReroute =
      deviation.offRouteM > OFF_ROUTE_REROUTE_M ||
      (deviation.wrongWay && deviation.offRouteM > 12);

    if (!shouldReroute) return;

    lastRouteFromRef.current = null;
    if (offRouteRefetchTimerRef.current) clearTimeout(offRouteRefetchTimerRef.current);
    offRouteRefetchTimerRef.current = setTimeout(() => {
      void fetchRoute(true);
    }, deviation.wrongWay ? 1400 : 1800);

    return () => {
      if (offRouteRefetchTimerRef.current) clearTimeout(offRouteRefetchTimerRef.current);
    };
  }, [
    riderForRoute?.lat,
    riderForRoute?.lng,
    riderLocation?.lat,
    riderLocation?.lng,
    riderLocation?.headingDeg,
    navDestination,
    route?.coordinates,
    fetchRoute,
  ]);

  const routeProgress = useMemo(() => {
    const navRider = riderLocation ?? riderForRoute;
    if (!route?.coordinates?.length || !navRider) {
      return {
        traveled: [] as LatLng[],
        remaining: route?.coordinates ?? [],
        remainingDistanceM: (route?.distanceKm ?? 0) * 1000,
        frontWheel: undefined as LatLng | undefined,
        routeJoinPoint: undefined as LatLng | undefined,
      };
    }
    const split = splitRouteProgress(route.coordinates, {
      latitude: navRider.lat,
      longitude: navRider.lng,
      headingDeg: "headingDeg" in navRider ? navRider.headingDeg : undefined,
    });
    return {
      traveled: split.traveled,
      remaining: split.remaining,
      remainingDistanceM: split.remainingDistanceM,
      frontWheel: split.frontWheel,
      routeJoinPoint: split.routeJoinPoint,
    };
  }, [route?.coordinates, route?.distanceKm, riderForRoute, riderLocation]);

  const riderRouteConnectorGeoJson = useMemo(() => {
    const join = routeProgress.routeJoinPoint;
    const pos = riderLocation ?? riderForRoute;
    if (!join || !pos) return null;
    return buildRiderRouteConnectorGeoJson(
      { latitude: pos.lat, longitude: pos.lng },
      join
    );
  }, [
    routeProgress.routeJoinPoint,
    riderLocation?.lat,
    riderLocation?.lng,
    riderForRoute?.lat,
    riderForRoute?.lng,
  ]);

  const liveEtaMinutes = useMemo(
    () => etaMinutesFromMeters(routeProgress.remainingDistanceM),
    [routeProgress.remainingDistanceM]
  );

  const liveDistanceKm = useMemo(
    () => Math.max(0.1, routeProgress.remainingDistanceM / 1000),
    [routeProgress.remainingDistanceM]
  );

  const metersToPickup = useMemo(() => {
    if (!riderLocation || !navDestination) return null;
    return Math.round(routeProgress.remainingDistanceM);
  }, [riderLocation, navDestination, routeProgress.remainingDistanceM]);

  const mapRiderLocation = useMemo(() => {
    if (riderLocation) return riderLocation;
    if (!riderForRoute) return undefined;
    return {
      lat: riderForRoute.lat,
      lng: riderForRoute.lng,
      headingDeg: riderFix?.headingDeg,
    };
  }, [riderLocation, riderForRoute, riderFix?.headingDeg]);

  const navigationFollowMode =
    !!mapRiderLocation && (route?.coordinates?.length ?? 0) >= 2;

  const mapNavigationFollowMode = navigationFollowMode && mapFollowEnabled;

  const handleUserMapGesture = useCallback(() => {
    userControllingMapRef.current = true;
    setMapFollowEnabled(false);
  }, []);

  const releaseMapFollow = useCallback(() => {
    userControllingMapRef.current = true;
    setMapFollowEnabled(false);
  }, []);

  const handleMapRecenter = useCallback(() => {
    userControllingMapRef.current = false;
    setMapFollowEnabled(true);
    mapRef.current?.recenter(true);
  }, []);

  const handleMapRouteOverview = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.showRouteOverview();
  }, [releaseMapFollow]);

  const handleToggleMapView = useCallback(() => {
    releaseMapFollow();
    setMapViewMode((m) => (m === "navigation" ? "street" : "navigation"));
  }, [releaseMapFollow]);

  const handleMapZoomIn = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.zoomIn();
  }, [releaseMapFollow]);

  const handleMapZoomOut = useCallback(() => {
    releaseMapFollow();
    mapRef.current?.zoomOut();
  }, [releaseMapFollow]);

  useEffect(() => {
    if (!navigationFollowMode || !riderLocation) return;
    const speedMps = riderFix?.speedMps;
    if (speedMps == null || speedMps < 0.35) return;

    if (!userControllingMapRef.current) {
      setMapFollowEnabled(true);
      return;
    }

    if (autoFollowResumeTimerRef.current) clearTimeout(autoFollowResumeTimerRef.current);
    autoFollowResumeTimerRef.current = setTimeout(() => {
      const latestSpeed = trackerState.status === "tracking" ? trackerState.lastFix?.speedMps : null;
      if (latestSpeed != null && latestSpeed >= 0.35) {
        userControllingMapRef.current = false;
        setMapFollowEnabled(true);
        mapRef.current?.recenter(true);
      }
    }, 3500);

    return () => {
      if (autoFollowResumeTimerRef.current) clearTimeout(autoFollowResumeTimerRef.current);
    };
  }, [
    navigationFollowMode,
    riderLocation?.lat,
    riderLocation?.lng,
    riderFix?.speedMps,
    trackerState.status,
    trackerState.lastFix?.speedMps,
  ]);

  const sheetTitle = useMemo(() => {
    if (isFoodOrder) {
      if (orderDelivered) {
        return t("orders.activeFood.orderDeliveredTitle", "Order delivered");
      }
      if (foodDeliveryActive) {
        if (atCustomer) {
          return t("orders.activeFood.atCustomerDeliver", "Complete delivery");
        }
        return t("orders.activeFood.deliveryInProgress", "Delivery in progress");
      }
      if (pickupConfirmed) {
        return t("orders.activeFood.atRestaurantPickup", "Mark pickup at restaurant");
      }
      return t("orders.activeFood.navigateRestaurant", "Navigate to restaurant");
    }
    if (orderDelivered) {
      return t("orders.activeRide.rideDeliveredTitle", "Ride completed");
    }
    if (rideStarted) {
      if (atCustomer) {
        return t("orders.activeRide.completeRideAtDrop", "Complete ride at drop");
      }
      return t("orders.activeRide.navigateDrop", "Navigate to drop");
    }
    if (reachSliderDone && !pickupOtpVerified) {
      return t("orders.activeRide.verifyPickupOtpTitle", "Submit pickup OTP");
    }
    if (pickupOtpVerified && !rideStarted) {
      return t("orders.activeRide.startRideTitle", "Start ride");
    }
    if (pickupOtpVerified) {
      return t("orders.activeRide.atPickupHeading", "You are at pickup");
    }
    return t("orders.activeRide.navigatePickup", "Navigate to pickup");
  }, [
    isFoodOrder,
    foodDeliveryActive,
    reachSliderDone,
    pickupOtpVerified,
    rideStarted,
    atCustomer,
    orderDelivered,
    pickupConfirmed,
    t,
  ]);

  const navHeaderTitle = useMemo(() => {
    const onDropLeg = isFoodOrder ? foodDeliveryActive : rideStarted;
    if (onDropLeg) {
      return t("orders.activeNav.reachDrop", "Reach drop");
    }
    return t("orders.activeNav.reachPickup", "Reach pickup");
  }, [isFoodOrder, foodDeliveryActive, rideStarted, t]);

  const handleCallCustomer = useCallback(() => {
    const phone = order?.customerPhone?.trim();
    if (!phone) {
      Alert.alert(
        t("orders.activeRide.noPhoneTitle", "Phone unavailable"),
        t("orders.activeRide.noPhoneMessage", "Customer phone number is not available for this ride.")
      );
      return;
    }
    void Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert(
        t("orders.activeRide.callFailedTitle", "Could not call"),
        t("orders.activeRide.callFailedMessage", "Unable to open the phone dialer.")
      );
    });
  }, [order?.customerPhone, t]);

  const handleChatCustomer = useCallback(() => {
    Alert.alert(
      t("orders.activeRide.chatSoonTitle", "Chat coming soon"),
      t(
        "orders.activeRide.chatSoonMessage",
        "In-app chat with customers will be available in a future update."
      )
    );
  }, [t]);

  const handleReachedPickup = useCallback(() => {
    const gps = riderGps();
    reachedPickup.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setReachSliderDone(true);
          if (!isFoodOrder) {
            const otpGeo = resolveMilestoneGeoUi(
              milestoneGeo?.pickup_confirmation,
              "pickup_confirmation"
            );
            if (!otpGeo.locked) {
              setNavSheetExpanded(false);
              setOtpError(null);
              setOtpResetKey((k) => k + 1);
              setOtpSheetOpen(true);
            }
          }
        },
        onError: (err) => {
          setReachSliderDone(false);
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeRide.updateFailedMessage", "Could not mark reached pickup. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedPickup, isFoodOrder, riderGps, milestoneGeo?.pickup_confirmation, t]);

  const handleReachStore = useCallback(() => {
    const gps = riderGps();
    reachedPickup.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setReachSliderDone(true);
          setPickOrderSheetDismissed(false);
          setNavSheetExpanded(false);
        },
        onError: (err) => {
          setReachSliderDone(false);
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.reachStoreFailed", "Could not mark reached store. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedPickup, riderGps, t]);

  const closeRestaurantFeedback = useCallback(() => {
    setRestaurantFeedbackOpen(false);
  }, []);

  const navigateToFoodDeliverySuccess = useCallback(
    (deliveredOrder: RiderOrderSummary) => {
      void tracker.stop();
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
      router.replace({
        pathname: "/food-delivery-success",
        params: buildFoodDeliverySuccessParams(deliveredOrder),
      });
    },
    [orderId, queryClient, tracker]
  );

  const finishCustomerFeedbackAndShowSuccess = useCallback(() => {
    const deliveredOrder = deliveredOrderForSuccessRef.current;
    setCustomerFeedbackOpen(false);
    deliveredOrderForSuccessRef.current = null;
    if (deliveredOrder) {
      navigateToFoodDeliverySuccess(deliveredOrder);
    } else {
      router.replace("/(tabs)/orders");
    }
  }, [navigateToFoodDeliverySuccess]);

  const closeCustomerFeedback = useCallback(() => {
    setCustomerFeedbackOpen(false);
    finishCustomerFeedbackAndShowSuccess();
  }, [finishCustomerFeedbackAndShowSuccess]);

  const handleRestaurantFeedbackSkip = useCallback(() => {
    submitMerchantFeedback.mutate(
      { orderId, skipped: true },
      {
        onSuccess: closeRestaurantFeedback,
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, submitMerchantFeedback, closeRestaurantFeedback, t]);

  const handleRestaurantFeedbackSubmit = useCallback(
    (payload: { rating: number; tags: string[] }) => {
      submitMerchantFeedback.mutate(
        { orderId, rating: payload.rating, tags: payload.tags },
        {
          onSuccess: closeRestaurantFeedback,
          onError: (err) => {
            Alert.alert(
              t("orders.activeRide.updateFailedTitle", "Update failed"),
              extractApiErrorMessage(
                err,
                t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
              )
            );
          },
        }
      );
    },
    [orderId, submitMerchantFeedback, closeRestaurantFeedback, t]
  );

  const handleCustomerFeedbackSkip = useCallback(() => {
    submitCustomerFeedback.mutate(
      { orderId, skipped: true },
      {
        onSuccess: closeCustomerFeedback,
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, submitCustomerFeedback, closeCustomerFeedback, t]);

  const handleCustomerFeedbackSubmit = useCallback(
    (payload: { rating: number; tags: string[]; comment?: string }) => {
      submitCustomerFeedback.mutate(
        {
          orderId,
          rating: payload.rating,
          tags: payload.tags,
          comment: payload.comment,
        },
        {
          onSuccess: closeCustomerFeedback,
          onError: (err) => {
            Alert.alert(
              t("orders.activeRide.updateFailedTitle", "Update failed"),
              extractApiErrorMessage(
                err,
                t("orders.activeFood.feedbackFailed", "Could not save feedback. Try again.")
              )
            );
          },
        }
      );
    },
    [orderId, submitCustomerFeedback, closeCustomerFeedback, t]
  );

  const handlePickOrderConfirm = useCallback(() => {
    if (!order?.merchantOrderReady) return;
    setPickOrderSheetDismissed(true);
    setPickOrderDetailOpen(true);
  }, [order?.merchantOrderReady]);

  const barcodeVerificationEnabled = pickupVerificationSettings?.barcodeEnabled !== false;
  const otpVerificationEnabled = pickupVerificationSettings?.otpEnabled !== false;
  const pickupVerificationRequired = pickupVerificationSettings?.verificationRequired !== false;

  const handleFoodPickupVerificationSuccess = useCallback(
    (data?: { merchantFeedbackSubmitted?: boolean }) => {
      setPickupVerificationOpen(false);
      setBarcodeScannerOpen(false);
      setBarcodeError(null);
      setOtpSheetOpen(false);
      foodPickupOtpFromVerificationRef.current = false;
      setPickOrderDetailOpen(false);
      setPickOrderSheetDismissed(true);
      setPickupBannerMessage(
        t(
          "orders.activeFood.pickupMarkedSuccess",
          "Order picked up — navigate to customer"
        )
      );
      setPickupBannerVisible(true);
      setCameraFitTrigger((n) => n + 1);
      if (data?.merchantFeedbackSubmitted !== true) {
        setRestaurantFeedbackOpen(true);
      }
    },
    [t]
  );

  const completeFoodPickupVerification = useCallback(
    (data: RiderOrderSummary) => {
      syncRiderOrderDetailCache(queryClient, orderId, data);
      handleFoodPickupVerificationSuccess(data);
    },
    [queryClient, orderId, handleFoodPickupVerificationSuccess]
  );

  const beginPickupFlow = useCallback(() => {
    if (!order?.merchantOrderReady) return;
    setPickOrderDetailOpen(false);
    setBarcodeError(null);

    if (!pickupVerificationRequired) {
      const gps = riderGps();
      void markFoodPickup
        .mutateAsync({ orderId, ...gps, deviceTimestamp: new Date().toISOString() })
        .then((data) => completeFoodPickupVerification(data))
        .catch((err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeFood.pickupMarkFailed", "Could not mark order picked up. Try again.")
            )
          );
        });
      return;
    }

    if (barcodeVerificationEnabled && !otpVerificationEnabled) {
      setBarcodeScannerOpen(true);
      return;
    }

    if (!barcodeVerificationEnabled && otpVerificationEnabled) {
      foodPickupOtpFromVerificationRef.current = true;
      setOtpError(null);
      setOtpResetKey((k) => k + 1);
      setOtpSheetOpen(true);
      return;
    }

    setPickupVerificationOpen(true);
  }, [
    order?.merchantOrderReady,
    pickupVerificationRequired,
    barcodeVerificationEnabled,
    otpVerificationEnabled,
    riderGps,
    markFoodPickup,
    orderId,
    completeFoodPickupVerification,
    t,
  ]);

  const handlePickedOrderSlide = useCallback(() => {
    beginPickupFlow();
  }, [beginPickupFlow]);

  const handleMarkPickup = useCallback(() => {
    beginPickupFlow();
  }, [beginPickupFlow]);

  const handleBarcodeScanned = useCallback(
    (barcode: string) => {
      setBarcodeError(null);
      const gps = riderGps();
      void verifyPickupBarcode
        .mutateAsync({
          orderId,
          barcode,
          ...gps,
          deviceTimestamp: new Date().toISOString(),
        })
        .then((data) => completeFoodPickupVerification(data))
        .catch((err) => {
          setBarcodeError(
            extractApiErrorMessage(
              err,
              t(
                "orders.activeFood.barcodeVerifyFailed",
                "Barcode does not match this order. Try again or use OTP."
              )
            )
          );
        });
    },
    [orderId, riderGps, verifyPickupBarcode, completeFoodPickupVerification, t]
  );

  const handleReachCustomer = useCallback(() => {
    const gps = riderGps();
    reachedCustomer.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setDropOrderScreenOpen(true);
          setNavSheetExpanded(false);
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              isFoodOrder
                ? t("orders.activeFood.reachCustomerFailed", "Could not mark reached customer. Try again.")
                : t("orders.activeRide.reachDropFailed", "Could not mark reached drop. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, reachedCustomer, riderGps, isFoodOrder, t]);

  const handleCompleteRide = useCallback(() => {
    const gps = riderGps();
    completeRide.mutate(
      { orderId, ...gps },
      {
        onSuccess: (deliveredOrder) => {
          void tracker.stop();
          void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
          queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
          router.replace({
            pathname: "/ride-delivery-success",
            params: { ...buildRideDeliverySuccessParams(deliveredOrder), kind: "ride" },
          });
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeRide.completeRideFailed", "Could not complete ride. Try again.")
            )
          );
        },
      }
    );
  }, [completeRide, orderId, riderGps, tracker, queryClient, t]);

  const handleEnterPickupOtp = useCallback(() => {
    const otpGeo = resolveMilestoneGeoUi(
      milestoneGeo?.pickup_confirmation,
      "pickup_confirmation"
    );
    if (otpGeo.locked) {
      Alert.alert(
        t("orders.activeRide.geoBlockedTitle", "Too far from pickup"),
        otpGeo.hintText ??
          t(
            "orders.activeRide.geoBlockedPickup",
            "Move closer to the pickup location before entering OTP."
          )
      );
      return;
    }
    setNavSheetExpanded(false);
    setOtpError(null);
    setOtpResetKey((k) => k + 1);
    setOtpSheetOpen(true);
  }, [milestoneGeo?.pickup_confirmation, t]);

  const handleStartRide = useCallback(() => {
    const gps = riderGps();
    startRide.mutate(
      { orderId, ...gps },
      {
        onSuccess: () => {
          setPickupBannerMessage(
            t("orders.activeRide.rideStartedBanner", "Ride started — navigate to drop location")
          );
          setPickupBannerVisible(true);
          setCameraFitTrigger((n) => n + 1);
        },
        onError: (err) => {
          Alert.alert(
            t("orders.activeRide.updateFailedTitle", "Update failed"),
            extractApiErrorMessage(
              err,
              t("orders.activeRide.startRideFailed", "Could not start ride. Try again.")
            )
          );
        },
      }
    );
  }, [orderId, startRide, riderGps, t]);

  const handleDelivered = useCallback(async () => {
    setOtpSheetOpen(false);
    setOtpError(null);
    setDeliveryProof(null);
    setDeliveryOtpSheetOpen(false);

    try {
      const uri = await captureDeliveryProofPhoto(t);
      if (!uri) return;

      setDeliveryProof({ localUri: uri });
      setOtpResetKey((k) => k + 1);
      setDeliveryOtpSheetOpen(true);
    } catch (err) {
      Alert.alert(
        t("orders.activeFood.captureFailedTitle", "Photo failed"),
        err instanceof Error
          ? err.message
          : t(
              "orders.activeFood.captureFailed",
              "Could not capture delivery photo. Slide again to retry."
            )
      );
    }
  }, [t]);

  const handleDismissOtpSheet = useCallback(() => {
    if (verifyPickupOtp.isPending) return;
    setOtpSheetOpen(false);
    if (isFoodOrder && foodPickupOtpFromVerificationRef.current) {
      foodPickupOtpFromVerificationRef.current = false;
      setPickupVerificationOpen(true);
      return;
    }
    if (!isFoodOrder && !pickupOtpVerified) {
      setReachSliderDone(false);
      return;
    }
    if (!pickupConfirmed && !(isFoodOrder ? foodDeliveryActive : rideStarted)) {
      setReachSliderDone(false);
    }
  }, [
    verifyPickupOtp.isPending,
    pickupConfirmed,
    pickupOtpVerified,
    rideStarted,
    isFoodOrder,
    foodDeliveryActive,
  ]);

  const handleCancelReason = useCallback(
    (reasonCode: string, label: string) => {
      Alert.alert(
        t("orders.activeRide.cancelConfirmTitle", "Cancel this ride?"),
        t(
          "orders.activeRide.cancelConfirmMessage",
          "The order will be offered to other riders. This cannot be undone."
        ),
        [
          { text: t("common.back", "Back"), style: "cancel" },
          {
            text: t("orders.activeRide.confirmCancel", "Yes, cancel ride"),
            style: "destructive",
            onPress: () => {
              cancelAssigned.mutate(
                { orderId, reasonCode, reasonText: label },
                {
                  onSuccess: () => {
                    setCancelSheetOpen(false);
                    router.replace("/(tabs)/orders");
                  },
                  onError: () => {
                    Alert.alert(
                      t("orders.activeRide.cancelFailedTitle", "Could not cancel"),
                      t(
                        "orders.activeRide.cancelFailedMessage",
                        "Please try again or contact support."
                      )
                    );
                  },
                }
              );
            },
          },
        ]
      );
    },
    [cancelAssigned, orderId, t]
  );

  const handleVerifyOtp = useCallback(
    (otp: string) => {
      setOtpError(null);
      const gps = riderGps();
      void verifyPickupOtp
        .mutateAsync({
          orderId,
          otp,
          ...gps,
          ...(isFoodOrder ? { deviceTimestamp: new Date().toISOString() } : {}),
        })
        .then((data) => {
          if (isFoodOrder) {
            completeFoodPickupVerification(data);
            return;
          }
          syncRiderOrderDetailCache(queryClient, orderId, data);
          setOtpSheetOpen(false);
          setReachSliderDone(true);
          setPickupBannerMessage(
            t(
              "orders.activeRide.pickupOtpVerifiedBanner",
              "OTP verified — slide to start ride"
            )
          );
          setPickupBannerVisible(true);
        })
        .catch((err) => {
          setOtpError(
            extractApiErrorMessage(
              err,
              isFoodOrder
                ? t(
                    "orders.activeFood.pickupOtpFailed",
                    "Incorrect pickup OTP. Check with the restaurant and try again."
                  )
                : t(
                    "orders.activeRide.pickupOtpFailed",
                    "Incorrect pickup OTP. Ask the passenger for the code in their app."
                  )
            )
          );
          setOtpResetKey((k) => k + 1);
        });
    },
    [
      verifyPickupOtp,
      orderId,
      riderGps,
      isFoodOrder,
      t,
      completeFoodPickupVerification,
      queryClient,
    ]
  );

  const handleVerifyDeliveryOtp = useCallback(
    async (otp: string) => {
      const localUri = deliveryProof?.localUri;
      if (!localUri) return;

      setOtpError(null);
      setDeliveryPhotoUploading(true);

      try {
        const token = session?.accessToken;
        if (!token) {
          setDeliveryPhotoUploading(false);
          Alert.alert(
            t("orders.activeFood.uploadAuthError", "Session expired"),
            t("orders.activeFood.signInAgain", "Sign in again and retry delivery.")
          );
          return;
        }

        const key = buildOrderDeliveryProofKey(orderId);
        const uploaded = await uploadToR2(localUri, "orders", token, key);
        const gps = riderGps();

        verifyDeliveryOtp.mutate(
          {
            orderId,
            otp,
            ...gps,
            deliveryImageUrl: uploaded.proxyUrl,
            deliveryImageR2Key: uploaded.key,
          },
          {
            onSuccess: (deliveredOrder) => {
              setDeliveryOtpSheetOpen(false);
              setDeliveryProof(null);
              setDropOrderScreenOpen(false);
              deliveredOrderForSuccessRef.current = deliveredOrder;
              queryClient.setQueryData(["rider", "orders", "detail", orderId], deliveredOrder);
              if (deliveredOrder.customerFeedbackSubmitted === true) {
                navigateToFoodDeliverySuccess(deliveredOrder);
              } else {
                setCustomerFeedbackOpen(true);
              }
            },
            onError: (err) => {
              setOtpError(
                extractApiErrorMessage(
                  err,
                  t(
                    "orders.activeFood.deliveryOtpFailed",
                    "Incorrect delivery OTP. Ask the customer for the code shown in their app (Delivery OTP)."
                  )
                )
              );
              setDeliveryOtpSheetOpen(true);
              setOtpResetKey((k) => k + 1);
            },
            onSettled: () => {
              setDeliveryPhotoUploading(false);
            },
          }
        );
      } catch (err) {
        setDeliveryPhotoUploading(false);
        setOtpError(
          err instanceof Error
            ? err.message
            : t(
                "orders.activeFood.uploadFailed",
                "Could not upload delivery photo. Try OTP again."
              )
        );
        setDeliveryOtpSheetOpen(true);
        setOtpResetKey((k) => k + 1);
      }
    },
    [
      deliveryProof?.localUri,
      session?.accessToken,
      orderId,
      verifyDeliveryOtp,
      riderGps,
      navigateToFoodDeliverySuccess,
      queryClient,
      t,
    ]
  );

  useEffect(() => {
    const deliveryLegActive = isFoodOrder ? foodDeliveryActive : rideStarted;
    if (deliveryLegActive) {
      setOtpSheetOpen(false);
      setReachSliderDone(true);
    }
  }, [isFoodOrder, foodDeliveryActive, rideStarted]);

  const toggleNavSheetExpanded = useCallback(() => {
    setNavSheetExpanded((v) => !v);
  }, []);

  const speedKmh = useMemo(() => {
    const mps = riderFix?.speedMps;
    if (mps == null || !Number.isFinite(mps) || mps < 0) return null;
    return mps * 3.6;
  }, [riderFix?.speedMps]);

  const navSheetHeight = useMemo(() => {
    if (isFoodOrder) {
      return navSheetExpanded ? FOOD_NAV_SHEET_HEIGHT : FOOD_NAV_SHEET_COLLAPSED_HEIGHT;
    }
    return navSheetExpanded
      ? PERSON_RIDE_NAV_SHEET_HEIGHT
      : PERSON_RIDE_NAV_SHEET_COLLAPSED_HEIGHT;
  }, [isFoodOrder, navSheetExpanded]);

  const mapControlsBottom = navSheetHeight + Math.max(sheetBottomInset, 12) + 16;

  const mapEdgeInsets = useMemo<MapEdgeInsets>(
    () =>
      buildNavMapEdgeInsets({
        safeTop: insets.top,
        sheetOverlayHeight: navSheetHeight + Math.max(sheetBottomInset, 12),
        controlsReserve: 12,
      }),
    [insets.top, navSheetHeight, sheetBottomInset]
  );

  useEffect(() => {
    if (mapNavigationFollowMode) return;
    setCameraFitTrigger((t) => t + 1);
  }, [navSheetExpanded, mapNavigationFollowMode]);

  useEffect(() => {
    if (mapNavigationFollowMode || userControllingMapRef.current) return;
    setCameraFitTrigger((t) => t + 1);
  }, [route?.coordinates?.length, mapNavigationFollowMode]);

  useEffect(() => {
    setNavSheetExpanded(true);
    initialNavCamDoneRef.current = false;
    userControllingMapRef.current = false;
    setMapFollowEnabled(true);
  }, [navDestination?.lat, navDestination?.lng]);

  useEffect(() => {
    if (!mapRiderLocation || !navDestination) return;
    if (userControllingMapRef.current) return;
    if (!initialNavCamDoneRef.current) {
      initialNavCamDoneRef.current = true;
      const t = setTimeout(() => {
        mapRef.current?.showRouteOverview();
        if (!userControllingMapRef.current) {
          setMapFollowEnabled(true);
        }
      }, 500);
      return () => clearTimeout(t);
    }
  }, [
    mapRiderLocation?.lat,
    mapRiderLocation?.lng,
    navDestination?.lat,
    navDestination?.lng,
    route?.coordinates?.length,
  ]);

  const restaurantDisplayName =
    order?.merchantName?.trim() ||
    compactAddress(pickup?.address ?? "").line1 ||
    t("orders.activeFood.restaurantFallback", "Restaurant");

  const handleReportIssue = useCallback(() => {
    router.push({
      pathname: "/raise-ticket-flow",
      params: { orderId },
    });
  }, [orderId]);

  const handleCallRestaurant = useCallback(() => {
    const phone = (order?.restaurantPhone ?? order?.customerPhone)?.trim();
    if (!phone) {
      Alert.alert(
        t("orders.activeFood.noPhoneTitle", "Phone unavailable"),
        t("orders.activeFood.noPhoneMessage", "Restaurant phone is not available.")
      );
      return;
    }
    void Linking.openURL(`tel:${phone}`);
  }, [order?.restaurantPhone, order?.customerPhone, t]);

  const handleOpenMaps = useCallback(() => {
    if (!navDestination) return;
    const rider = riderLocation ?? riderForRoute;
    void openGoogleMapsNavigation({
      destination: {
        lat: navDestination.lat,
        lng: navDestination.lng,
      },
      origin: rider ? { lat: rider.lat, lng: rider.lng } : undefined,
      destinationLabel: navDestination.address,
    });
  }, [navDestination, riderLocation, riderForRoute]);

  const handleEmergencyPress = useCallback(() => {
    Alert.alert(
      isFoodOrder
        ? t("orders.activeFood.emergencyTitle", "Emergency")
        : t("orders.activeRide.safetyTitle", "Safety"),
      isFoodOrder
        ? t(
            "orders.activeFood.emergencyMessage",
            "Emergency support is coming soon. Call local emergency services if you are in danger."
          )
        : t(
            "orders.activeRide.safetyMessage",
            "Emergency and safety tools are coming soon."
          )
    );
  }, [isFoodOrder, t]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }

  if (isError || !order || !navDestination) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>
          {isFoodOrder
            ? t("orders.activeFood.notFound", "Order not found")
            : t("orders.activeRide.notFound", "Ride not found")}
        </Text>
        <Button onPress={() => router.replace("/(tabs)/orders")} style={{ marginTop: 16 }}>
          {t("orders.activeRide.backHome", "Back to orders")}
        </Button>
      </View>
    );
  }

  const displayId = order.formattedOrderId?.trim() || order.id;
  const rideNavPhase = rideStarted && !orderDelivered ? "drop" : "pickup";
  const pickupAddressParts = compactAddress(
    (isFoodOrder ? foodDeliveryActive : rideStarted) && delivery?.address
      ? delivery.address
      : pickup.address
  );
  const foodPhase = foodDeliveryActive && !orderDelivered ? "drop" : "pickup";
  const passengerName =
    order.customerName?.trim() || t("orders.activeRide.passengerFallback", "Passenger");

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.mainColumn}>
      <View style={styles.mapStageFlex}>
        <ActiveRideNavigationMap
          ref={mapRef}
          riderLocation={mapRiderLocation}
          pickup={{
            lat: navDestination.lat,
            lng: navDestination.lng,
            address: navDestination.address,
          }}
          destinationLabel={navDestination.mapLabel}
          foodRestaurantName={
            isFoodOrder && navDestination.mapLabel === "Pickup" ? restaurantDisplayName : undefined
          }
          remainingCoordinates={routeProgress.remaining}
          fullRouteCoordinates={route?.coordinates ?? []}
          alternativeRoutes={route?.alternatives}
          offRouteConnectorGeoJson={riderRouteConnectorGeoJson}
          routeJoinPoint={routeProgress.routeJoinPoint ?? null}
          routeDeviationWrongWay={routeDeviation?.wrongWay ?? false}
          traveledCoordinates={[]}
          previousPickup={previousPickup}
          mapEdgeInsets={mapEdgeInsets}
          fitCameraTrigger={cameraFitTrigger}
          navigationFollowMode={mapNavigationFollowMode}
          mapViewMode={mapViewMode}
          onUserMapGesture={handleUserMapGesture}
          arrivedAtDestination={
            pickupConfirmed ||
            (metersToPickup != null && metersToPickup <= 40)
          }
          remainingDistanceM={metersToPickup}
          style={styles.mapFill}
        />

        <PickupUpdatedBanner
          visible={pickupBannerVisible}
          message={pickupBannerMessage}
          onDismiss={() => {
            setPickupBannerVisible(false);
            setPickupBannerMessage(undefined);
            setPreviousPickup(null);
          }}
        />

        <View style={styles.mapChromeLayer} pointerEvents="box-none">
          <FoodNavigationMapChrome
            headerTitle={navHeaderTitle}
            mapControlsBottom={mapControlsBottom}
            onBackPress={() => router.back()}
            onEmergencyPress={handleEmergencyPress}
            onDirectionsPress={handleOpenMaps}
            onHelpPress={handleReportIssue}
            onRecenter={handleMapRecenter}
            onRouteOverviewLongPress={handleMapRouteOverview}
            onZoomIn={handleMapZoomIn}
            onZoomOut={handleMapZoomOut}
          />
        </View>
      </View>

      <View
        style={[
          styles.sheetOverlay,
          (otpSheetOpen || deliveryOtpSheetOpen) && styles.sheetOverlayBehindOtp,
        ]}
        pointerEvents={otpSheetOpen || deliveryOtpSheetOpen ? "none" : "box-none"}
      >
      {isFoodOrder ? (
        <FoodNavigateBottomSheet
          order={order}
          orderIdLabel={displayId}
          phase={foodPhase}
          title={sheetTitle}
          restaurantName={
            foodPhase === "drop"
              ? order.customerName?.trim() || t("orders.activeFood.customer", "Customer")
              : restaurantDisplayName
          }
          pickupAddress={pickupAddressParts.line1}
          pickupLandmark={pickupAddressParts.landmark}
          routeMeta={{
            etaMinutes: liveEtaMinutes,
            distanceKm: liveDistanceKm,
            metersAway: metersToPickup,
            loading: routeLoading && !route,
            error: routeError,
            onRetryRoute: () => void fetchRoute(true),
          }}
          pickupConfirmed={pickupConfirmed}
          rideStarted={foodDeliveryActive}
          atCustomer={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending}
          deliveryPhotoLoading={deliveryPhotoUploading}
          bottomInset={sheetBottomInset}
          onReachStore={handleReachStore}
          onMarkPickup={handleMarkPickup}
          onReachCustomer={handleReachCustomer}
          onDelivered={handleDelivered}
          reachSliderDone={reachSliderDone}
          hideMarkPickupWhilePickSheet={
            showFoodPickOrderSheet ||
            pickOrderDetailOpen ||
            showRestaurantFeedbackSheet ||
            pickupVerificationOpen ||
            barcodeScannerOpen
          }
          hidePrepBanner={reachSliderDone}
          showPickOrderReopen={reachSliderDone && pickOrderSheetDismissed && !pickOrderDetailOpen}
          onOpenPickOrderSheet={() => setPickOrderSheetDismissed(false)}
          onReportIssue={handleReportIssue}
          onCallRestaurant={handleCallRestaurant}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          onOpenMaps={handleOpenMaps}
          callDisabled={
            foodPhase === "drop"
              ? !order.customerPhone?.trim()
              : !(order.restaurantPhone?.trim() || order.customerPhone?.trim())
          }
          sheetExpanded={navSheetExpanded}
          onToggleSheetExpanded={toggleNavSheetExpanded}
          milestoneGeo={milestoneGeo}
          suppressDropDeliverSlider={dropOrderScreenOpen}
        />
      ) : (
        <PersonRideNavigateBottomSheet
          order={order}
          tripId={displayId}
          phase={rideNavPhase}
          title={sheetTitle}
          locationLabel={
            rideNavPhase === "drop"
              ? t("orders.activeRide.dropLocationLabel", "DROP LOCATION")
              : t("orders.activeRide.pickupLocationLabel", "PICKUP LOCATION")
          }
          locationName={passengerName}
          locationAddress={pickupAddressParts.line1}
          locationLandmark={pickupAddressParts.landmark}
          routeMeta={{
            etaMinutes: liveEtaMinutes,
            distanceKm: liveDistanceKm,
            metersAway: metersToPickup,
            loading: routeLoading && !route,
            error: routeError,
            onRetryRoute: () => void fetchRoute(true),
          }}
          pickupConfirmed={pickupConfirmed}
          pickupOtpVerified={pickupOtpVerified}
          rideStarted={rideStarted}
          atDrop={atCustomer}
          orderDelivered={orderDelivered}
          reachedLoading={reachedPickup.isPending || reachedCustomer.isPending}
          startRideLoading={startRide.isPending}
          cancelLoading={cancelAssigned.isPending}
          bottomInset={sheetBottomInset}
          completeRideLoading={completeRide.isPending}
          onReachPickup={handleReachedPickup}
          onReachDrop={handleReachCustomer}
          onCompleteRide={handleCompleteRide}
          onEnterPickupOtp={handleEnterPickupOtp}
          onStartRide={handleStartRide}
          reachSliderDone={reachSliderDone}
          onCancel={() => setCancelSheetOpen(true)}
          onCallCustomer={handleCallCustomer}
          onOpenMaps={handleOpenMaps}
          callDisabled={!order.customerPhone?.trim()}
          sheetExpanded={navSheetExpanded}
          onToggleSheetExpanded={toggleNavSheetExpanded}
          milestoneGeo={milestoneGeo}
        />
      )}
      </View>
      </View>

      {isFoodOrder && order ? (
        <FoodPickOrderDetailScreen
          visible={pickOrderDetailOpen && !foodDeliveryActive && !orderDelivered && !otpSheetOpen}
          order={order}
          orderIdLabel={displayId}
          restaurantName={restaurantDisplayName}
          restaurantAddress={pickupAddressParts.line1}
          merchantReady={order.merchantOrderReady === true}
          onBack={() => setPickOrderDetailOpen(false)}
          onCall={handleCallRestaurant}
          onCallCustomer={handleCallCustomer}
          onHelp={handleReportIssue}
          onPickedOrder={handlePickedOrderSlide}
          pickUpLoading={
            markFoodPickup.isPending || verifyPickupBarcode.isPending || verifyPickupOtp.isPending
          }
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodPickupVerificationScreen
          visible={pickupVerificationOpen && !foodDeliveryActive && !orderDelivered}
          barcodeEnabled={barcodeVerificationEnabled}
          otpEnabled={otpVerificationEnabled}
          onBack={() => setPickupVerificationOpen(false)}
          onScanBarcode={() => {
            setBarcodeError(null);
            setPickupVerificationOpen(false);
            setBarcodeScannerOpen(true);
          }}
          onEnterOtp={() => {
            setPickupVerificationOpen(false);
            foodPickupOtpFromVerificationRef.current = true;
            setOtpError(null);
            setOtpResetKey((k) => k + 1);
            setOtpSheetOpen(true);
          }}
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodBarcodeScannerScreen
          visible={barcodeScannerOpen && !foodDeliveryActive && !orderDelivered}
          loading={verifyPickupBarcode.isPending}
          error={barcodeError}
          onClose={() => {
            if (verifyPickupBarcode.isPending) return;
            setBarcodeScannerOpen(false);
            setBarcodeError(null);
            if (barcodeVerificationEnabled && otpVerificationEnabled) {
              setPickupVerificationOpen(true);
            }
          }}
          onScanned={handleBarcodeScanned}
        />
      ) : null}

      {isFoodOrder && order ? (
        <FoodPickOrderSheet
          visible={showFoodPickOrderSheet}
          merchantReady={order.merchantOrderReady === true}
          order={order}
          orderIdLabel={displayId}
          customerName={order.customerName}
          onDismiss={() => setPickOrderSheetDismissed(true)}
          onConfirmPickup={handlePickOrderConfirm}
        />
      ) : null}

      <PickupOtpBottomSheet
        visible={otpSheetOpen && !(isFoodOrder && foodDeliveryActive) && !deliveryOtpSheetOpen}
        loading={verifyPickupOtp.isPending}
        error={otpError}
        resetKey={otpResetKey}
        customerName={isFoodOrder ? order.merchantName : order.customerName}
        otpContext={isFoodOrder ? "merchant" : "customer"}
        purpose="pickup"
        bottomOffset={sheetBottomInset}
        onDismiss={handleDismissOtpSheet}
        onSubmit={handleVerifyOtp}
      />

      {isFoodOrder && order ? (
        <FoodDropOrderScreen
          visible={dropOrderScreenOpen && atCustomer && !orderDelivered}
          order={order}
          orderIdLabel={displayId}
          deliveryAddress={[pickupAddressParts.line1, pickupAddressParts.landmark]
            .filter(Boolean)
            .join(", ")}
          restaurantName={restaurantDisplayName}
          onBack={() => setDropOrderScreenOpen(false)}
          onEmergencyPress={handleEmergencyPress}
          onDirectionsPress={handleOpenMaps}
          onHelpPress={handleReportIssue}
          onCallCustomer={handleCallCustomer}
          onChatCustomer={handleChatCustomer}
          onOpenMaps={handleOpenMaps}
          onDelivered={handleDelivered}
          deliverLoading={deliveryPhotoUploading}
        />
      ) : null}

      {isFoodOrder && order ? (
        <CustomerFeedbackBottomSheet
          visible={customerFeedbackOpen}
          loading={submitCustomerFeedback.isPending}
          orderIdLabel={displayId}
          customerName={
            order.customerName?.trim() || t("orders.activeFood.customerFallback", "Customer")
          }
          onSkip={handleCustomerFeedbackSkip}
          onSubmit={handleCustomerFeedbackSubmit}
        />
      ) : null}

      {isFoodOrder && order ? (
        <RestaurantFeedbackBottomSheet
          visible={showRestaurantFeedbackSheet}
          loading={submitMerchantFeedback.isPending}
          restaurantName={restaurantDisplayName}
          restaurantAddress={pickup.address}
          onSkip={handleRestaurantFeedbackSkip}
          onSubmit={handleRestaurantFeedbackSubmit}
        />
      ) : null}

      {deliveryProof ? (
        <FoodDeliveryConfirmBottomSheet
          visible={deliveryOtpSheetOpen && isFoodOrder}
          proofImageUri={deliveryProof.localUri}
          loading={verifyDeliveryOtp.isPending || deliveryPhotoUploading}
          error={otpError}
          resetKey={otpResetKey}
          customerName={order.customerName}
          bottomOffset={sheetBottomInset}
          onDismiss={() => {
            if (verifyDeliveryOtp.isPending) return;
            setDeliveryOtpSheetOpen(false);
            setDeliveryProof(null);
          }}
          onSubmit={handleVerifyDeliveryOtp}
        />
      ) : null}

      {deliveryPhotoUploading ? (
        <View style={styles.deliveryUploadOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.deliveryUploadText}>
            {t("orders.activeFood.completingDelivery", "Completing delivery…")}
          </Text>
        </View>
      ) : null}

      {!isFoodOrder ? (
        <RiderRideCancelReasonSheet
          visible={cancelSheetOpen}
          loading={cancelAssigned.isPending}
          onClose={() => setCancelSheetOpen(false)}
          onSelect={handleCancelReason}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#F1F5F9",
  },
  mainColumn: {
    flex: 1,
    position: "relative",
    minHeight: 0,
  },
  mapStage: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  mapStageFlex: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    zIndex: 1,
  },
  mapChromeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    pointerEvents: "box-none",
  },
  mapFill: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  sheetOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 32,
    backgroundColor: "transparent",
  },
  sheetOverlayBehindOtp: {
    opacity: 0,
    pointerEvents: "none",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.gray[900],
  },
  deliveryUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  deliveryUploadText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[700],
    textAlign: "center",
  },
});
