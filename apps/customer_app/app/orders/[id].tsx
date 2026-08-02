/**
 * Order Details – live tracking, post-delivery success (default), or history bill view (`view=history`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert, InteractionManager, Linking } from "react-native";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { MapboxWebDeliveryMap } from "@/components/maps/MapboxWebDeliveryMap";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import { orderService } from "@/services/order.service";
import { merchantService } from "@/services/merchant.service";
import { etaService } from "@/services/eta.service";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { WeatherStatusChip } from "@/components/weather";
import {
  resolveLiveEtaMinutes,
  resolveCustomerEtaContextLabel,
  isMerchantEtaDelayed,
  isEtaUpdatedFromPromise,
} from "@/lib/order-eta-display";
import { PrepDelayMarqueeBanner } from "@/components/orders/PrepDelayMarqueeBanner";
import { DeliveryAddressText } from "@/components/address/DeliveryAddressText";
import { getRouteCoordinates } from "@/services/directions.service";
import { useLiveLocationWsConnected } from "@/lib/liveLocationTransport";
import { useOrderStore } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { LegalFooter } from "@/components/LegalLinks";
import { DietIndicator } from "@/components/store/DietIndicator";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import { OrderRefundCard } from "@/components/OrderRefundCard";
import { getOrderDetailInitialData } from "@/lib/orderDetailCache";
import { resolveOrderTrackingMapSnapshots } from "@/lib/orderTrackingMapSnapshots";
import { resolveOrderItemDiet } from "@/lib/reorderFromOrder";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { OrderItemCustomizationModal } from "@/components/orders/OrderItemCustomizationModal";
import { OrderDeliveryRatingSheet } from "@/components/orders/OrderDeliveryRatingSheet";
import {
  getCustomerOrderStatusBannerText,
  getPersonRideStatusBannerText,
  isCustomerOrderRefundCompleted,
  isPersonRideInProgressStatus,
  isPersonRideOrder,
  isPersonRideSearchingStatus,
  isRideAwaitingPickupStatus,
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import {
  customerSupportChatTopicsQueryKey,
  fetchCustomerSupportChatTopics,
} from "@/lib/customer-support-chat-topics";
import { RideAcceptedTrackingScreen } from "@/components/ride/RideAcceptedTrackingScreen";
import { RideOrderDetailsScreen } from "@/components/ride/RideOrderDetailsScreen";
import { RideOrderDeliveredScreen } from "@/components/ride/RideOrderDeliveredScreen";
import { RideFarePaymentPendingScreen } from "@/components/ride/RideFarePaymentPendingScreen";
import { isRideFarePaymentPending } from "@/lib/ride-fare-gate";
import { FoodLiveTrackingScreen } from "@/components/orders/FoodLiveTrackingScreen";
import { FoodOrderDeliveredScreen } from "@/components/orders/FoodOrderDeliveredScreen";
import { InvoiceDownloadingToast } from "@/components/orders/InvoiceDownloadingToast";
import {
  orderItemHasCustomizations,
  type OrderDetailLineItem,
} from "@/lib/order-item-customization-display";
import {
  safeRouterBack,
  HOME_TAB_FALLBACK,
  RIDE_HOME_FALLBACK,
  FOOD_HOME_FALLBACK,
} from "@/lib/safeRouterBack";
import { buildRideSearchingResumeParams } from "@/lib/person-ride-orders";
import { getRideOrderStatus, isRideCaptainAssigned } from "@/services/rideBooking.service";

const GREEN = GatiMitraColors.primaryMint;
const LINK_BLUE = "#2563EB";
const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const BORDER = "#EBEBEB";
const TEXT = "#1C1C1C";
const MUTED = "#828282";

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function toDietType(itemVeg: string | null | undefined): "veg" | "nonveg" | "egg" | null {
  return resolveOrderItemDiet(itemVeg);
}

function maskPhone(phone: string | undefined | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}XXXX`;
  return `${digits.slice(0, 6)}XXXX`;
}

function formatPaymentDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

/** iOS swipe-back / stack POP → food home (not checkout). */
function FoodOrderTrackingBackGuard() {
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      const type = e.data.action.type;
      if (type !== "GO_BACK" && type !== "POP") return;
      e.preventDefault();
      router.replace(FOOD_HOME_FALLBACK);
    });
    return unsub;
  }, [navigation, router]);

  return null;
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = useCallback(() => {
    safeRouterBack(router);
  }, [router]);
  /** After placing a food order, never pop back into checkout/cart — always food home. */
  const handleFoodTrackingBack = useCallback(() => {
    router.replace(FOOD_HOME_FALLBACK);
  }, [router]);
  const queryClient = useQueryClient();
  const { id, rate, view, returnTo } = useLocalSearchParams<{
    id: string;
    rate?: string;
    view?: string;
    returnTo?: string;
  }>();
  const openedFromRideHome = returnTo === "ride";
  const handleRideHomeBack = useCallback(() => {
    router.replace(RIDE_HOME_FALLBACK);
  }, [router]);
  const handleRideGoHome = useCallback(() => {
    router.replace(openedFromRideHome ? RIDE_HOME_FALLBACK : HOME_TAB_FALLBACK);
  }, [router, openedFromRideHome]);
  const handleRideTrackingBack = openedFromRideHome ? handleRideHomeBack : handleBack;
  const orderId = id ?? "";
  /** Past orders opened from Orders → History use the bill/invoice details UI. */
  const useHistoryOrderDetails = view === "history";
  const liveLocationWsConnected = useLiveLocationWsConnected();
  const [mapReady, setMapReady] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<OrderDetailLineItem | null>(null);
  const [ratingSheetVisible, setRatingSheetVisible] = useState(false);
  const [ratingDismissed, setRatingDismissed] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [invoiceDownloading, setInvoiceDownloading] = useState(false);
  const [receiptDownloading, setReceiptDownloading] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderService.getOrder(orderId),
    enabled: !!orderId,
    initialData: () => getOrderDetailInitialData(queryClient, orderId),
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = normalizeCustomerOrderStatus(data?.status);
      if (
        data &&
        isPersonRideOrder(data) &&
        status === "DELIVERED" &&
        isRideFarePaymentPending(data.paymentStatus)
      ) {
        return 3_000;
      }
      const statusUpper = (data?.status ?? "").toUpperCase();
      if (
        !statusUpper ||
        statusUpper === "DELIVERED" ||
        statusUpper === "CANCELLED" ||
        statusUpper === "PAYMENT_FAILED" ||
        statusUpper === "FAILED"
      ) {
        return false;
      }
      return 5_000;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1_500 * 2 ** attempt, 20_000),
  });

  const orderStatus = normalizeCustomerOrderStatus(order?.status);
  const isInProgress = !!order && !isTerminalOrderStatus(orderStatus);

  useEffect(() => {
    if (!order || !isPersonRideOrder(order)) return;
    if (!isPersonRideSearchingStatus(order, order.status) || order.rider) return;

    let cancelled = false;
    void getRideOrderStatus(order.orderId)
      .then((rideStatus) => {
        if (cancelled) return;
        if (isRideCaptainAssigned(rideStatus)) {
          void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
          return;
        }
        const redirectParams = buildRideSearchingResumeParams(order);
        if (openedFromRideHome) redirectParams.returnTo = "ride";
        router.replace({
          pathname: "/home/service/ride-searching",
          params: redirectParams,
        });
      })
      .catch(() => {
        if (cancelled) return;
        const redirectParams = buildRideSearchingResumeParams(order);
        if (openedFromRideHome) redirectParams.returnTo = "ride";
        router.replace({
          pathname: "/home/service/ride-searching",
          params: redirectParams,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [order, router, openedFromRideHome, orderId, queryClient]);

  useEffect(() => {
    if (!isInProgress) {
      setMapReady(false);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => setMapReady(true));
    return () => task.cancel();
  }, [isInProgress, orderId]);

  const { data: etaData } = useQuery({
    queryKey: ["orderEta", orderId],
    queryFn: () => etaService.getForOrder(orderId),
    enabled: !!orderId && !!isInProgress,
    refetchInterval: isInProgress ? 15_000 : false,
    staleTime: 10_000,
  });

  const prepDelayBanner = useOrderStore((s) => s.prepDelayBanner);
  const showOrderPrepDelayMarquee =
    !!prepDelayBanner &&
    prepDelayBanner.orderId === orderId &&
    prepDelayBanner.expiresAt > Date.now();

  const { data: tracking } = useQuery({
    queryKey: ["orderTracking", orderId],
    queryFn: () => orderService.getOrderTracking(orderId),
    enabled: !!orderId && !!isInProgress,
    // Always fetch once on enter so ETA/distance are not empty while WS warms up.
    refetchOnMount: "always",
    // WebSocket is primary; HTTP poll only while the socket is down.
    refetchInterval: isInProgress && !liveLocationWsConnected ? 2_000 : false,
    staleTime: liveLocationWsConnected ? 30_000 : 0,
  });

  // Immutable order snapshots + store fallback when pickup was stored as 0/null.
  const storeIdForMap =
    order?.merchantPublicStoreId?.trim() ||
    (order?.merchantStoreId != null ? String(order.merchantStoreId) : null);
  const { data: mapStore } = useQuery({
    queryKey: ["merchant", storeIdForMap, "tracking-map"],
    queryFn: () => merchantService.getMerchantById(storeIdForMap!),
    enabled: Boolean(storeIdForMap),
    staleTime: 5 * 60 * 1000,
  });
  const { deliveryLat, deliveryLng, pickupLat, pickupLng } = resolveOrderTrackingMapSnapshots({
    deliveryLat: order?.deliveryLat,
    deliveryLng: order?.deliveryLng,
    pickupLat: order?.pickupLat,
    pickupLng: order?.pickupLng,
    storeLat: mapStore?.latitude ?? null,
    storeLng: mapStore?.longitude ?? null,
    distanceKm: order?.distanceKm ?? null,
  });

  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  useEffect(() => {
    if (!orderId || !order || !mapReady) return;
    getRouteCoordinates(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: deliveryLat, longitude: deliveryLng }
    ).then(setRouteCoordinates);
  }, [orderId, pickupLat, pickupLng, deliveryLat, deliveryLng, order?.orderId, mapReady]);

  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);

  useEffect(() => {
    if (!order) return;
    const status = normalizeCustomerOrderStatus(order.status);
    if (status === "DELIVERED" || status === "CANCELLED") {
      removeActiveOrder(order.orderId);
    } else {
      const etaMins = resolveLiveEtaMinutes(etaData) ?? 20;
      updateOrderStatus(order.orderId, status as import("@/store/orderStore").OrderStatus, etaMins);
    }
  }, [order?.status, order?.orderId, etaData, updateOrderStatus, removeActiveOrder]);

  useEffect(() => {
    setRatingSheetVisible(false);
    setRatingDismissed(false);
  }, [orderId]);

  useEffect(() => {
    if (rate === "1" || rate === "true") {
      setRatingDismissed(false);
    }
  }, [rate]);

  useEffect(() => {
    if (!order) return;
    const delivered = normalizeCustomerOrderStatus(order.status) === "DELIVERED";
    const alreadyRated = order.storeRatingSubmitted === true;
    const wantsRate = rate === "1" || rate === "true";
    const isFoodDelivered = delivered && !isPersonRideOrder(order);
    const usesDeliveredSuccessScreen = isFoodDelivered && !useHistoryOrderDetails;
    if (!isFoodDelivered || alreadyRated || usesDeliveredSuccessScreen) return;
    if (!ratingDismissed || wantsRate) {
      setRatingSheetVisible(true);
    }
  }, [
    order?.status,
    order?.storeRatingSubmitted,
    ratingDismissed,
    rate,
    order,
    useHistoryOrderDetails,
  ]);

  useEffect(() => {
    if (!order || isPersonRideOrder(order)) return;
    if (normalizeCustomerOrderStatus(order.status) !== "DELIVERED") return;
    void queryClient.prefetchQuery({
      queryKey: customerSupportChatTopicsQueryKey("delivered", "food"),
      queryFn: () => fetchCustomerSupportChatTopics("delivered", "food"),
      staleTime: 300_000,
    });
  }, [order?.orderId, order?.status, queryClient, order]);

  const handleSubmitStoreRating = async (payload: {
    storeRating?: number;
    deliveryRating?: number;
    reviewText?: string;
    riderReviewText?: string;
    storeReviewTags?: string[];
    riderReviewTags?: string[];
  }) => {
    if (!orderId) return;
    const storeRating = payload.storeRating != null && payload.storeRating >= 1 ? payload.storeRating : null;
    const deliveryRating =
      payload.deliveryRating != null && payload.deliveryRating >= 1 ? payload.deliveryRating : null;
    if (storeRating == null && deliveryRating == null) return;

    setRatingSubmitting(true);
    try {
      await orderService.submitStoreRating(orderId, {
        storeRating,
        deliveryRating,
        reviewText: payload.reviewText ?? null,
        riderReviewText: payload.riderReviewText ?? null,
        storeReviewTags: payload.storeReviewTags,
        riderReviewTags: payload.riderReviewTags,
      });
      await queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      setRatingSheetVisible(false);
      Alert.alert("Thank you!", "Your rating helps us improve.");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not submit rating. Please try again.";
      Alert.alert("Rating failed", msg);
    } finally {
      setRatingSubmitting(false);
    }
  };

  const renderOrderRatingSheet = () => {
    if (!order || isPersonRideOrder(order)) return null;
    const isDelivered = normalizeCustomerOrderStatus(order.status) === "DELIVERED";
    return (
      <OrderDeliveryRatingSheet
        visible={ratingSheetVisible && isDelivered && !order.storeRatingSubmitted}
        orderId={order.orderId}
        storeName={order.merchantPublicName ?? order.merchantName ?? "Restaurant"}
        storeBannerUri={toAbsoluteImageUrl(order.merchantBannerUrl)}
        riderName={order.rider?.name}
        existingTipAmount={order.tipAmount ?? 0}
        paymentMethodLabel={order.paymentMethod ?? "UPI"}
        submitting={ratingSubmitting}
        onClose={() => {
          setRatingSheetVisible(false);
          setRatingDismissed(true);
        }}
        onTipPaid={async () => {
          await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
          await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        }}
        onSubmit={handleSubmitStoreRating}
      />
    );
  };

  const deliveryMapPayload = useMemo<DeliveryMapPayload>(
    () => ({
      pickupLat,
      pickupLng,
      dropLat: deliveryLat,
      dropLng: deliveryLng,
      riderLat: tracking?.rider?.latitude ?? null,
      riderLng: tracking?.rider?.longitude ?? null,
      fullRoute: routeCoordinates,
      remainingRoute: routeCoordinates,
      mapPadding: { top: 52, bottom: 48, left: 32, right: 32 },
    }),
    [
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
      tracking?.rider?.latitude,
      tracking?.rider?.longitude,
      routeCoordinates,
    ]
  );

  const deliveryMapFitCoords = useMemo(() => {
    const points: { latitude: number; longitude: number }[] = [];
    if (routeCoordinates.length >= 2) {
      points.push(...routeCoordinates);
    } else {
      points.push({ latitude: pickupLat, longitude: pickupLng });
      points.push({ latitude: deliveryLat, longitude: deliveryLng });
    }
    if (tracking?.rider) {
      points.push({
        latitude: tracking.rider.latitude,
        longitude: tracking.rider.longitude,
      });
    }
    return points;
  }, [routeCoordinates, pickupLat, pickupLng, deliveryLat, deliveryLng, tracking?.rider]);

  const deliveryMapCenter = useMemo(
    () => ({
      latitude: (pickupLat + deliveryLat) / 2,
      longitude: (pickupLng + deliveryLng) / 2,
    }),
    [pickupLat, pickupLng, deliveryLat, deliveryLng]
  );

  const liveEtaMins = resolveLiveEtaMinutes(etaData);
  const merchantDelayed = isMerchantEtaDelayed(etaData);
  const etaUpdated = isEtaUpdatedFromPromise(etaData);
  const etaContextLabel = resolveCustomerEtaContextLabel(etaData);
  const { data: trackingWeather } = useLocationWeather({
    lat: order?.deliveryLat,
    lng: order?.deliveryLng,
    enabled: !!order && isInProgress && !isPersonRideOrder(order),
  });

  const handleOpenHelp = () => {
    const isDeliveredFood =
      !!order && !isPersonRideOrder(order) && (order.status ?? "").trim().toUpperCase() === "DELIVERED";
    if (isDeliveredFood) {
      void queryClient.prefetchQuery({
        queryKey: customerSupportChatTopicsQueryKey("delivered", "food"),
        queryFn: () => fetchCustomerSupportChatTopics("delivered", "food"),
        staleTime: 300_000,
      });
    }
    router.push({
      pathname: "/orders/raise-ticket",
      params: {
        orderId: String(order?.orderId ?? orderId),
        orderRef: String(order?.formattedOrderId ?? order?.orderId ?? orderId),
        ...(order?.coreOrderId != null ? { coreOrderId: String(order.coreOrderId) } : {}),
        ...(isDeliveredFood ? { chat: "1" } : {}),
      },
    });
  };

  const handleCopyOrderId = async () => {
    const text = order?.formattedOrderId ?? order?.orderId ?? orderId;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Order ID copied to clipboard.");
  };

  const handleInvoice = async () => {
    if (!orderId || invoiceDownloading) return;
    setInvoiceDownloading(true);
    try {
      const { downloadOrderInvoice } = await import("@/lib/downloadOrderInvoice");
      await downloadOrderInvoice(orderId, order?.formattedOrderId ?? order?.orderId ?? orderId);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : null) ??
        "Could not download invoice. Please try again.";
      Alert.alert("Invoice unavailable", msg);
    } finally {
      setInvoiceDownloading(false);
    }
  };

  const handleBillSummaryReceipt = async () => {
    if (!orderId || receiptDownloading) return;
    setReceiptDownloading(true);
    try {
      const { downloadOrderReceipt } = await import("@/lib/downloadOrderReceipt");
      await downloadOrderReceipt(orderId, order?.formattedOrderId ?? order?.orderId ?? orderId);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ??
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : null) ??
        "Could not download receipt. Please try again.";
      Alert.alert("Receipt unavailable", msg);
    } finally {
      setReceiptDownloading(false);
    }
  };

  if (!orderId) {
    return (
      <View style={[styles.center, styles.screen]}>
        <AppText style={styles.mutedText}>Invalid order</AppText>
      </View>
    );
  }

  if (isLoading && !order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <ActivityIndicator size="large" color={GREEN} />
        <AppText style={styles.mutedText}>Loading order...</AppText>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <AppText style={styles.mutedText}>Order not found</AppText>
      </View>
    );
  }

  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const isRideOrder = isPersonRideOrder(order);
  const isRideSearching =
    isRideOrder &&
    isPersonRideSearchingStatus(order, order.status) &&
    !order.rider &&
    !isRideAwaitingPickupStatus(order.status) &&
    !isPersonRideInProgressStatus(order.status);

  if (isRideSearching) {
    return (
      <View style={[styles.center, styles.screen]}>
        <ActivityIndicator size="large" color={GREEN} />
        <AppText style={styles.mutedText}>Opening ride search…</AppText>
      </View>
    );
  }

  if (isRideOrder && isInProgress) {
    return (
      <>
        <AndroidBackHandler
          fallback={openedFromRideHome ? RIDE_HOME_FALLBACK : undefined}
          preferFallback={openedFromRideHome}
        />
        <RideAcceptedTrackingScreen
          order={order}
          tracking={tracking}
          etaMinutes={liveEtaMins}
          onBack={handleRideTrackingBack}
          onOpenSupport={handleOpenHelp}
        />
      </>
    );
  }

  if (isRideOrder && orderStatus === "DELIVERED" && !useHistoryOrderDetails) {
    if (isRideFarePaymentPending(order.paymentStatus)) {
      return (
        <>
          <AndroidBackHandler
            fallback={openedFromRideHome ? RIDE_HOME_FALLBACK : HOME_TAB_FALLBACK}
            preferFallback
          />
          <RideFarePaymentPendingScreen order={order} onBack={handleRideGoHome} />
        </>
      );
    }
    return (
      <>
        <AndroidBackHandler
          fallback={openedFromRideHome ? RIDE_HOME_FALLBACK : HOME_TAB_FALLBACK}
          preferFallback
        />
        <RideOrderDeliveredScreen
          order={order}
          onBack={handleRideGoHome}
          onOpenHelp={handleOpenHelp}
        />
      </>
    );
  }

  if (isRideOrder && isTerminalOrderStatus(orderStatus)) {
    return (
      <>
        <AndroidBackHandler
          fallback={openedFromRideHome ? RIDE_HOME_FALLBACK : undefined}
          preferFallback={openedFromRideHome}
        />
        <RideOrderDetailsScreen
          order={order}
          onBack={handleRideTrackingBack}
          onOpenSupport={handleOpenHelp}
        />
      </>
    );
  }

  if (isInProgress && !isRideOrder) {
    const storeId = order.merchantPublicStoreId;
    return (
      <>
        <AndroidBackHandler fallback={FOOD_HOME_FALLBACK} preferFallback />
        <FoodOrderTrackingBackGuard />
        <FoodLiveTrackingScreen
          order={order}
          tracking={tracking}
          etaMinutes={liveEtaMins}
          merchantDelayed={merchantDelayed}
          etaUpdated={etaUpdated}
          etaContextLabel={etaContextLabel}
          onBack={handleFoodTrackingBack}
          onOpenHelp={handleOpenHelp}
          onOpenMerchant={() => {
            if (storeId) router.push(`/home/merchant/${storeId}`);
          }}
          onOrderCancelled={() => {
            void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
            void import("@/lib/refreshCustomerWallet").then(({ refreshCustomerWallet }) =>
              refreshCustomerWallet(queryClient)
            );
          }}
        />
      </>
    );
  }

  const isDeliveredFood = orderStatus === "DELIVERED" && !isPersonRideOrder(order);

  if (isDeliveredFood && !useHistoryOrderDetails) {
    const storeId = order.merchantPublicStoreId;
    return (
      <>
        <AndroidBackHandler />
        <FoodOrderDeliveredScreen
          order={order}
          onBack={handleBack}
          onOpenHelp={handleOpenHelp}
          onOpenMerchant={() => {
            if (storeId) router.push(`/home/merchant/${storeId}`);
          }}
        />
      </>
    );
  }

  const restaurantName = isRideOrder
    ? "Your ride"
    : order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  const merchantArea = isRideOrder
    ? getCompactAddressLine(order.merchantAddress)
    : getCompactAddressLine(order.merchantAddress);
  const dropAddress = order.deliveryAddress?.trim() || null;
  const bannerUri = toAbsoluteImageUrl(order.merchantBannerUrl);
  const items = order.items ?? [];
  const bill = parseOrderBillFromSnapshot(
    order.billingSnapshot,
    order.totalAmount ?? null,
    order.tipAmount ?? null
  );
  const isCancelled = orderStatus === "CANCELLED";
  const isDelivered = orderStatus === "DELIVERED";
  const isFailed =
    orderStatus === "PAYMENT_FAILED" ||
    orderStatus === "FAILED" ||
    order.paymentStatus?.toLowerCase() === "failed";
  const hideRiderOnInnerPage = isDelivered || isCancelled;
  const hasAlternateContact = Boolean(order.alternateContactSetAt);
  const alternateContactName = order.alternateContactName?.trim() || null;
  const alternateContactPhone = order.alternateContactPhone?.trim() || null;
  const deliveryCustomerName = hasAlternateContact
    ? order.deliveryPrimaryContactName?.trim() || null
    : order.deliveryContactName?.trim() || null;
  const paymentMethodLabel = (order.paymentMethod ?? "UPI").replace(/_/g, " ").toUpperCase();
  const statusBanner = isRideOrder
    ? getPersonRideStatusBannerText(orderStatus, order.paymentStatus)
    : getCustomerOrderStatusBannerText(orderStatus, order.paymentStatus);
  const pageTitle = isRideOrder ? "Ride Details" : "Order Details";
  const billTitle = isRideOrder ? "Fare Summary" : "Bill Summary";

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>{pageTitle}</AppText>
          <TouchableOpacity onPress={handleOpenHelp} style={styles.headerSideRight} hitSlop={12}>
            <Ionicons name="headset-outline" size={18} color={GREEN} />
            <AppText style={styles.supportText}>Support</AppText>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: 16, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {showOrderPrepDelayMarquee ? (
            <PrepDelayMarqueeBanner message={prepDelayBanner!.message} />
          ) : null}

          {isInProgress && !isRideOrder && trackingWeather?.showBanner ? (
            <View style={styles.weatherTrackingCard}>
              <AppText style={styles.weatherTrackingTitle}>
                {trackingWeather.bannerTitle ?? trackingWeather.chipLabel}
              </AppText>
              {trackingWeather.bannerSubtitle || trackingWeather.trackingMessage ? (
                <AppText style={styles.weatherTrackingSub}>
                  {trackingWeather.bannerSubtitle || trackingWeather.trackingMessage}
                </AppText>
              ) : null}
            </View>
          ) : isInProgress && !isRideOrder && trackingWeather?.showChip ? (
            <View style={styles.weatherTrackingInline}>
              <WeatherStatusChip weather={trackingWeather} variant="inline" />
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, (isCancelled || isFailed) && styles.statusIconDanger]}>
                <Ionicons
                  name={isCancelled || isFailed ? "bag-remove-outline" : isDelivered ? "bag-check-outline" : "bag-outline"}
                  size={18}
                  color={isCancelled || isFailed ? "#DC2626" : GREEN}
                />
              </View>
              <AppText style={styles.statusText}>{statusBanner}</AppText>
            </View>
          </View>

          {isDelivered && order.storeRatingSubmitted && order.storeRating != null && !isRideOrder ? (
            <View style={styles.card}>
              <AppText style={styles.feedbackCardTitle}>Your feedback</AppText>
              <View style={styles.feedbackRatingRow}>
                <AppText style={styles.feedbackRatingLabel}>Restaurant</AppText>
                <View style={styles.feedbackStars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons
                      key={n}
                      name={n <= order.storeRating! ? "star" : "star-outline"}
                      size={18}
                      color={n <= order.storeRating! ? "#F59E0B" : "#D1D5DB"}
                    />
                  ))}
                </View>
              </View>
              {order.deliveryRating != null ? (
                <View style={styles.feedbackRatingRow}>
                  <AppText style={styles.feedbackRatingLabel}>Delivery</AppText>
                  <View style={styles.feedbackStars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Ionicons
                        key={n}
                        name={n <= order.deliveryRating! ? "star" : "star-outline"}
                        size={18}
                        color={n <= order.deliveryRating! ? "#F59E0B" : "#D1D5DB"}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              {order.storeReviewText ? (
                <AppText style={styles.feedbackReviewText}>
                  <AppText style={styles.feedbackReviewLabel}>Restaurant: </AppText>
                  {order.storeReviewText}
                </AppText>
              ) : null}
              {order.riderReviewText ? (
                <AppText style={styles.feedbackReviewText}>
                  <AppText style={styles.feedbackReviewLabel}>Delivery: </AppText>
                  {order.riderReviewText}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.restaurantRow}>
              <View style={styles.restaurantLogo}>
                {isRideOrder ? (
                  <Ionicons name="bicycle" size={22} color={GREEN} />
                ) : bannerUri ? (
                  <Image source={{ uri: bannerUri }} style={styles.restaurantLogoImg} resizeMode="cover" />
                ) : (
                  <AppText style={styles.restaurantInitial}>{restaurantName.slice(0, 1).toUpperCase()}</AppText>
                )}
              </View>
              <View style={styles.restaurantInfo}>
                <AppText style={styles.restaurantName} numberOfLines={1}>
                  {restaurantName}
                </AppText>
                {!!merchantArea && (
                  <AppText style={styles.restaurantArea} numberOfLines={isRideOrder ? 2 : 1}>
                    {isRideOrder ? `Pickup · ${merchantArea}` : merchantArea}
                  </AppText>
                )}
                {isRideOrder && dropAddress ? (
                  <AppText style={styles.restaurantArea} numberOfLines={2}>
                    Drop · {dropAddress}
                  </AppText>
                ) : null}
              </View>
              {!isRideOrder ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => {
                    const storeId = order.merchantPublicStoreId;
                    if (storeId) router.push(`/home/merchant/${storeId}`);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={18} color={GREEN} />
                </TouchableOpacity>
              ) : order.rider?.phone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => {
                    const phone = order.rider?.phone?.replace(/\D/g, "");
                    if (!phone) return;
                    const normalized =
                      phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
                    Linking.openURL(`tel:${normalized}`).catch(() => {});
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={18} color={GREEN} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.orderIdRow}>
              <AppText style={styles.orderIdText}>Order ID: #{displayOrderId}</AppText>
              <TouchableOpacity onPress={handleCopyOrderId} hitSlop={8}>
                <Ionicons name="copy-outline" size={16} color={MUTED} />
              </TouchableOpacity>
            </View>

            {!isRideOrder
              ? items.map((item, index) => {
              const diet = toDietType(item.vegNonVeg);
              const lineTotal = item.lineTotal ?? item.price * item.quantity;
              const lineItem: OrderDetailLineItem = {
                name: item.name,
                quantity: item.quantity,
                variantName: item.variantName,
                customization: item.customization,
              };
              const hasCust = orderItemHasCustomizations(lineItem);
              return (
                <View key={`${displayOrderId}-item-${index}`}>
                  <TouchableOpacity
                    style={[styles.itemRow, hasCust && styles.itemRowClickable]}
                    activeOpacity={hasCust ? 0.7 : 1}
                    disabled={!hasCust}
                    onPress={() => hasCust && setCustomizationItem(lineItem)}
                    accessibilityRole={hasCust ? "button" : undefined}
                    accessibilityLabel={
                      hasCust
                        ? `${item.quantity} ${item.name}, view customizations`
                        : undefined
                    }
                  >
                    <View style={styles.itemLeft}>
                      {diet != null && (
                        <View style={styles.dietWrap}>
                          <DietIndicator type={diet} />
                        </View>
                      )}
                      <View style={styles.itemTextWrap}>
                        <View style={styles.itemNameRow}>
                          <AppText style={[styles.itemName, styles.itemNameFlex]} numberOfLines={2}>
                            {item.quantity} x {item.name}
                          </AppText>
                          {hasCust ? (
                            <TouchableOpacity
                              style={styles.infoBtn}
                              onPress={() => setCustomizationItem(lineItem)}
                              hitSlop={8}
                              accessibilityLabel="View customizations"
                            >
                              <Ionicons
                                name="information-circle-outline"
                                size={20}
                                color={GREEN}
                              />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {hasCust ? (
                          <AppText style={styles.itemTapHint}>Tap to see size & add-ons</AppText>
                        ) : null}
                      </View>
                    </View>
                    <AppText style={styles.itemPrice}>₹{Math.round(lineTotal)}</AppText>
                  </TouchableOpacity>
                  {hasCust ? (
                    <AppText style={styles.itemDashedText} numberOfLines={1} accessibilityElementsHidden>
                      — — — — — — — — —
                    </AppText>
                  ) : null}
                </View>
              );
            })
              : null}
          </View>

          {isInProgress && !isRideOrder ? (
            <View style={styles.card}>
              <View style={styles.mapWrap}>
                {mapReady ? (
                  <MapboxWebDeliveryMap
                    style={styles.map}
                    center={deliveryMapCenter}
                    payload={deliveryMapPayload}
                  />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator size="small" color={GREEN} />
                  </View>
                )}
                {liveEtaMins != null && liveEtaMins > 0 ? (
                  <View style={styles.etaPill}>
                    <Ionicons name="time-outline" size={16} color={GREEN} />
                    <AppText style={styles.etaText}>Arriving in ~{liveEtaMins} mins</AppText>
                  </View>
                ) : null}
              </View>
              {order.pickupOtp ? (
                <View style={styles.otpRow}>
                  <Ionicons name="key-outline" size={16} color={GREEN} />
                  <AppText style={styles.otpText}>
                    Pickup OTP: <AppText style={styles.otpValue}>{order.pickupOtp}</AppText>
                  </AppText>
                </View>
              ) : null}
              {order.deliveryOtp ? (
                <View style={styles.otpRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={GREEN} />
                  <AppText style={styles.otpText}>
                    Delivery OTP: <AppText style={styles.otpValue}>{order.deliveryOtp}</AppText>
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}

          {order.refund &&
          ((order.refund.amount != null && order.refund.amount > 0) ||
            isCustomerOrderRefundCompleted({
              paymentStatus: order.paymentStatus,
              refundStatus: order.refund.status ?? order.refundStatus,
            })) ? (
            <OrderRefundCard refund={order.refund} />
          ) : null}

          <View style={styles.card}>
            <View style={styles.billHeader}>
              <View style={styles.billHeaderLeft}>
                <View style={styles.billIconWrap}>
                  <Ionicons name="receipt-outline" size={16} color={MUTED} />
                </View>
                <AppText style={styles.billTitle}>{billTitle}</AppText>
              </View>
              <TouchableOpacity onPress={handleBillSummaryReceipt} hitSlop={8} disabled={receiptDownloading}>
                <Ionicons name="download-outline" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>

            {!isRideOrder ? (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Item total</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.itemTotal || items.reduce((s, i) => s + (i.lineTotal ?? i.price * i.quantity), 0))}</AppText>
              </View>
            ) : null}
            {bill.gstAndPackaging > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>GST & restaurant packaging</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.gstAndPackaging)}</AppText>
              </View>
            )}
            {(bill.deliveryFeeOriginal != null || bill.deliveryFee > 0.005) && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Delivery partner fee</AppText>
                {bill.deliveryFeeOriginal != null ? (
                  bill.deliveryDisplayFree || bill.deliveryFee <= 0.005 ? (
                    <View style={styles.freeDeliveryWrap}>
                      <AppText style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</AppText>
                      <AppText style={styles.freeText}>FREE</AppText>
                    </View>
                  ) : (
                    <View style={styles.freeDeliveryWrap}>
                      <AppText style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</AppText>
                      <AppText style={styles.billValue}>{formatMoney(bill.deliveryFee)}</AppText>
                    </View>
                  )
                ) : (
                  <AppText style={styles.billValue}>{formatMoney(bill.deliveryFee)}</AppText>
                )}
              </View>
            )}
            {bill.platformFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Platform fee</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.platformFee)}</AppText>
              </View>
            )}
            {bill.donation > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Feeding India donation</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.donation)}</AppText>
              </View>
            )}
            {bill.tipAmount > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Tip for delivery partner</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.tipAmount)}</AppText>
              </View>
            )}
            {bill.surgeFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Surge fee</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.surgeFee)}</AppText>
              </View>
            )}
            {bill.smallOrderFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Small order fee</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.smallOrderFee)}</AppText>
              </View>
            )}
            {bill.convenienceFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Convenience fee</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.convenienceFee)}</AppText>
              </View>
            )}
            {bill.miscFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Other charges</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.miscFee)}</AppText>
              </View>
            )}
            {bill.subscriptionFee > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>{bill.subscriptionLabel ?? "Membership"}</AppText>
                <AppText style={styles.billValue}>{formatMoney(bill.subscriptionFee)}</AppText>
              </View>
            )}

            <View style={styles.billDivider} />

            <View style={[styles.billRow, styles.billGrandRow]}>
              <AppText style={styles.billGrandLabel}>Grand total</AppText>
              <AppText style={styles.billGrandValue}>{formatMoney(bill.grandTotal)}</AppText>
            </View>

            {bill.discountLines.length > 0
              ? bill.discountLines.map((line, idx) => (
                  <View key={`disc-${line.code ?? line.label}-${idx}`} style={styles.billRow}>
                    <AppText style={styles.couponLabel}>{line.label}</AppText>
                    <AppText style={styles.couponValue}>- {formatMoney(line.amount)}</AppText>
                  </View>
                ))
              : bill.couponDiscount > 0.005 && (
                  <View style={styles.billRow}>
                    <AppText style={styles.couponLabel}>
                      Coupon applied{bill.couponCode ? ` - ${bill.couponCode}` : ""}
                    </AppText>
                    <AppText style={styles.couponValue}>- {formatMoney(bill.couponDiscount)}</AppText>
                  </View>
                )}

            {bill.gatiCashApplied > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.couponLabel}>Using GatiCash</AppText>
                <AppText style={styles.couponValue}>- {formatMoney(bill.gatiCashApplied)}</AppText>
              </View>
            )}

            {bill.missedOfferDiscount > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.couponLabel}>Offer discount</AppText>
                <AppText style={styles.couponValue}>- {formatMoney(bill.missedOfferDiscount)}</AppText>
              </View>
            )}

            {bill.missedOfferWalletAdd > 0.005 && (
              <View style={styles.billRow}>
                <AppText style={styles.billLabel}>Add to GatiCash wallet</AppText>
                <AppText style={styles.billValue}>+ {formatMoney(bill.missedOfferWalletAdd)}</AppText>
              </View>
            )}

            <View style={[styles.billRow, styles.billPaidRow]}>
              <AppText style={styles.paidLabel}>{isCancelled || isFailed ? "Amount" : "Paid"}</AppText>
              <View style={{ alignItems: "flex-end" }}>
                <AppText style={styles.paidValue}>{formatMoney(bill.paid)}</AppText>
                {order.fullyGatiCashUsed === true ? (
                  <AppText style={styles.gatiCashPaidHint}>100% GatiCash used</AppText>
                ) : null}
              </View>
            </View>

            {bill.totalSavings > 0.005 && (
              <View style={styles.savingsBanner}>
                <AppText style={styles.savingsText}>🎉 You saved {formatMoney(bill.totalSavings)} on this order!</AppText>
              </View>
            )}
          </View>

          {order.rider && !hideRiderOnInnerPage ? (
            <View style={styles.card}>
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <AppText style={styles.riderAvatarText}>{order.rider.name.slice(0, 1).toUpperCase()}</AppText>
                </View>
                <View style={styles.riderInfo}>
                  <AppText style={styles.riderName}>{order.rider.name}</AppText>
                  {order.rider.phone ? (
                    <AppText style={styles.riderPhone}>{maskPhone(order.rider.phone)}</AppText>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {hasAlternateContact && (alternateContactName || alternateContactPhone) ? (
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={GREEN} />
                <View style={styles.infoTextWrap}>
                  <AppText style={styles.infoTitle}>Alternate contact number</AppText>
                  <AppText style={styles.infoSub}>
                    {alternateContactName ? alternateContactName : "Contact"}
                    {alternateContactPhone ? ` · ${maskPhone(alternateContactPhone)}` : ""}
                  </AppText>
                </View>
              </View>
            </View>
          ) : null}

          {deliveryCustomerName ? (
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color={GREEN} />
                <View style={styles.infoTextWrap}>
                  <AppText style={styles.infoTitle}>Customer name</AppText>
                  <AppText style={styles.infoSub}>{deliveryCustomerName}</AppText>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <AppText style={styles.infoTitle}>Payment method</AppText>
                <AppText style={styles.infoSub}>Paid via: {paymentMethodLabel}</AppText>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <AppText style={styles.infoTitle}>Payment date</AppText>
                <AppText style={styles.infoSub}>{formatPaymentDate(order.createdAt)}</AppText>
              </View>
            </View>
            {!!order.deliveryAddress && (
              <>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color={GREEN} />
                  <View style={styles.infoTextWrap}>
                    <AppText style={styles.infoTitle}>Delivery address</AppText>
                    <DeliveryAddressText address={order.deliveryAddress} style={styles.infoSub} />
                  </View>
                </View>
              </>
            )}
          </View>

          <LegalFooter
            prefix="See"
            docIds={["refund-cancellation-policy", "shipping-delivery-policy"]}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleInvoice} activeOpacity={0.9}>
            <Ionicons name="download-outline" size={18} color={GREEN} />
            <AppText style={styles.invoiceText}>Invoice</AppText>
          </TouchableOpacity>
        </View>

        <OrderItemCustomizationModal
          visible={customizationItem != null}
          item={customizationItem}
          onClose={() => setCustomizationItem(null)}
        />

        {renderOrderRatingSheet()}

        <InvoiceDownloadingToast
          visible={invoiceDownloading || receiptDownloading}
          message={receiptDownloading ? "Downloading receipt…" : "Downloading invoice…"}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  mutedText: { marginTop: 12, fontSize: 15, color: MUTED },
  weatherTrackingCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  weatherTrackingTitle: { fontSize: 14, fontWeight: "700", color: "#1D4ED8" },
  weatherTrackingSub: { fontSize: 12, color: "#374151", marginTop: 4, lineHeight: 17 },
  weatherTrackingInline: { marginBottom: 10, alignItems: "flex-start" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: PAGE_BG,
  },
  headerSide: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
  },
  headerSideRight: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: TEXT,
  },
  supportText: {
    fontSize: 13,
    fontWeight: "600",
    color: GREEN,
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  mapWrap: {
    height: 200,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F0",
  },
  etaPill: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  etaText: { fontSize: 14, fontWeight: "600", color: TEXT },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  otpText: { fontSize: 13, color: MUTED },
  otpValue: { fontWeight: "700", color: TEXT },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconDanger: { backgroundColor: "#FEF2F2" },
  statusText: { flex: 1, fontSize: 16, fontWeight: "700", color: TEXT },
  feedbackCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 10,
  },
  feedbackRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  feedbackRatingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
  },
  feedbackStars: {
    flexDirection: "row",
    gap: 4,
  },
  feedbackReviewText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: TEXT,
  },
  feedbackReviewLabel: {
    fontWeight: "600",
    color: MUTED,
  },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  restaurantLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantLogoImg: { width: "100%", height: "100%" },
  restaurantInitial: { fontSize: 18, fontWeight: "700", color: GREEN },
  restaurantInfo: { flex: 1 },
  restaurantName: { fontSize: 16, fontWeight: "700", color: TEXT },
  restaurantArea: { marginTop: 2, fontSize: 12, color: MUTED },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  orderIdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  orderIdText: { fontSize: 13, fontWeight: "600", color: TEXT },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 12,
    gap: 10,
  },
  itemRowClickable: {
    paddingBottom: 4,
  },
  itemLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dietWrap: { marginTop: 2 },
  itemTextWrap: { flex: 1 },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  itemName: { fontSize: 14, fontWeight: "600", color: TEXT, lineHeight: 18 },
  itemNameFlex: { flex: 1 },
  infoBtn: {
    marginTop: 0,
    padding: 2,
  },
  itemTapHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: GREEN,
  },
  itemDashedText: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 11,
    letterSpacing: 3,
    color: "#B8D4C8",
    textAlign: "center",
  },
  itemPrice: { fontSize: 14, fontWeight: "700", color: TEXT },
  billHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  billHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  billIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  billTitle: { fontSize: 15, fontWeight: "700", color: TEXT },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  billLabel: { flex: 1, fontSize: 13, color: MUTED, paddingRight: 8 },
  billValue: { fontSize: 13, fontWeight: "600", color: TEXT },
  freeDeliveryWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  strikePrice: {
    fontSize: 13,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  freeText: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  billDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginTop: 2,
    marginBottom: 2,
  },
  billGrandRow: {
    paddingVertical: 6,
  },
  billGrandLabel: { fontSize: 14, fontWeight: "700", color: TEXT },
  billGrandValue: { fontSize: 14, fontWeight: "700", color: TEXT },
  billPaidRow: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  couponLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: LINK_BLUE },
  couponValue: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  paidLabel: { fontSize: 15, fontWeight: "700", color: TEXT },
  paidValue: { fontSize: 15, fontWeight: "800", color: TEXT },
  gatiCashPaidHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: GREEN,
  },
  savingsBanner: {
    marginTop: 10,
    backgroundColor: "#EBF5FF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  savingsText: { fontSize: 13, fontWeight: "600", color: LINK_BLUE, textAlign: "center" },
  riderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  riderAvatarText: { fontSize: 16, fontWeight: "700", color: GREEN },
  riderInfo: { flex: 1 },
  riderName: { fontSize: 15, fontWeight: "700", color: TEXT },
  riderPhone: { marginTop: 2, fontSize: 12, color: MUTED },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  infoDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  infoTextWrap: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: "700", color: TEXT },
  infoSub: { marginTop: 3, fontSize: 12, lineHeight: 17, color: MUTED },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  invoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    backgroundColor: CARD,
  },
  invoiceText: { fontSize: 15, fontWeight: "700", color: GREEN },
});
