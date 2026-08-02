/**
 * Live food order tracking — mint header, map, scrollable cards.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Alert, Dimensions } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveTrackingStatusChip } from "@/components/orders/LiveTrackingStatusChip";
import { MapboxWebDeliveryMap } from "@/components/maps/MapboxWebDeliveryMap";
import type { DeliveryMapPayload } from "@/components/maps/mapbox-web-delivery-html";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DEFAULT_STATUS_BAR_HEIGHT, STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import type { OrderDetail, OrderTrackingResponse } from "@/services/order.service";
import { merchantService } from "@/services/merchant.service";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { WeatherStatusChip } from "@/components/weather";
import { PrepDelayMarqueeBanner } from "@/components/orders/PrepDelayMarqueeBanner";
import { useOrderStore } from "@/store/orderStore";
import { OrderItemCustomizationModal } from "@/components/orders/OrderItemCustomizationModal";
import { FoodOrderCancelSheet } from "@/components/orders/FoodOrderCancelSheet";
import { RideTripShareSheet } from "@/components/ride/RideTripShareSheet";
import { DeliveryPartnerSafetyBottomSheet } from "@/components/orders/DeliveryPartnerSafetyBottomSheet";
import { DeliveryPartnerTrackingCard } from "@/components/orders/DeliveryPartnerTrackingCard";
import { FoodOrderTipSheet } from "@/components/orders/FoodOrderTipSheet";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useFoodDeliveryRouteProgress } from "@/hooks/useFoodDeliveryRouteProgress";
import { resolveOrderTrackingMapSnapshots } from "@/lib/orderTrackingMapSnapshots";
import {
  FOOD_DELIVERY_GEOFENCE_RADIUS_M,
  FOOD_DELIVERY_GEOFENCE_PROXIMITY_M,
  getFoodDeliveryMapPhase,
  shouldHighlightFoodDropZone,
  shouldHighlightFoodPickupZone,
} from "@/lib/food-delivery-map-phase";
import {
  getCustomerOrderLiveHeadline,
  getCustomerOrderEtaPillText,
  isRiderAtCustomerStatus,
  isTerminalOrderStatus,
  normalizeCustomerOrderStatus,
  shouldShowCustomerDeliveryOtp,
} from "@/lib/customer-order-status-display";
import {
  orderItemHasCustomizations,
  type OrderDetailLineItem,
} from "@/lib/order-item-customization-display";
import { OrderDeliveryDetailsCard } from "@/components/orders/OrderDeliveryDetailsCard";
import { OrderRestaurantCard } from "@/components/orders/OrderRestaurantCard";
import { OrderBillBreakdownSheet } from "@/components/orders/OrderBillBreakdownSheet";
import { CookingRequestBottomSheet } from "@/components/orders/CookingRequestBottomSheet";
import { DeliveryPartnerInstructionSheet } from "@/components/address/DeliveryPartnerInstructionSheet";
import {
  AlternateContactFlow,
  type AlternateContactFlowRef,
} from "@/components/orders/AlternateContactFlow";
import { buildOrderDeliveryDetailsView } from "@/lib/order-delivery-details";
import { useStableOrderInstructionLists } from "@/lib/order-instruction-display";
import { canAddCookingRequestForOrder } from "@/lib/merchant-instructions";
import { canCustomerUpdateAlternateContact } from "@/lib/alternate-contact";
import { canCustomerUpdateDeliveryInstructions } from "@/lib/delivery-instructions";
import { orderService } from "@/services/order.service";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
/** Solid header fill — dense green (no visible gradient band). */
const HEADER_GREEN = MINT_DARK;
const PAGE_BG = GatiMitraColors.softBackground;
const CARD = GatiMitraColors.cardSurface;
const BORDER = GatiMitraColors.border;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

const { height: SCREEN_H } = Dimensions.get("window");
const MAP_CORNER_RADIUS = 20;
const MAP_HEIGHT = Math.round(SCREEN_H * 0.4);
/** ETA pill + refresh square — matched height. */
const ETA_CHIP_HEIGHT = 34;
const ETA_CHIP_RADIUS = 10;
const ETA_CHIP_BG = "rgba(0,0,0,0.22)";
const ETA_CHIP_BORDER = "rgba(255,255,255,0.22)";

