/**
 * Order Details – delivered / cancelled / live tracking (reference UI + GatiMitra green).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  InteractionManager,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { MapboxWebDeliveryMap } from "@/components/maps/MapboxWebDeliveryMap";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import { orderService } from "@/services/order.service";
import { etaService } from "@/services/eta.service";
import { resolveLiveEtaMinutes } from "@/lib/order-eta-display";
import { PrepDelayMarqueeBanner } from "@/components/orders/PrepDelayMarqueeBanner";
import { getRouteCoordinates } from "@/services/directions.service";
import { useOrderStore } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { DietIndicator } from "@/components/store/DietIndicator";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import { getOrderDetailInitialData } from "@/lib/orderDetailCache";
import { resolveOrderItemDiet } from "@/lib/reorderFromOrder";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { OrderItemCustomizationModal } from "@/components/orders/OrderItemCustomizationModal";
import { OrderDeliveryRatingSheet } from "@/components/orders/OrderDeliveryRatingSheet";
import {
  getCustomerOrderStatusBannerText,
  getPersonRideStatusBannerText,
  isPersonRideOrder,
  isPersonRideSearchingStatus,
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";
import { RideAcceptedTrackingScreen } from "@/components/ride/RideAcceptedTrackingScreen";
import { RideOrderDetailsScreen } from "@/components/ride/RideOrderDetailsScreen";
import {
  orderItemHasCustomizations,
  type OrderDetailLineItem,
} from "@/lib/order-item-customization-display";

const GREEN = GatiMitraColors.primaryMint;
const LINK_BLUE = "#2563EB";
const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const BORDER = "#EBEBEB";
const TEXT = "#1C1C1C";
const MUTED = "#828282";

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;

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

export default function OrderDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, rate } = useLocalSearchParams<{ id: string; rate?: string }>();
  const orderId = id ?? "";
  const [mapReady, setMapReady] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<OrderDetailLineItem | null>(null);
  const [ratingSheetVisible, setRatingSheetVisible] = useState(false);
  const [ratingDismissed, setRatingDismissed] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const prevDeliveredRef = useRef(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderService.getOrder(orderId),
    enabled: !!orderId,
    initialData: () => getOrderDetailInitialData(queryClient, orderId),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = (query.state.data?.status ?? "").toUpperCase();
      if (
        !status ||
        status === "DELIVERED" ||
        status === "CANCELLED" ||
        status === "PAYMENT_FAILED" ||
        status === "FAILED"
      ) {
        return false;
      }
      return 5_000;
    },
  });

  const orderStatus = normalizeCustomerOrderStatus(order?.status);
  const isInProgress = !!order && !isTerminalOrderStatus(orderStatus);

  useEffect(() => {
    if (!order || !isPersonRideOrder(order)) return;
    if (isPersonRideSearchingStatus(order, order.status) && !order.rider) {
      router.replace({
        pathname: "/home/service/ride-searching",
        params: { orderId: order.orderId },
      });
    }
  }, [order, router]);

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
    refetchInterval: isInProgress ? 2000 : false,
    staleTime: 1500,
  });

  const deliveryLat = order?.deliveryLat != null ? order.deliveryLat : DEFAULT_LAT + 0.008;
  const deliveryLng = order?.deliveryLng != null ? order.deliveryLng : DEFAULT_LNG + 0.008;
  const pickupLat = order?.pickupLat != null ? order.pickupLat : DEFAULT_LAT - 0.006;
  const pickupLng = order?.pickupLng != null ? order.pickupLng : DEFAULT_LNG - 0.006;

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
    if (rate === "1" || rate === "true") {
      setRatingDismissed(false);
    }
  }, [rate]);

  useEffect(() => {
    if (!order) return;
    const delivered = normalizeCustomerOrderStatus(order.status) === "DELIVERED";
    const alreadyRated = order.storeRatingSubmitted === true;
    const wantsRate = rate === "1" || rate === "true";
    if (delivered && !alreadyRated && (!ratingDismissed || wantsRate)) {
      setRatingSheetVisible(true);
    }
    if (!delivered) {
      prevDeliveredRef.current = false;
    } else if (delivered && !prevDeliveredRef.current) {
      prevDeliveredRef.current = true;
    }
  }, [order?.status, order?.storeRatingSubmitted, ratingDismissed, rate, order]);

  const handleSubmitStoreRating = async (payload: {
    storeRating: number;
    deliveryRating: number;
    reviewText?: string;
    riderReviewText?: string;
    riderTipAmount?: number;
  }) => {
    if (!orderId) return;
    setRatingSubmitting(true);
    try {
      await orderService.submitStoreRating(orderId, payload);
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

  const deliveryMapPayload = useMemo<DeliveryMapPayload>(
    () => ({
      pickupLat,
      pickupLng,
      dropLat: deliveryLat,
      dropLng: deliveryLng,
      riderLat: tracking?.rider?.latitude ?? null,
      riderLng: tracking?.rider?.longitude ?? null,
      route: routeCoordinates,
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

  const handleOpenHelp = () => {
    router.push({
      pathname: "/orders/raise-ticket",
      params: {
        orderId: String(order?.orderId ?? orderId),
        orderRef: String(order?.formattedOrderId ?? order?.orderId ?? orderId),
        ...(order?.coreOrderId != null ? { coreOrderId: String(order.coreOrderId) } : {}),
      },
    });
  };

  const handleCopyOrderId = async () => {
    const text = order?.formattedOrderId ?? order?.orderId ?? orderId;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Order ID copied to clipboard.");
  };

  const handleInvoice = () => {
    Alert.alert("Invoice", "Invoice download will be available soon.");
  };

  if (!orderId) {
    return (
      <View style={[styles.center, styles.screen]}>
        <Text style={styles.mutedText}>Invalid order</Text>
      </View>
    );
  }

  if (isLoading && !order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.mutedText}>Loading order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <Text style={styles.mutedText}>Order not found</Text>
      </View>
    );
  }

  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const isRideOrder = isPersonRideOrder(order);
  const isRideSearching =
    isRideOrder && isPersonRideSearchingStatus(order, order.status) && !order.rider;

  if (isRideSearching) {
    return (
      <View style={[styles.center, styles.screen]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.mutedText}>Opening ride search…</Text>
      </View>
    );
  }

  if (isRideOrder && isInProgress) {
    return (
      <>
        <AndroidBackHandler />
        <RideAcceptedTrackingScreen
          order={order}
          tracking={tracking}
          etaMinutes={liveEtaMins}
          onBack={() => router.back()}
          onOpenSupport={handleOpenHelp}
        />
      </>
    );
  }

  if (isRideOrder && isTerminalOrderStatus(orderStatus)) {
    return (
      <>
        <AndroidBackHandler />
        <RideOrderDetailsScreen
          order={order}
          onBack={() => router.back()}
          onOpenSupport={handleOpenHelp}
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
  const bill = parseOrderBillFromSnapshot(order.billingSnapshot, order.totalAmount ?? null);
  const isCancelled = orderStatus === "CANCELLED";
  const isDelivered = orderStatus === "DELIVERED";
  const isFailed =
    orderStatus === "PAYMENT_FAILED" ||
    orderStatus === "FAILED" ||
    order.paymentStatus?.toLowerCase() === "failed";
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
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{pageTitle}</Text>
          <TouchableOpacity onPress={handleOpenHelp} style={styles.headerSideRight} hitSlop={12}>
            <Ionicons name="headset-outline" size={18} color={GREEN} />
            <Text style={styles.supportText}>Support</Text>
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

          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, (isCancelled || isFailed) && styles.statusIconDanger]}>
                <Ionicons
                  name={isCancelled || isFailed ? "bag-remove-outline" : isDelivered ? "bag-check-outline" : "bag-outline"}
                  size={18}
                  color={isCancelled || isFailed ? "#DC2626" : GREEN}
                />
              </View>
              <Text style={styles.statusText}>{statusBanner}</Text>
            </View>
          </View>

          {isDelivered && order.storeRatingSubmitted && order.storeRating != null && !isRideOrder ? (
            <View style={styles.card}>
              <Text style={styles.feedbackCardTitle}>Your feedback</Text>
              <View style={styles.feedbackRatingRow}>
                <Text style={styles.feedbackRatingLabel}>Restaurant</Text>
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
                  <Text style={styles.feedbackRatingLabel}>Delivery</Text>
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
                <Text style={styles.feedbackReviewText}>
                  <Text style={styles.feedbackReviewLabel}>Restaurant: </Text>
                  {order.storeReviewText}
                </Text>
              ) : null}
              {order.riderReviewText ? (
                <Text style={styles.feedbackReviewText}>
                  <Text style={styles.feedbackReviewLabel}>Delivery: </Text>
                  {order.riderReviewText}
                </Text>
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
                  <Text style={styles.restaurantInitial}>{restaurantName.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.restaurantInfo}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurantName}
                </Text>
                {!!merchantArea && (
                  <Text style={styles.restaurantArea} numberOfLines={isRideOrder ? 2 : 1}>
                    {isRideOrder ? `Pickup · ${merchantArea}` : merchantArea}
                  </Text>
                )}
                {isRideOrder && dropAddress ? (
                  <Text style={styles.restaurantArea} numberOfLines={2}>
                    Drop · {dropAddress}
                  </Text>
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
              <Text style={styles.orderIdText}>Order ID: #{displayOrderId}</Text>
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
                          <Text style={[styles.itemName, styles.itemNameFlex]} numberOfLines={2}>
                            {item.quantity} x {item.name}
                          </Text>
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
                          <Text style={styles.itemTapHint}>Tap to see size & add-ons</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.itemPrice}>₹{Math.round(lineTotal)}</Text>
                  </TouchableOpacity>
                  {hasCust ? (
                    <Text style={styles.itemDashedText} numberOfLines={1} accessibilityElementsHidden>
                      — — — — — — — — —
                    </Text>
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
                    fitCoords={deliveryMapFitCoords}
                  />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator size="small" color={GREEN} />
                  </View>
                )}
                {liveEtaMins != null && liveEtaMins > 0 ? (
                  <View style={styles.etaPill}>
                    <Ionicons name="time-outline" size={16} color={GREEN} />
                    <Text style={styles.etaText}>Arriving in ~{liveEtaMins} mins</Text>
                  </View>
                ) : null}
              </View>
              {order.pickupOtp ? (
                <View style={styles.otpRow}>
                  <Ionicons name="key-outline" size={16} color={GREEN} />
                  <Text style={styles.otpText}>
                    Pickup OTP: <Text style={styles.otpValue}>{order.pickupOtp}</Text>
                  </Text>
                </View>
              ) : null}
              {order.deliveryOtp ? (
                <View style={styles.otpRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={GREEN} />
                  <Text style={styles.otpText}>
                    Delivery OTP: <Text style={styles.otpValue}>{order.deliveryOtp}</Text>
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.billHeader}>
              <View style={styles.billHeaderLeft}>
                <View style={styles.billIconWrap}>
                  <Ionicons name="receipt-outline" size={16} color={MUTED} />
                </View>
                <Text style={styles.billTitle}>{billTitle}</Text>
              </View>
              <TouchableOpacity onPress={handleInvoice} hitSlop={8}>
                <Ionicons name="download-outline" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>

            {!isRideOrder ? (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item total</Text>
                <Text style={styles.billValue}>{formatMoney(bill.itemTotal || items.reduce((s, i) => s + (i.lineTotal ?? i.price * i.quantity), 0))}</Text>
              </View>
            ) : null}
            {bill.gstAndPackaging > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>GST & restaurant packaging</Text>
                <Text style={styles.billValue}>{formatMoney(bill.gstAndPackaging)}</Text>
              </View>
            )}
            {(bill.deliveryFeeOriginal != null || bill.deliveryFee > 0.005) && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery partner fee</Text>
                {bill.deliveryFee <= 0.005 && bill.deliveryFeeOriginal != null ? (
                  <View style={styles.freeDeliveryWrap}>
                    <Text style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</Text>
                    <Text style={styles.freeText}>FREE</Text>
                  </View>
                ) : (
                  <Text style={styles.billValue}>{formatMoney(bill.deliveryFee)}</Text>
                )}
              </View>
            )}
            {bill.platformFee > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Platform fee</Text>
                <Text style={styles.billValue}>{formatMoney(bill.platformFee)}</Text>
              </View>
            )}
            {bill.donation > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Feeding India donation</Text>
                <Text style={styles.billValue}>{formatMoney(bill.donation)}</Text>
              </View>
            )}

            <View style={[styles.billRow, styles.billGrandRow]}>
              <Text style={styles.billGrandLabel}>Grand total</Text>
              <Text style={styles.billGrandValue}>{formatMoney(bill.grandTotal || bill.paid)}</Text>
            </View>

            {bill.couponDiscount > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.couponLabel}>
                  Coupon applied{bill.couponCode ? ` - ${bill.couponCode}` : ""}
                </Text>
                <Text style={styles.couponValue}>- {formatMoney(bill.couponDiscount)}</Text>
              </View>
            )}

            <View style={styles.billRow}>
              <Text style={styles.paidLabel}>{isCancelled || isFailed ? "Amount" : "Paid"}</Text>
              <Text style={styles.paidValue}>{formatMoney(bill.paid)}</Text>
            </View>

            {bill.totalSavings > 0.005 && (
              <View style={styles.savingsBanner}>
                <Text style={styles.savingsText}>🎉 You saved {formatMoney(bill.totalSavings)} on this order!</Text>
              </View>
            )}
          </View>

          {order.rider ? (
            <View style={styles.card}>
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <Text style={styles.riderAvatarText}>{order.rider.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.riderInfo}>
                  <Text style={styles.riderName}>{order.rider.name}</Text>
                  {order.rider.phone ? (
                    <Text style={styles.riderPhone}>{maskPhone(order.rider.phone)}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Payment method</Text>
                <Text style={styles.infoSub}>Paid via: {paymentMethodLabel}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Payment date</Text>
                <Text style={styles.infoSub}>{formatPaymentDate(order.createdAt)}</Text>
              </View>
            </View>
            {!!order.deliveryAddress && (
              <>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color={GREEN} />
                  <View style={styles.infoTextWrap}>
                    <Text style={styles.infoTitle}>Delivery address</Text>
                    <Text style={styles.infoSub}>{order.deliveryAddress}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleInvoice} activeOpacity={0.9}>
            <Ionicons name="download-outline" size={18} color={GREEN} />
            <Text style={styles.invoiceText}>Invoice</Text>
          </TouchableOpacity>
        </View>

        <OrderItemCustomizationModal
          visible={customizationItem != null}
          item={customizationItem}
          onClose={() => setCustomizationItem(null)}
        />

        <OrderDeliveryRatingSheet
          visible={ratingSheetVisible && isDelivered && !order.storeRatingSubmitted}
          storeName={restaurantName}
          storeBannerUri={bannerUri}
          riderName={order.rider?.name}
          checkoutTipAmount={order.tipAmount ?? 0}
          submitting={ratingSubmitting}
          onClose={() => {
            setRatingSheetVisible(false);
            setRatingDismissed(true);
          }}
          onSubmit={handleSubmitStoreRating}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  mutedText: { marginTop: 12, fontSize: 15, color: MUTED },
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
  billGrandRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  billGrandLabel: { fontSize: 14, fontWeight: "700", color: TEXT },
  billGrandValue: { fontSize: 14, fontWeight: "700", color: TEXT },
  couponLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: LINK_BLUE },
  couponValue: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  paidLabel: { fontSize: 15, fontWeight: "700", color: TEXT },
  paidValue: { fontSize: 15, fontWeight: "800", color: TEXT },
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