type FoodLiveTrackingScreenProps = {
  order: OrderDetail;
  tracking: OrderTrackingResponse | undefined;
  etaMinutes: number | null;
  merchantDelayed?: boolean;
  etaUpdated?: boolean;
  etaContextLabel?: string | null;
  onBack: () => void;
  onOpenHelp: () => void;
  onOpenMerchant: () => void;
  onOrderCancelled?: () => void;
};

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

function SectionCard({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function DashedDivider() {
  return (
    <View style={styles.dashedDividerWrap}>
      <AppText style={styles.dashedDivider} numberOfLines={1}>
        - - - - - - - - - - - - - - - - - - - -
      </AppText>
    </View>
  );
}

function ChevronRow({
  icon,
  iconColor = MUTED,
  title,
  subtitle,
  trailing,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.chevronRow}>
      <View style={styles.chevronIconWrap}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.chevronTextWrap}>
        <CheckoutText style={styles.chevronTitle}>{title}</CheckoutText>
        {subtitle ? (
          <CheckoutText style={styles.chevronSub} numberOfLines={2}>
            {subtitle}
          </CheckoutText>
        ) : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {content}
    </TouchableOpacity>
  );
}

function DeliveryOtpBanner({ otp }: { otp: string }) {
  return (
    <View style={styles.otpBanner}>
      <View style={styles.otpRow}>
        <View style={styles.otpLeft}>
          <Ionicons name="shield-checkmark-outline" size={17} color={MINT_DARK} />
          <CheckoutText style={styles.otpLabel} numberOfLines={1}>
            Delivery OTP
          </CheckoutText>
        </View>
        <CheckoutText style={styles.otpValue} numberOfLines={1}>
          {otp}
        </CheckoutText>
      </View>
    </View>
  );
}

export function FoodLiveTrackingScreen({
  order,
  tracking,
  etaMinutes,
  merchantDelayed = false,
  etaUpdated = false,
  etaContextLabel = null,
  onBack,
  onOpenHelp,
  onOpenMerchant,
  onOrderCancelled,
}: FoodLiveTrackingScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(HEADER_GREEN, "light");
      return () => resetStatusBarBackground();
    }, [setStatusBarBackground, resetStatusBarBackground])
  );
  const [mapReady, setMapReady] = useState(false);
  const [mapRefitNonce, setMapRefitNonce] = useState(0);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [customizationItem, setCustomizationItem] = useState<OrderDetailLineItem | null>(null);
  const [refreshingEta, setRefreshingEta] = useState(false);
  const [refreshAckVisible, setRefreshAckVisible] = useState(false);
  const refreshAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alternateContactFlowRef = useRef<AlternateContactFlowRef>(null);
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [cookingSheetVisible, setCookingSheetVisible] = useState(false);
  const [deliveryInstructionSheetVisible, setDeliveryInstructionSheetVisible] = useState(false);
  const [safetySheetVisible, setSafetySheetVisible] = useState(false);
  const [billSheetVisible, setBillSheetVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const { deliveryInstructionsList, merchantInstructionsList } =
    useStableOrderInstructionLists(order);
  const [deliveryEditLocked, setDeliveryEditLocked] = useState({
    contact: false,
    address: false,
    instructions: false,
  });

  const { data: chatUnread } = usePartnerChatUnread(
    order.orderId,
    Boolean(order.rider)
  );
  const chatUnreadCount = chatUnread?.unreadCount ?? 0;

  const prepDelayBanner = useOrderStore((s) => s.prepDelayBanner);
  const showPrepDelayMarquee =
    !!prepDelayBanner &&
    prepDelayBanner.orderId === order.orderId &&
    prepDelayBanner.expiresAt > Date.now();

  const orderStatus = normalizeCustomerOrderStatus(order.status);
  /** Assigned delivery partner on the order — keep dashed store↔home map until then. */
  const hasRider = Boolean(
    order.rider && (order.rider.name || order.rider.phone)
  );
  const riderArrived = isRiderAtCustomerStatus(orderStatus);
  const showDeliveryOtpNow = shouldShowCustomerDeliveryOtp(orderStatus, order.deliveryOtp);
  const [deliveryOtpPinned, setDeliveryOtpPinned] = useState(false);

  useEffect(() => {
    if (showDeliveryOtpNow) setDeliveryOtpPinned(true);
  }, [showDeliveryOtpNow]);

  useEffect(() => {
    setDeliveryOtpPinned(false);
  }, [order.orderId]);

  const showDeliveryOtp =
    deliveryOtpPinned &&
    Boolean(order.deliveryOtp?.trim()) &&
    !isTerminalOrderStatus(orderStatus);
  const headline = getCustomerOrderLiveHeadline(orderStatus, hasRider, {
    merchantDelayed,
    etaContextLabel,
    riderReachedPickupAt: order.riderReachedPickupAt,
  });
  const etaPillText = getCustomerOrderEtaPillText(etaMinutes, {
    merchantDelayed,
    etaUpdated,
    riderArrived,
  });

  const restaurantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  const merchantArea = getCompactAddressLine(order.merchantAddress);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const bannerUri = toAbsoluteImageUrl(order.merchantBannerUrl);
  const items = order.items ?? [];
  const bill = parseOrderBillFromSnapshot(
    order.billingSnapshot,
    order.totalAmount ?? null,
    order.tipAmount ?? null
  );
  const billItemTotalFallback = useMemo(
    () => items.reduce((sum, item) => sum + (item.lineTotal ?? item.price * item.quantity), 0),
    [items]
  );
  const deliveryDetails = useMemo(
    () => buildOrderDeliveryDetailsView({ ...order, deliveryInstructionsList }),
    [order, deliveryInstructionsList]
  );
  const canAddCookingRequest = canAddCookingRequestForOrder(orderStatus, {
    riderReachedPickupAt: order.riderReachedPickupAt,
  });
  const hasAlternateContact = Boolean(order.alternateContactSetAt);
  const canUpdateAlternateContact = canCustomerUpdateAlternateContact(orderStatus);
  const canUpdateDeliveryInstructions = canCustomerUpdateDeliveryInstructions(orderStatus);

  useEffect(() => {
    setDeliveryEditLocked({ contact: false, address: false, instructions: false });
  }, [order.orderId]);

  // Immutable order snapshots + store fallback when pickup was stored as 0/null.
  const storeIdForMap =
    order.merchantPublicStoreId?.trim() ||
    (order.merchantStoreId != null ? String(order.merchantStoreId) : null);
  const { data: mapStore } = useQuery({
    queryKey: ["merchant", storeIdForMap, "tracking-map"],
    queryFn: () => merchantService.getMerchantById(storeIdForMap!),
    enabled: Boolean(storeIdForMap),
    staleTime: 5 * 60 * 1000,
  });
  const {
    deliveryLat,
    deliveryLng,
    pickupLat,
    pickupLng,
  } = resolveOrderTrackingMapSnapshots({
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    storeLat: mapStore?.latitude ?? null,
    storeLng: mapStore?.longitude ?? null,
    distanceKm: order.distanceKm ?? null,
  });

  const riderLat = tracking?.rider?.latitude ?? null;
  const riderLng = tracking?.rider?.longitude ?? null;
  const riderHeading = tracking?.rider?.headingDegrees ?? null;
  const riderPos =
    riderLat != null && riderLng != null ? { latitude: riderLat, longitude: riderLng } : null;

  const mapPhase = getFoodDeliveryMapPhase(orderStatus, {
    riderReachedPickupAt: order.riderReachedPickupAt,
    riderPickedUpAt: order.riderPickedUpAt,
  });
  const highlightPickupZone = shouldHighlightFoodPickupZone({
    status: orderStatus,
    riderReachedPickupAt: order.riderReachedPickupAt,
    riderPickedUpAt: order.riderPickedUpAt,
    riderLat,
    riderLng,
    pickupLat,
    pickupLng,
  });
  const highlightDropZone = shouldHighlightFoodDropZone({
    status: orderStatus,
    riderPickedUpAt: order.riderPickedUpAt,
    riderLat,
    riderLng,
    dropLat: deliveryLat,
    dropLng: deliveryLng,
  });

  const pickupPoint = useMemo(
    () => ({ latitude: pickupLat, longitude: pickupLng }),
    [pickupLat, pickupLng]
  );
  const dropPoint = useMemo(
    () => ({ latitude: deliveryLat, longitude: deliveryLng }),
    [deliveryLat, deliveryLng]
  );

  const {
    fullRoute,
    remainingRoute,
    preRiderArcRoute,
    connectorRoute,
    routeJoinPoint,
    hideRouteLine,
    displayRider,
  } = useFoodDeliveryRouteProgress({
    phase: mapPhase,
    rider: riderPos,
    pickup: pickupPoint,
    drop: dropPoint,
    orderId: order.orderId,
    riderArrived,
    riderHeading,
    hasRider,
  });

  const mapRiderLat = displayRider?.latitude ?? riderLat;
  const mapRiderLng = displayRider?.longitude ?? riderLng;

  const prevMapPhaseRef = useRef(mapPhase);
  const prevHighlightDropRef = useRef(highlightDropZone);
  const prevHighlightPickupRef = useRef(highlightPickupZone);

  useEffect(() => {
    if (prevMapPhaseRef.current !== mapPhase) {
      prevMapPhaseRef.current = mapPhase;
      setMapRefitNonce((n) => n + 1);
    }
  }, [mapPhase]);

  useEffect(() => {
    if (highlightDropZone && !prevHighlightDropRef.current) {
      setMapRefitNonce((n) => n + 1);
    }
    prevHighlightDropRef.current = highlightDropZone;
  }, [highlightDropZone]);

  useEffect(() => {
    if (highlightPickupZone && !prevHighlightPickupRef.current) {
      setMapRefitNonce((n) => n + 1);
    }
    prevHighlightPickupRef.current = highlightPickupZone;
  }, [highlightPickupZone]);

  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 120);
    return () => clearTimeout(t);
  }, [order.orderId]);

  const deliveryMapPayload = useMemo<DeliveryMapPayload>(
    () => ({
      pickupLat,
      pickupLng,
      dropLat: deliveryLat,
      dropLng: deliveryLng,
      riderLat: mapRiderLat,
      riderLng: mapRiderLng,
      riderHeading,
      fullRoute,
      remainingRoute,
      preRiderArcRoute: preRiderArcRoute ?? undefined,
      connectorRoute: connectorRoute ?? undefined,
      routeJoinLat: routeJoinPoint?.latitude ?? null,
      routeJoinLng: routeJoinPoint?.longitude ?? null,
      hideRouteLine,
      highlightPickupZone,
      highlightDropZone,
      geofenceRadiusM: FOOD_DELIVERY_GEOFENCE_RADIUS_M,
      geofenceProximityM: FOOD_DELIVERY_GEOFENCE_PROXIMITY_M,
      riderArrived,
      mapPhase,
      showPickupMarker: !hasRider || mapPhase === "rider_to_pickup",
      showDropMarker: !hasRider || mapPhase === "rider_to_drop",
      mapPadding: { top: 64, bottom: 64, left: 40, right: 40 },
    }),
    [
      pickupLat,
      pickupLng,
      deliveryLat,
      deliveryLng,
      mapRiderLat,
      mapRiderLng,
      riderHeading,
      fullRoute,
      remainingRoute,
      preRiderArcRoute,
      connectorRoute,
      routeJoinPoint,
      hideRouteLine,
      highlightPickupZone,
      highlightDropZone,
      riderArrived,
      mapPhase,
      hasRider,
    ]
  );

  const deliveryMapCenter = useMemo(
    () => ({
      latitude: (pickupLat + deliveryLat) / 2,
      longitude: (pickupLng + deliveryLng) / 2,
    }),
    [pickupLat, pickupLng, deliveryLat, deliveryLng]
  );

  const { data: trackingWeather } = useLocationWeather({
    lat: order.deliveryLat,
    lng: order.deliveryLng,
    enabled: true,
  });

  const itemsPreview = useMemo(() => {
    if (items.length === 0) return "";
    const first = items[0]!;
    const rest = items.length > 1 ? ` +${items.length - 1} more` : "";
    return `${first.quantity} x ${first.name}${rest}`;
  }, [items]);

  const normalizeRiderPhone = useCallback(() => {
    const phone = order.rider?.phone?.replace(/\D/g, "");
    if (!phone) return null;
    return phone.length === 10 ? `+91${phone}` : phone.startsWith("+") ? phone : `+${phone}`;
  }, [order.rider?.phone]);

  const handleShare = useCallback(() => {
    setShareSheetVisible(true);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshAckTimerRef.current) clearTimeout(refreshAckTimerRef.current);
    };
  }, []);

  const showRefreshAck = useCallback(() => {
    setRefreshAckVisible(true);
    if (refreshAckTimerRef.current) clearTimeout(refreshAckTimerRef.current);
    refreshAckTimerRef.current = setTimeout(() => {
      setRefreshAckVisible(false);
      refreshAckTimerRef.current = null;
    }, 2500);
  }, []);

  const handleRefreshEta = useCallback(async () => {
    setRefreshingEta(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orderEta", order.orderId] }),
        queryClient.invalidateQueries({ queryKey: ["order", order.orderId] }),
        queryClient.invalidateQueries({ queryKey: ["orderTracking", order.orderId] }),
      ]);
      showRefreshAck();
    } finally {
      setTimeout(() => setRefreshingEta(false), 400);
    }
  }, [queryClient, order.orderId, showRefreshAck]);

  const handleCallRider = useCallback(() => {
    const normalized = normalizeRiderPhone();
    if (!normalized) {
      Alert.alert("Unavailable", "Delivery partner contact is not available yet.");
      return;
    }
    Linking.openURL(`tel:${normalized}`).catch(() => {
      Alert.alert("Could not open dialer", "Please try again.");
    });
  }, [normalizeRiderPhone]);

  const handleMessageRider = useCallback(() => {
    router.push({
      pathname: "/orders/partner-chat",
      params: {
        orderId: order.orderId,
        partnerName: order.rider?.name ?? "Delivery partner",
        restaurantName,
        ...(order.rider?.phone ? { partnerPhone: order.rider.phone } : {}),
        ...(order.rider?.photoUrl ? { partnerPhoto: order.rider.photoUrl } : {}),
      },
    });
  }, [router, order.orderId, order.rider, restaurantName]);

  const handleCancelOrder = useCallback(() => {
    setCancelSheetVisible(true);
  }, []);

  const handleEditContact = useCallback(() => {
    if (deliveryEditLocked.contact || hasAlternateContact || !canUpdateAlternateContact) return;
    alternateContactFlowRef.current?.open();
  }, [deliveryEditLocked.contact, hasAlternateContact, canUpdateAlternateContact]);

  const handleChangeAddress = useCallback(() => {
    if (deliveryEditLocked.address) return;
    setDeliveryEditLocked((prev) => ({ ...prev, address: true }));
    Alert.alert(
      "Change delivery address",
      "Contact support if you need to update the delivery address for this order.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Get help", onPress: onOpenHelp },
      ]
    );
  }, [deliveryEditLocked.address, onOpenHelp]);

  const handleOpenDeliveryInstructions = useCallback(() => {
    if (!canUpdateDeliveryInstructions) {
      Alert.alert(
        "Instructions update closed",
        "Delivery instructions can no longer be updated for this order."
      );
      return;
    }
    if (deliveryEditLocked.instructions) return;
    setDeliveryInstructionSheetVisible(true);
  }, [canUpdateDeliveryInstructions, deliveryEditLocked.instructions]);

  const handleCallRestaurant = useCallback(() => {
    const digits = order.merchantPhone?.replace(/\D/g, "") ?? "";
    if (!digits) {
      onOpenMerchant();
      return;
    }
    const tel = digits.length === 10 ? `+91${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
    void Linking.openURL(`tel:${tel}`);
  }, [order.merchantPhone, onOpenMerchant]);

  const handleCookingRequestAdded = useCallback(
    (nextList: string[]) => {
      queryClient.setQueryData<OrderDetail>(["order", order.orderId], (prev) =>
        prev ? { ...prev, merchantInstructionsList: nextList } : prev
      );
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    },
    [queryClient, order.orderId]
  );

  const deliveryInstructionAddressLine = useMemo(() => {
    const parts = [
      deliveryDetails.addressTitle,
      deliveryDetails.addressLine,
    ].filter(Boolean);
    return parts.join("\n") || order.deliveryAddress?.trim() || "Delivery address";
  }, [deliveryDetails.addressTitle, deliveryDetails.addressLine, order.deliveryAddress]);

  const handleSaveDeliveryInstructions = useCallback(
    async (instructions: string[]) => {
      const res = await orderService.updateDeliveryInstructions(order.orderId, instructions);
      queryClient.setQueryData<OrderDetail>(["order", order.orderId], (prev) =>
        prev ? { ...prev, deliveryInstructionsList: res.deliveryInstructionsList } : prev
      );
      setDeliveryEditLocked((prev) => ({ ...prev, instructions: true }));
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    },
    [order.orderId, queryClient]
  );

  const handleTipPaid = useCallback(
    (amount: number) => {
      void queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    [queryClient, order.orderId]
  );

  const existingTip = order.tipAmount != null && order.tipAmount > 0 ? order.tipAmount : 0;
  const paymentMethodLabel = (order.paymentMethod ?? "UPI").replace(/_/g, " ");
  const riderName = order.rider?.name?.trim() || "Delivery partner";
  const riderFirstName = riderName.split(" ")[0] ?? riderName;
  const riderPhotoUri = toAbsoluteImageUrl(order.rider?.photoUrl);
  const riderRating =
    order.rider?.rating != null && Number.isFinite(order.rider.rating)
      ? order.rider.rating.toFixed(1)
      : null;
  const headerTopPadding =
    (insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT) + STATUS_BAR_TO_HEADER_GAP;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" backgroundColor={HEADER_GREEN} />

      <LinearGradient
        colors={[HEADER_GREEN, HEADER_GREEN]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.heroHeader, { paddingTop: headerTopPadding }]}
      >
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.heroSideBtnLeft}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <CheckoutText style={styles.heroRestaurant} numberOfLines={1}>
            {restaurantName}
          </CheckoutText>
          <TouchableOpacity onPress={handleShare} hitSlop={12} style={styles.heroSideBtnRight}>
            <Ionicons name="share-social-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <CheckoutText style={styles.heroHeadline}>{headline}</CheckoutText>

        <View style={styles.etaPillRow}>
          <View style={styles.etaPillInner}>
            <View style={[styles.etaPill, styles.etaPillChipBase]}>
              <CheckoutText style={styles.etaPillText}>{etaPillText}</CheckoutText>
            </View>
            <TouchableOpacity
              style={[styles.etaRefreshBtn, styles.etaPillChipBase]}
              onPress={() => void handleRefreshEta()}
              activeOpacity={0.85}
            >
              {refreshingEta ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="refresh" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          {refreshAckVisible ? (
            <CheckoutText style={styles.refreshAckText}>Just refreshed now</CheckoutText>
          ) : null}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mapWrap}>
          <View
            style={[
              styles.mapSection,
              showDeliveryOtp ? styles.mapSectionFlushBottom : null,
            ]}
          >
            {mapReady ? (
              <MapboxWebDeliveryMap
                key={order.orderId}
                style={StyleSheet.absoluteFill}
                center={deliveryMapCenter}
                payload={deliveryMapPayload}
                refitNonce={mapRefitNonce}
                onReady={() => setMapRefitNonce((n) => n + 1)}
              />
            ) : (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="small" color={MINT} />
              </View>
            )}
          </View>
          <LiveTrackingStatusChip
            hasRiderFix={riderLat != null && riderLng != null}
            style={styles.liveStatusChip}
          />
          <TouchableOpacity
            style={[styles.mapControlBtn, styles.mapExpandBtn]}
            activeOpacity={0.85}
            onPress={() => setMapRefitNonce((n) => n + 1)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="arrow-expand" size={18} color="#1C1C1C" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapControlBtn, styles.mapLocateBtn]}
            activeOpacity={0.85}
            onPress={() => setMapRefitNonce((n) => n + 1)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#1C1C1C" />
          </TouchableOpacity>
        </View>

        {showDeliveryOtp && order.deliveryOtp ? (
          <DeliveryOtpBanner otp={order.deliveryOtp} />
        ) : null}

        <View style={styles.cardsSection}>
        {showPrepDelayMarquee ? (
          <PrepDelayMarqueeBanner message={prepDelayBanner!.message} />
        ) : null}

        {trackingWeather?.showChip ? (
          <View style={styles.weatherChipWrap}>
            <WeatherStatusChip weather={trackingWeather} variant="inline" />
          </View>
        ) : null}

        {order.rider ? (
          <DeliveryPartnerTrackingCard
            riderName={riderName}
            riderFirstName={riderFirstName}
            riderPhotoUri={riderPhotoUri}
            riderRating={riderRating}
            deliveredOrdersCount={order.rider.deliveredOrdersCount}
            chatUnreadCount={chatUnreadCount}
            existingTipAmount={existingTip}
            onMessage={handleMessageRider}
            onCall={handleCallRider}
            onTipPreset={() => setTipSheetVisible(true)}
            onSafetyPress={() => setSafetySheetVisible(true)}
          />
        ) : null}

        <OrderDeliveryDetailsCard
          {...deliveryDetails}
          editDisabled={{
            contact:
              deliveryEditLocked.contact || hasAlternateContact || !canUpdateAlternateContact,
            address: deliveryEditLocked.address,
            instructions: deliveryEditLocked.instructions || !canUpdateDeliveryInstructions,
          }}
          onEditContact={handleEditContact}
          onEditAddress={handleChangeAddress}
          onEditInstructions={handleOpenDeliveryInstructions}
        />

        <OrderRestaurantCard
          restaurantName={restaurantName}
          merchantArea={merchantArea}
          bannerUri={bannerUri}
          displayOrderId={displayOrderId}
          items={items}
          itemsExpanded={itemsExpanded}
          itemsPreview={itemsPreview}
          merchantInstructionsList={merchantInstructionsList}
          canAddCookingRequest={canAddCookingRequest}
          onToggleItems={() => setItemsExpanded((v) => !v)}
          onCallRestaurant={handleCallRestaurant}
          onOpenCookingRequest={() => setCookingSheetVisible(true)}
          itemHasCustomizations={orderItemHasCustomizations}
          onItemPress={(lineItem) => setCustomizationItem(lineItem)}
        />

        <SectionCard>
          <TouchableOpacity
            style={styles.billCompactRow}
            onPress={() => setBillSheetVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="wallet-outline" size={18} color={MUTED} />
            <CheckoutText style={styles.billCompactLabel}>Paid via {paymentMethodLabel}</CheckoutText>
            <CheckoutText style={styles.billCompactValue}>{formatMoney(bill.paid)}</CheckoutText>
            <Ionicons name="chevron-forward" size={16} color="#C4C4C4" />
          </TouchableOpacity>
        </SectionCard>

        <SectionCard>
          <ChevronRow
            icon="help-buoy-outline"
            iconColor={MINT}
            title="Need help with your order?"
            subtitle="Get help & support"
            onPress={onOpenHelp}
          />
          <DashedDivider />
          <ChevronRow
            icon="bag-remove-outline"
            iconColor={MUTED}
            title="Cancel order"
            onPress={handleCancelOrder}
          />
        </SectionCard>
        </View>
      </ScrollView>

      <OrderItemCustomizationModal
        visible={customizationItem != null}
        item={customizationItem}
        onClose={() => setCustomizationItem(null)}
      />

      <FoodOrderCancelSheet
        visible={cancelSheetVisible}
        order={order}
        onClose={() => setCancelSheetVisible(false)}
        onOpenHelp={onOpenHelp}
        onOpenChat={handleMessageRider}
        onCancelled={onOrderCancelled}
        chatEnabled={hasRider}
      />

      {order.rider && existingTip <= 0 ? (
        <FoodOrderTipSheet
          visible={tipSheetVisible}
          orderId={order.orderId}
          partnerName={riderName}
          partnerPhotoUri={riderPhotoUri}
          paymentMethodLabel={paymentMethodLabel}
          existingTipAmount={existingTip}
          onClose={() => setTipSheetVisible(false)}
          onTipPaid={handleTipPaid}
        />
      ) : null}

      <CookingRequestBottomSheet
        visible={cookingSheetVisible}
        orderId={order.orderId}
        restaurantName={restaurantName}
        existingInstructions={merchantInstructionsList}
        onClose={() => setCookingSheetVisible(false)}
        onAdded={handleCookingRequestAdded}
      />

      <DeliveryPartnerInstructionSheet
        visible={deliveryInstructionSheetVisible}
        onClose={() => setDeliveryInstructionSheetVisible(false)}
        addressLine={deliveryInstructionAddressLine}
        initialInstructions={deliveryInstructionsList}
        onSave={handleSaveDeliveryInstructions}
      />

      <DeliveryPartnerSafetyBottomSheet
        visible={safetySheetVisible}
        onClose={() => setSafetySheetVisible(false)}
      />

      <OrderBillBreakdownSheet
        visible={billSheetVisible}
        onClose={() => setBillSheetVisible(false)}
        bill={bill}
        paymentMethodLabel={paymentMethodLabel}
        itemTotalFallback={billItemTotalFallback}
      />

      <RideTripShareSheet
        visible={shareSheetVisible}
        orderId={order.orderId}
        onClose={() => setShareSheetVisible(false)}
      />

      <AlternateContactFlow
        ref={alternateContactFlowRef}
        orderId={order.orderId}
        hasAlternateContact={hasAlternateContact}
        canUpdateAlternateContact={canUpdateAlternateContact}
        onSuccess={() => setDeliveryEditLocked((prev) => ({ ...prev, contact: true }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  heroHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 10,
    elevation: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    marginBottom: 4,
    position: "relative",
  },
  heroSideBtnLeft: {
    position: "absolute",
    left: 0,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroSideBtnRight: {
    position: "absolute",
    right: 0,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroRestaurant: {
    maxWidth: "68%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
  },
  heroHeadline: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 27,
    textAlign: "center",
    letterSpacing: -0.2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  etaPillRow: {
    alignItems: "center",
    justifyContent: "center",
  },
  etaPillInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  etaPillChipBase: {
    backgroundColor: ETA_CHIP_BG,
    borderWidth: 1,
    borderColor: ETA_CHIP_BORDER,
    overflow: "hidden",
  },
  etaPill: {
    height: ETA_CHIP_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  etaPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    lineHeight: 16,
  },
  etaRefreshBtn: {
    width: ETA_CHIP_HEIGHT,
    height: ETA_CHIP_HEIGHT,
    borderRadius: ETA_CHIP_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshAckText: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
  },
  mapWrap: {
    position: "relative",
  },
  liveStatusChip: {
    position: "absolute",
    left: 12,
    right: 56,
    bottom: 16,
    zIndex: 4,
  },
  mapSection: {
    height: MAP_HEIGHT,
    backgroundColor: "#E5E7EB",
    borderBottomLeftRadius: MAP_CORNER_RADIUS,
    borderBottomRightRadius: MAP_CORNER_RADIUS,
    overflow: "hidden",
  },
  mapSectionFlushBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  mapControlBtn: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 2,
  },
  mapExpandBtn: { top: 12, right: 12 },
  mapLocateBtn: { bottom: 16, right: 12 },
  mapLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F0",
  },
  scroll: { flex: 1 },
  cardsSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  weatherChipWrap: { marginTop: 8, marginBottom: 4, alignItems: "flex-start" },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  dashedDividerWrap: { marginVertical: 10, overflow: "hidden" },
  dashedDivider: { fontSize: 10, color: "#E5E7EB", letterSpacing: 1 },
  chevronRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chevronIconWrap: { width: 24, alignItems: "center" },
  chevronTextWrap: { flex: 1 },
  chevronTitle: { fontSize: 14, fontWeight: "600", color: TEXT },
  chevronSub: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 17 },
  billCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  billCompactLabel: { flex: 1, fontSize: 13, color: MUTED, textTransform: "capitalize" },
  billCompactValue: { fontSize: 14, fontWeight: "700", color: TEXT },
  otpBanner: {
    backgroundColor: GatiMitraColors.mintSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(16, 120, 80, 0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 32,
  },
  otpLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: MINT_DARK,
    flexShrink: 1,
  },
  otpValue: {
    fontSize: 22,
    fontWeight: "900",
    color: MINT_DARK,
    letterSpacing: 2,
    flexShrink: 0,
  },
});
