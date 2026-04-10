/**
 * GatiMitra Checkout — premium, production-level food delivery experience.
 * Single compact header, order summary with thumbnails, delivery card, coupons,
 * bill summary, optional contributions (tip + donation), inline payment, Place Order CTA.
 * No COD. No duplicate headers. All data backend-driven.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  TextInput,
  Image,
  Switch,
  Pressable,
  Modal,
  BackHandler,
  Platform,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useRouter, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";
import { orderService } from "@/services/order.service";
import { billingService } from "@/services/billing.service";
import { paymentService } from "@/services/payment.service";
import { addressService, type Address } from "@/services/address.service";
import { RazorpayCheckoutModal, type RazorpayPaymentResult, type RazorpayOrderParams } from "@/components/RazorpayCheckoutModal";
import { merchantService } from "@/services/merchant.service";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import {
  computeBillSummary,
  haversineKm,
  type BillSummary,
} from "@/lib/billSummary";
import { reverseGeocode } from "@/services/location.service";
import { getRoute } from "@/services/distance.service";
import { BrandingFooter } from "@/components/BrandingFooter";
import { isNetworkError, getNetworkErrorMessage } from "@/utils/networkError";

const GRID = 6;
const SPACING = GRID * 2;
const CARD_RADIUS = 14;
const ANIM_DURATION = 240;

/** Shown in "Order failed" alert when payment may have been charged. */
const ORDER_FAILED_REFUND_NOTE =
  " If you were charged, the amount will be reverted within 24–48 working hours. In some cases, refunds may be instant. For any issues, contact support with your payment details.";

const PAYMENT_OPTIONS = [
  { id: "upi", label: "UPI (GPay, PhonePe, Paytm & more)", displayName: "UPI" },
  { id: "card", label: "Credit / Debit Card", displayName: "Card" },
  { id: "wallet", label: "Wallets (Paytm, Amazon Pay & more)", displayName: "Wallet" },
] as const;

type TipPreset = 0 | 10 | 20 | 30 | 50 | "custom";

export default function CheckoutScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const { items, merchantId, merchantName, updateQuantity, clearCart } = useCartStore();
  useEnsureStoreLiveStatus(merchantId ?? null);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const storeStatus = useStoreStatusStore((s) => (merchantId ? s.getStatus(merchantId) : null));
  const isStoreClosed = storeStatus === "CLOSED";

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  const [tipAmount, setTipAmount] = useState<TipPreset>(0);
  const [customTip, setCustomTip] = useState("");
  const [donationEnabled, setDonationEnabled] = useState(false);
  const [subscriptionOptIn, setSubscriptionOptIn] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedCouponLabel, setAppliedCouponLabel] = useState<string | null>(null);
  const [leaveAtDoor, setLeaveAtDoor] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [billSummaryExpanded, setBillSummaryExpanded] = useState(false);
  const [couponSheetVisible, setCouponSheetVisible] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponApplyError, setCouponApplyError] = useState<string | null>(null);
  const [currentLocationDisplay, setCurrentLocationDisplay] = useState<{ label: string; fullAddress: string } | null>(null);
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [donationPreset, setDonationPreset] = useState<5 | 10 | 20 | "custom" | null>(null);
  const [razorpayOrderParams, setRazorpayOrderParams] = useState<(RazorpayOrderParams & { pendingId?: string }) | null>(null);
  const [razorpayModalVisible, setRazorpayModalVisible] = useState(false);
  const [razorpayCreating, setRazorpayCreating] = useState(false);
  const [simulatedPaymentOrder, setSimulatedPaymentOrder] = useState<{ orderId: string; amount: number; pendingId?: string } | null>(null);
  const currentLocationAddressCreatedRef = useRef(false);

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
  });

  const selectedAddress = useMemo(
    () =>
      addresses.find((a) => a.id === selectedAddressId) ??
      addresses.find((a) => a.isLastUsed) ??
      addresses.find((a) => a.isDefault) ??
      addresses[0],
    [addresses, selectedAddressId]
  );

  useEffect(() => {
    if (addresses.length > 0 && selectedAddressId === null) {
      const defaultAddr =
        addresses.find((a) => a.isLastUsed) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
      if (defaultAddr) setSelectedAddressId(defaultAddr.id);
    }
  }, [addresses, selectedAddressId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const result = await reverseGeocode(coords.longitude, coords.latitude);
        if (cancelled) return;
        setCurrentLocationCoords({ latitude: coords.latitude, longitude: coords.longitude });
        setCurrentLocationDisplay({
          label: "Current location",
          fullAddress: result.fullAddress,
        });
        if (addresses.length > 0) {
          const nearest = addresses.reduce((best, a) => {
            const d = haversineKm(a.latitude, a.longitude, coords.latitude, coords.longitude);
            return d < best.dist ? { addr: a, dist: d } : best;
          }, { addr: addresses[0], dist: haversineKm(addresses[0].latitude, addresses[0].longitude, coords.latitude, coords.longitude) });
          if (nearest.dist <= 0.2 && selectedAddressId === null) {
            setSelectedAddressId(nearest.addr.id);
          }
        }
      } catch {
        if (!cancelled) setCurrentLocationDisplay({ label: "Current location", fullAddress: "Enable location to set" });
      }
    })();
    return () => { cancelled = true; };
  }, [addresses.length]);

  // Auto-create delivery address from current location when user has no saved addresses (Zomato/Swiggy style).
  useEffect(() => {
    const fullAddress = currentLocationDisplay?.fullAddress;
    if (
      addresses.length > 0 ||
      !fullAddress ||
      fullAddress === "Enable location to set" ||
      !currentLocationCoords ||
      currentLocationAddressCreatedRef.current
    )
      return;
    let cancelled = false;
    currentLocationAddressCreatedRef.current = true;
    (async () => {
      try {
        const { id } = await addressService.addAddress({
          fullAddress,
          latitude: currentLocationCoords.latitude,
          longitude: currentLocationCoords.longitude,
          label: "Current location",
          isDefault: true,
        });
        if (cancelled) return;
        await queryClient.invalidateQueries({ queryKey: ["addresses"] });
        setSelectedAddressId(id);
      } catch {
        if (!cancelled) currentLocationAddressCreatedRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addresses.length, currentLocationDisplay?.fullAddress, currentLocationCoords?.latitude, currentLocationCoords?.longitude, queryClient]);

  const { data: merchant, isLoading: merchantLoading } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId!),
    enabled: !!merchantId,
  });

  const { data: merchantAbout } = useQuery({
    queryKey: ["merchant-about", merchantId],
    queryFn: () => merchantService.getMerchantAbout(merchantId!),
    enabled: !!merchantId,
  });

  const storeFullAddress = merchantAbout?.full_address ?? merchant?.address ?? merchant?.city ?? merchantName;

  const routeDistanceQuery = useQuery({
    queryKey: [
      "checkout-route-distance",
      merchant?.id ?? merchantId,
      selectedAddress?.id,
      merchant?.latitude,
      merchant?.longitude,
      selectedAddress?.latitude,
      selectedAddress?.longitude,
    ],
    queryFn: () =>
      getRoute({
        origin: { lat: Number(merchant!.latitude), lng: Number(merchant!.longitude) },
        destination: { lat: selectedAddress!.latitude, lng: selectedAddress!.longitude },
        profile: "driving",
      }),
    enabled:
      !!selectedAddress &&
      merchant?.latitude != null &&
      merchant?.longitude != null,
    staleTime: 5 * 60 * 1000,
  });

  const deliveryDistanceKm = useMemo(() => {
    if (routeDistanceQuery.data?.distanceKm != null) return routeDistanceQuery.data.distanceKm;
    if (!selectedAddress || merchant?.latitude == null || merchant?.longitude == null) return null;
    return haversineKm(
      selectedAddress.latitude,
      selectedAddress.longitude,
      Number(merchant.latitude),
      Number(merchant.longitude)
    );
  }, [routeDistanceQuery.data?.distanceKm, selectedAddress, merchant?.latitude, merchant?.longitude]);

  const currentVsSelectedDistanceKm = useMemo(() => {
    if (!selectedAddress || !currentLocationCoords) return null;
    return haversineKm(
      selectedAddress.latitude,
      selectedAddress.longitude,
      currentLocationCoords.latitude,
      currentLocationCoords.longitude
    );
  }, [selectedAddress, currentLocationCoords]);

  const itemTotal = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items]
  );

  const tipValue = tipAmount === "custom" ? parseFloat(customTip) || 0 : (tipAmount as number);
  const donationValue = donationEnabled
    ? (donationPreset !== "custom" && donationPreset != null ? Number(donationPreset) : parseFloat(donationAmount) || 0)
    : 0;

  const itemsWithSnapshots = useMemo(() => {
    const baseId = (menuItemId: string) =>
      menuItemId.includes("_") ? menuItemId.split("_")[0]! : menuItemId;
    return items.map((i) => {
      const bid = baseId(i.menuItemId);
      const menuItem = merchant?.menu?.find((m) => m.id === bid);
      const categoryName =
        (menuItem as { categoryName?: string } | undefined)?.categoryName ??
        (menuItem as { category_name?: string } | undefined)?.category_name;
      const rawPack =
        (menuItem as { packaging_charges?: number; packagingCharges?: number } | undefined)
          ?.packaging_charges ??
        (menuItem as { packagingCharges?: number } | undefined)?.packagingCharges;
      const packNum = rawPack != null ? Number(rawPack) : NaN;
      const snap: Record<string, unknown> = {};
      if (categoryName) snap.category_name = categoryName;
      if (Number.isFinite(packNum) && packNum > 0) {
        snap.packaging_enabled = true;
        snap.packaging_charges = packNum;
      }
      return {
        menuItemId: bid,
        itemName: i.name,
        quantity: i.quantity,
        basePrice: i.basePrice ?? i.price,
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        addons: (i.addons ?? []).map((a) => ({
          addonId: a.addonId,
          addonName: a.addonName,
          addonPrice: a.addonPrice,
          quantity: a.quantity,
        })),
        itemSnapshot: Object.keys(snap).length ? snap : undefined,
      };
    });
  }, [items, merchant?.menu]);

  const rangeBill: BillSummary = useMemo(
    () =>
      computeBillSummary({
        itemTotal,
        deliveryDistanceKm,
        couponDiscount: 0,
      }),
    [itemTotal, deliveryDistanceKm]
  );

  const billingQuery = useQuery({
    queryKey: [
      "billing-calculate",
      merchantId,
      selectedAddress?.id,
      itemsWithSnapshots,
      tipValue,
      donationValue,
      appliedCouponCode,
      subscriptionOptIn,
    ],
    queryFn: () =>
      billingService.calculateBill({
        merchantId: merchantId!,
        addressId: String(selectedAddress!.id),
        items: itemsWithSnapshots,
        tipAmount: tipValue,
        donationAmount: donationValue,
        couponCode: appliedCouponCode ?? undefined,
        serviceType: "FOOD",
        subscriptionOptIn,
        ...(selectedAddress?.city != null && String(selectedAddress.city).trim() !== ""
          ? { cityName: String(selectedAddress.city).trim() }
          : {}),
        ...(merchant?.latitude != null &&
          merchant?.longitude != null && {
            pickupLat: Number(merchant.latitude),
            pickupLon: Number(merchant.longitude),
          }),
      }),
    enabled: !!merchantId && !!selectedAddress && items.length > 0 && !merchantLoading,
    retry: 2,
  });

  const serverBill = billingQuery.data ?? null;
  const visibleCharges = useMemo(
    () => (serverBill?.charges ?? []).filter((c) => !c.hidden),
    [serverBill?.charges]
  );
  const visibleDiscounts = useMemo(
    () => (serverBill?.discounts ?? []).filter((c) => !c.hidden),
    [serverBill?.discounts]
  );
  const visibleTaxes = useMemo(
    () => (serverBill?.taxes ?? []).filter((c) => !c.hidden),
    [serverBill?.taxes]
  );
  const toPay =
    serverBill != null
      ? serverBill.finalAmount
      : rangeBill.finalTotal + tipValue + donationValue;
  const hasValidPayment = paymentMethod !== "cod" && ["upi", "card", "wallet"].includes(paymentMethod);
  const canPlaceOrder =
    !isStoreClosed &&
    items.length > 0 &&
    !!selectedAddress &&
    !!merchantId &&
    hasValidPayment &&
    billingQuery.isSuccess &&
    serverBill != null;

  const baseOrderPayload = useMemo(() => {
    if (!merchantId || !selectedAddress) return null;
    const pickup =
      merchant &&
      merchant.latitude != null &&
      merchant.longitude != null &&
      (storeFullAddress ?? merchant.address ?? merchant.city)
        ? {
            pickupAddressRaw: (storeFullAddress ?? merchant.address ?? merchant.city ?? merchantName ?? "").trim() || "—",
            pickupLat: Number(merchant.latitude),
            pickupLon: Number(merchant.longitude),
          }
        : {};
    return {
      merchantId,
      items: itemsWithSnapshots,
      addressId: String(selectedAddress.id),
      paymentMethod,
      ...(tipValue > 0 && { tipAmount: tipValue }),
      ...(donationValue > 0 && { donationAmount: donationValue }),
      ...(appliedCouponCode && { couponCode: appliedCouponCode }),
      ...(subscriptionOptIn && { subscriptionOptIn: true }),
      ...pickup,
    };
  }, [
    merchantId,
    itemsWithSnapshots,
    selectedAddress,
    paymentMethod,
    tipValue,
    donationValue,
    appliedCouponCode,
    subscriptionOptIn,
    merchant,
    storeFullAddress,
    merchantName,
  ]);

  const placeOrder = useMutation({
    mutationFn: (razorpay?: RazorpayPaymentResult) => {
      const payload = baseOrderPayload;
      if (!payload) return Promise.reject(new Error("Address or store missing"));
      return orderService.createOrder({
        ...payload,
        ...(razorpay && {
          razorpayOrderId: razorpay.razorpayOrderId,
          razorpayPaymentId: razorpay.razorpayPaymentId,
          razorpaySignature: razorpay.razorpaySignature,
        }),
      });
    },
    onSuccess: (order) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const etaMins = merchant?.avgPreparationTimeMinutes != null ? Math.round(Number(merchant.avgPreparationTimeMinutes)) + 20 : 25;
      setActiveOrder({
        orderId: order.orderId,
        status: "ORDER_PLACED",
        etaMinutes: etaMins,
        storeId: merchantId ?? null,
        storeName: merchantName ?? null,
        placedAt: Date.now(),
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigation.replace("success", {
        orderId: order.orderId,
        merchantName: merchantName ?? undefined,
        etaMinutes: etaMins,
      });
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const msg = err?.response?.data?.message ?? err?.message ?? "Could not place order.";
      Alert.alert("Order failed", msg + ORDER_FAILED_REFUND_NOTE, [{ text: "OK" }]);
    },
  });

  const finalizeArgsRef = useRef<{ pendingId: string; result: RazorpayPaymentResult } | null>(null);

  const finalizeOrder = useMutation({
    mutationFn: (args: { pendingId: string; result: RazorpayPaymentResult }) => {
      finalizeArgsRef.current = args;
      return orderService.finalizeOrderWithRetry(
        {
          pendingId: args.pendingId,
          razorpayOrderId: args.result.razorpayOrderId,
          razorpayPaymentId: args.result.razorpayPaymentId,
          razorpaySignature: args.result.razorpaySignature,
        },
        { retries: 3, delayMs: 1500 }
      );
    },
    onSuccess: (order) => {
      finalizeArgsRef.current = null;
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const orderId = order?.orderId ?? (order as { order_id?: string })?.order_id;
      if (!orderId) {
        console.warn("[checkout] finalize success but no orderId in response", order);
        clearCart();
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        navigation.replace("/(tabs)/");
        return;
      }
      const etaMins = merchant?.avgPreparationTimeMinutes != null ? Math.round(Number(merchant.avgPreparationTimeMinutes)) + 20 : 25;
      setActiveOrder({
        orderId,
        status: order.status === "PLACED" ? "ORDER_PLACED" : (order.status as import("@/store/orderStore").OrderStatus),
        etaMinutes: etaMins,
        storeId: merchantId ?? null,
        storeName: merchantName ?? null,
        placedAt: Date.now(),
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigation.replace("success", {
        orderId,
        merchantName: merchantName ?? undefined,
        etaMinutes: etaMins,
      });
    },
    onError: (err: Error & { response?: { data?: { message?: string } }; code?: string }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const msg = err?.response?.data?.message ?? err?.message ?? "Order could not be confirmed.";
      const networkErr = isNetworkError(err);

      if (networkErr && finalizeArgsRef.current) {
        Alert.alert(
          "Connection issue",
          "We couldn't confirm your order. Your payment may have gone through. Tap Retry to confirm, or check My Orders.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Retry",
              onPress: () => finalizeOrder.mutate(finalizeArgsRef.current!),
            },
            {
              text: "My Orders",
              onPress: () => {
                queryClient.invalidateQueries({ queryKey: ["my-orders"] });
                router.replace("/(tabs)/orders");
              },
            },
          ]
        );
      } else {
        Alert.alert("Order failed", msg + ORDER_FAILED_REFUND_NOTE, [{ text: "OK" }]);
      }
    },
  });

  const handlePlaceOrderPress = useCallback(async () => {
    if (!canPlaceOrder || placeOrder.isPending || finalizeOrder.isPending || razorpayCreating) return;
    if (hasValidPayment) {
      setRazorpayCreating(true);
      try {
        const payload = baseOrderPayload;
        if (!payload) {
          setRazorpayCreating(false);
          return;
        }
        const pending = await orderService.createPendingOrder(payload);
        const razorpayOrder = await paymentService.createRazorpayOrder({
          amountPaise: pending.amount,
          receipt: pending.pendingId,
        });
        if (razorpayOrder.keyId === "dev_sim_key") {
          setSimulatedPaymentOrder({
            orderId: razorpayOrder.orderId,
            amount: razorpayOrder.amount,
            pendingId: pending.pendingId,
          });
        } else {
          setRazorpayOrderParams({
            orderId: razorpayOrder.orderId,
            keyId: razorpayOrder.keyId,
            amount: razorpayOrder.amount,
            pendingId: pending.pendingId,
          });
          setRazorpayModalVisible(true);
        }
      } catch (e) {
        console.warn("Create pending or Razorpay order failed", e);
        const msg = (e as Error)?.message ?? "Could not start payment. Try again.";
        const displayMsg = isNetworkError(e) ? getNetworkErrorMessage(e) : msg;
        Alert.alert("Checkout failed", displayMsg, [{ text: "OK" }]);
      } finally {
        setRazorpayCreating(false);
      }
    } else {
      placeOrder.mutate(undefined);
    }
  }, [canPlaceOrder, baseOrderPayload, placeOrder, finalizeOrder.isPending, razorpayCreating, hasValidPayment, merchantId]);

  const handleRazorpaySuccess = useCallback(
    (result: RazorpayPaymentResult) => {
      const pendingId = razorpayOrderParams?.pendingId ?? simulatedPaymentOrder?.pendingId;
      if (pendingId) {
        finalizeOrder.mutate({ pendingId, result });
      } else {
        placeOrder.mutate(result);
      }
    },
    [finalizeOrder, placeOrder, razorpayOrderParams?.pendingId, simulatedPaymentOrder?.pendingId]
  );

  const handleRazorpayCancel = useCallback(() => {
    setRazorpayModalVisible(false);
    setRazorpayOrderParams(null);
  }, []);

  // When payment modal or simulated payment overlay is open, hardware back should close it, not leave checkout
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const paymentOverlayOpen = razorpayModalVisible || simulatedPaymentOrder != null;
    if (!paymentOverlayOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (simulatedPaymentOrder != null) {
        setSimulatedPaymentOrder(null);
        return true;
      }
      if (razorpayModalVisible) {
        handleRazorpayCancel();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [razorpayModalVisible, simulatedPaymentOrder, handleRazorpayCancel]);

  const handleSimulatedPaymentComplete = useCallback(() => {
    if (!simulatedPaymentOrder) return;
    handleRazorpaySuccess({
      razorpayOrderId: simulatedPaymentOrder.orderId,
      razorpayPaymentId: "sim_pay_1",
      razorpaySignature: "simulated_signature",
    });
    setSimulatedPaymentOrder(null);
  }, [simulatedPaymentOrder, handleRazorpaySuccess]);

  const handleSimulatedPaymentCancel = useCallback(() => {
    setSimulatedPaymentOrder(null);
  }, []);

  const handleShareLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const { latitude, longitude } = coords;
      const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const message = `My current location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${mapUrl}`;
      await Share.share({
        message,
        title: "My location",
        url: mapUrl,
      });
    } catch {
      // ignore
    }
  }, []);

  const itemsWithImage = useMemo(() => {
    if (!merchant?.menu) return items.map((i) => ({ ...i, imageUrl: null as string | null }));
    return items.map((cartItem) => {
      const baseId = cartItem.menuItemId.includes("_") ? cartItem.menuItemId.split("_")[0] : cartItem.menuItemId;
      const menuItem = merchant.menu.find((m) => m.id === baseId);
      return { ...cartItem, imageUrl: menuItem?.imageUrl ?? null };
    });
  }, [items, merchant?.menu]);

  const deliveryEta = useMemo(() => {
    if (!merchant?.avgPreparationTimeMinutes) return "15-25 mins";
    const base = Math.round(Number(merchant.avgPreparationTimeMinutes));
    return `${base + 15}-${base + 25} mins`;
  }, [merchant?.avgPreparationTimeMinutes]);

  const editingItem = useMemo((): import("@/services/merchant.service").MenuItem | null => {
    if (!editingCartItemId) return null;
    const item = items.find((i) => i.menuItemId === editingCartItemId);
    if (!item) return null;
    const baseId = item.menuItemId.includes("_") ? item.menuItemId.split("_")[0] : item.menuItemId;
    const numericId = /^\d+$/.test(baseId ?? "") ? Number(baseId) : undefined;
    return {
      id: baseId ?? "",
      menuItemId: numericId,
      name: item.name,
      price: item.price,
      isVeg: item.isVeg,
      hasVariants: false,
      hasAddons: false,
      hasCustomizations: false,
    };
  }, [editingCartItemId, items]);

  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)?.displayName ?? "UPI";

  const completeYourMealItems = useMemo(() => {
    const raw = merchant?.menu ?? (merchant as { menu_items?: import("@/services/merchant.service").MenuItem[] } | undefined)?.menu_items;
    const menu = Array.isArray(raw) ? raw : [];
    const normalized = menu
      .filter((m) => m && (m.id ?? (m as { item_id?: string }).item_id) && (m.name ?? (m as { item_name?: string }).item_name))
      .map((m) => ({
        id: String((m as { id?: string }).id ?? (m as { item_id?: string }).item_id ?? ""),
        menuItemId: (m as { menuItemId?: number }).menuItemId,
        name: String((m as { name?: string }).name ?? (m as { item_name?: string }).item_name ?? ""),
        price: Number((m as { price?: number }).price ?? (m as { selling_price?: number }).selling_price ?? 0),
        isVeg: Boolean((m as { isVeg?: boolean }).isVeg ?? (m as { food_type?: string }).food_type?.toLowerCase().startsWith("veg")),
        imageUrl: (m as { imageUrl?: string }).imageUrl ?? (m as { item_image_url?: string }).item_image_url,
        isRecommended: (m as { isRecommended?: boolean }).isRecommended ?? (m as { is_recommended?: boolean }).is_recommended,
        isPopular: (m as { isPopular?: boolean }).isPopular ?? (m as { is_popular?: boolean }).is_popular,
      }));
    return [...normalized]
      .sort((a, b) => {
        const aScore = (a.isRecommended ? 2 : 0) + (a.isPopular ? 1 : 0);
        const bScore = (b.isRecommended ? 2 : 0) + (b.isPopular ? 1 : 0);
        return bScore - aScore;
      })
      .slice(0, 10);
  }, [merchant]);

  if (!merchantId || items.length === 0) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.emptyText}>Cart is empty</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.ctaSecondary}>
          <Text style={styles.ctaSecondaryText}>Back to cart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const showBillSkeleton =
    merchantLoading || (addressesLoading && addresses.length === 0) || billingQuery.isLoading;

  return (
    <View style={styles.container}>
      {/* Compact header: back, store address, distance tag */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {storeFullAddress}
            </Text>
            {deliveryDistanceKm != null && (
              <View style={[styles.headerDistanceTag, rangeBill.isOutOfRange && styles.headerDistanceTagFar]}>
                <Ionicons
                  name="navigate"
                  size={12}
                  color={rangeBill.isOutOfRange ? GatiMitraColors.warningAmber : GatiMitraColors.emerald}
                  style={styles.headerDistanceTagIcon}
                />
                <Text style={[styles.headerDistanceTagText, rangeBill.isOutOfRange && styles.headerDistanceTagTextFar]}>
                  {deliveryDistanceKm.toFixed(1)} km away
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            onPress={handleShareLocation}
            style={styles.headerShareLocationBtn}
            hitSlop={8}
          >
            <Ionicons name="location" size={20} color={GatiMitraColors.emerald} />
            <Text style={styles.headerShareLocationText}>Share location</Text>
          </TouchableOpacity>
        </View>
      </View>

      {rangeBill.isOutOfRange && (
        <Animated.View entering={FadeIn.duration(ANIM_DURATION)} style={styles.distanceBanner}>
          <Ionicons name="warning" size={20} color={GatiMitraColors.warningAmber} />
          <Text style={styles.distanceBannerText}>
            Selected address is {deliveryDistanceKm?.toFixed(1)} km away. Delivery charges may be higher.
          </Text>
        </Animated.View>
      )}
      {currentVsSelectedDistanceKm != null && currentVsSelectedDistanceKm > 1.5 && (
        <Animated.View entering={FadeIn.duration(ANIM_DURATION)} style={styles.distanceBanner}>
          <Ionicons name="information-circle" size={20} color={GatiMitraColors.warningAmber} />
          <Text style={styles.distanceBannerText}>
            You are currently {currentVsSelectedDistanceKm.toFixed(1)} km away from the selected delivery address.
            Order will be delivered to the selected address.
          </Text>
        </Animated.View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Order summary card — top */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION)} style={styles.section}>
          <View style={styles.card}>
            <View style={styles.orderSummaryHeader}>
              <Text style={styles.cardTitle}>{merchantName}</Text>
              <Text style={styles.etaBadge}>{deliveryEta}</Text>
            </View>
            <View style={styles.orderItemsPreview}>
              {itemsWithImage.map((item) => (
                <View key={item.menuItemId} style={styles.orderItemRow}>
                  <View style={styles.orderItemThumbWrap}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.orderItemThumb} />
                    ) : (
                      <View style={[styles.orderItemThumbPlaceholder, !item.isVeg && styles.nonVegBg]}>
                        <Ionicons name="restaurant" size={20} color={GatiMitraColors.textSecondary} />
                      </View>
                    )}
                    {item.quantity > 1 && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>{item.quantity}</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.orderItemInfo}
                    onPress={() => setEditingCartItemId(item.menuItemId)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.orderItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.orderItemPrice}>₹{(item.price * item.quantity).toFixed(2)}</Text>
                  </TouchableOpacity>
                  <View style={styles.orderItemActions}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(item.menuItemId, -1)}
                      style={styles.qtyBtnSmall}
                    >
                      <Ionicons name="remove" size={16} color={GatiMitraColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValueSmall}>{item.quantity}</Text>
                    <TouchableOpacity
                      onPress={() => updateQuantity(item.menuItemId, 1)}
                      style={styles.qtyBtnSmall}
                    >
                      <Ionicons name="add" size={16} color={GatiMitraColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId } })}
              style={styles.addMoreRow}
            >
              <View style={styles.addMoreIconWrap}>
                <Ionicons name="add" size={20} color={GatiMitraColors.emerald} />
              </View>
              <Text style={styles.addMoreText}>Add more items</Text>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Coupons */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(40)} style={styles.section}>
          <TouchableOpacity
            style={styles.couponRow}
            activeOpacity={0.8}
            onPress={() => setCouponSheetVisible(true)}
          >
            <Ionicons name="pricetag-outline" size={22} color={GatiMitraColors.emerald} />
            {appliedCouponCode || (serverBill && serverBill.discountTotal > 0) ? (
              <View style={styles.appliedCouponWrap}>
                <Text style={styles.appliedCouponText}>
                  {appliedCouponLabel ?? appliedCouponCode ?? "Coupon applied"}
                  {serverBill && serverBill.discountTotal > 0
                    ? ` • -₹${serverBill.discountTotal.toFixed(2)}`
                    : ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.couponRowText}>View Available Coupons</Text>
            )}
            <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Complete your meal with — only show when menu has items */}
        {completeYourMealItems.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(50)} style={styles.section}>
          <View style={styles.upsellSectionHeader}>
            <View style={styles.upsellSectionIcon}>
              <Ionicons name="grid-outline" size={16} color={GatiMitraColors.textSecondary} />
              <View style={styles.upsellSectionIconPlus}>
                <Ionicons name="add" size={10} color={GatiMitraColors.textSecondary} />
              </View>
            </View>
            <Text style={styles.sectionTitle}>Complete your meal with</Text>
          </View>
          <View style={styles.upsellScrollWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.upsellScrollContent}
              style={styles.upsellScrollInner}
            >
              {completeYourMealItems.map((m) => {
              const numId = m.menuItemId != null ? String(m.menuItemId) : null;
              const inCart = items.some(
                (i) =>
                  i.menuItemId === m.id ||
                  i.menuItemId?.startsWith?.(m.id + "_") ||
                  (numId != null && (i.menuItemId === numId || i.menuItemId?.startsWith?.(numId + "_")))
              );
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (!inCart) {
                      useCartStore.getState().addItem(merchantId!, merchantName!, {
                        menuItemId: String(m.menuItemId ?? m.id),
                        name: m.name,
                        price: m.price,
                        isVeg: m.isVeg,
                      }, 1);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.upsellCard,
                    inCart && styles.upsellCardAdded,
                    !inCart && pressed && styles.upsellCardPressed,
                  ]}
                >
                  <View style={styles.upsellImageWrap}>
                    {m.imageUrl ? (
                      <Image source={{ uri: m.imageUrl }} style={styles.upsellImage} />
                    ) : (
                      <View style={[styles.upsellImagePlaceholder, !m.isVeg && styles.nonVegBg]}>
                        <Ionicons name="restaurant" size={22} color={GatiMitraColors.textSecondary} />
                      </View>
                    )}
                    <View style={[styles.upsellVegBadge, !m.isVeg && styles.upsellNonVegBadge]}>
                      {m.isVeg ? <View style={styles.upsellVegDot} /> : null}
                    </View>
                    {inCart ? (
                      <View style={[styles.upsellAddBtnOnImage, styles.upsellAddBtnAdded]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : (
                      <View style={styles.upsellAddBtnOnImage}>
                        <Ionicons name="add" size={16} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.upsellName} numberOfLines={3}>
                    {m.name}
                  </Text>
                  <Text style={styles.upsellPrice}>₹{m.price}</Text>
                </Pressable>
              );
              })}
            </ScrollView>
          </View>
          </Animated.View>
        ) : null}

        {/* Delivery address card */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(60)} style={styles.section}>
          <View style={styles.card}>
            <View style={styles.deliveryEtaRow}>
              <Ionicons name="flash" size={18} color={GatiMitraColors.emerald} />
              <Text style={styles.deliveryEtaText}>Delivery in {deliveryEta}</Text>
            </View>
            <TouchableOpacity style={styles.scheduleRow} activeOpacity={0.8}>
              <Text style={styles.scheduleText}>Want this later? Schedule it</Text>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.deliveryDivider} />
            <TouchableOpacity
              style={styles.deliveryAddrRow}
              onPress={() => router.push("/profile/addresses")}
              activeOpacity={0.8}
            >
              <Ionicons name="location-outline" size={20} color={GatiMitraColors.emerald} />
              <View style={styles.deliveryAddrTextWrap}>
                <Text style={styles.deliveryAddrLabel}>
                  Delivery at {selectedAddress?.label ?? currentLocationDisplay?.label ?? "—"}
                </Text>
                <Text style={styles.deliveryAddrSub} numberOfLines={1}>
                  {selectedAddress
                    ? selectedAddress.fullAddress
                    : currentLocationDisplay?.fullAddress ?? "Select delivery address"}
                </Text>
                {leaveAtDoor && (
                  <View style={styles.leaveAtDoorChip}>
                    <Ionicons name="checkmark-circle" size={14} color={GatiMitraColors.emerald} />
                    <Text style={styles.leaveAtDoorChipText}>Leave at door</Text>
                  </View>
                )}
              </View>
              <Text style={styles.editAddressCta}>Edit</Text>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.leaveAtDoorRow}>
              <Text style={styles.leaveAtDoorLabel}>Leave at door</Text>
              <Switch
                value={leaveAtDoor}
                onValueChange={setLeaveAtDoor}
                trackColor={{ false: GatiMitraColors.border, true: GatiMitraColors.mintHighlight }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </Animated.View>

        {/* Bill summary — collapsible: total only by default, dropdown to expand */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(80)} style={styles.section}>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.billSummaryHeader}
              onPress={() => setBillSummaryExpanded((e) => !e)}
              activeOpacity={0.8}
            >
              <Text style={styles.sectionTitleSmall}>Bill summary</Text>
              {!showBillSkeleton && (
                <View style={styles.billSummaryHeaderRight}>
                  <Text style={styles.billSummaryTotal}>₹{toPay.toFixed(2)}</Text>
                  <Ionicons
                    name={billSummaryExpanded ? "chevron-up" : "chevron-down"}
                    size={22}
                    color={GatiMitraColors.textSecondary}
                  />
                </View>
              )}
            </TouchableOpacity>
            {showBillSkeleton ? (
              <View style={styles.billSkeletonWrap}>
                <GMSkeleton style={styles.billSkeletonLine} />
                <GMSkeleton style={styles.billSkeletonLastLine} />
              </View>
            ) : billSummaryExpanded ? (
              <View style={styles.billSummaryExpanded}>
                {serverBill ? (
                  <>
                    <BillRow label="Item total" value={`₹${serverBill.itemTotal.toFixed(2)}`} />
                    {serverBill.addonTotal > 0 && (
                      <BillRow label="Add-ons" value={`₹${serverBill.addonTotal.toFixed(2)}`} />
                    )}
                    {visibleCharges.map((c, idx) => (
                      <BillRow key={`chg-${idx}`} label={c.label} value={`₹${c.amount.toFixed(2)}`} />
                    ))}
                    {visibleDiscounts.map((c, idx) => (
                      <BillRow key={`dsc-${idx}`} label={c.label} value={`-₹${c.amount.toFixed(2)}`} green />
                    ))}
                    {visibleTaxes.map((c, idx) => (
                      <BillRow key={`tax-${idx}`} label={c.label} value={`₹${c.amount.toFixed(2)}`} />
                    ))}
                    <View style={styles.billDivider} />
                    <BillRow
                      label="Subtotal"
                      value={`₹${(serverBill.finalAmount - serverBill.tipAmount - serverBill.donationAmount).toFixed(2)}`}
                    />
                    {serverBill.tipAmount > 0 && (
                      <BillRow label="Delivery partner tip" value={`₹${serverBill.tipAmount.toFixed(2)}`} />
                    )}
                    {serverBill.donationAmount > 0 && (
                      <BillRow label="Feeding India donation" value={`₹${serverBill.donationAmount.toFixed(2)}`} />
                    )}
                    <View style={styles.billDivider} />
                    <BillRow label="Total payable" value={`₹${serverBill.finalAmount.toFixed(2)}`} bold />
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, color: GatiMitraColors.textSecondary, marginBottom: 8 }}>
                      Showing estimate — connect to refresh bill from server.
                    </Text>
                    <BillRow label="Item total" value={`₹${rangeBill.itemTotal.toFixed(2)}`} />
                    <BillRow
                      label={`Delivery partner fee${deliveryDistanceKm != null ? ` (${deliveryDistanceKm.toFixed(1)} km)` : ""}`}
                      value={`₹${rangeBill.deliveryFee.toFixed(2)}`}
                    />
                    <BillRow label="Platform fee" value={`₹${rangeBill.platformFee.toFixed(2)}`} />
                    <BillRow label="GST (govt. taxes)" value={`₹${rangeBill.gst.toFixed(2)}`} />
                    <View style={styles.billDivider} />
                    <BillRow label="Subtotal" value={`₹${rangeBill.finalTotal.toFixed(2)}`} />
                    {tipValue > 0 && <BillRow label="Delivery partner tip" value={`₹${tipValue.toFixed(2)}`} />}
                    {donationValue > 0 && <BillRow label="Feeding India donation" value={`₹${donationValue.toFixed(2)}`} />}
                    <View style={styles.billDivider} />
                    <BillRow label="Total payable" value={`₹${toPay.toFixed(2)}`} bold />
                  </>
                )}
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Optional platform subscription (SUBSCRIPTION billing rule) */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(95)} style={styles.sectionContrib}>
          <View style={styles.donationCard}>
            <View style={styles.donationCardHeader}>
              <View style={styles.donationIconWrap}>
                <Ionicons name="shield-checkmark" size={22} color={GatiMitraColors.emerald} />
              </View>
              <View style={styles.donationCardTitleWrap}>
                <Text style={styles.donationCardTitle}>GatiMitra+ add-on</Text>
                <Text style={styles.donationCardSub}>Optional subscription charge if enabled in billing rules.</Text>
              </View>
              <Switch
                value={subscriptionOptIn}
                onValueChange={setSubscriptionOptIn}
                trackColor={{ false: GatiMitraColors.border, true: GatiMitraColors.mintHighlight }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </Animated.View>

        {/* Feeding India Donation — attractive card with distinct amount boxes */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(100)} style={styles.sectionContrib}>
          <View style={styles.donationCard}>
            <View style={styles.donationCardHeader}>
              <View style={styles.donationIconWrap}>
                <Ionicons name="restaurant" size={22} color={GatiMitraColors.emerald} />
              </View>
              <View style={styles.donationCardTitleWrap}>
                <Text style={styles.donationCardTitle}>Support Feeding India !</Text>
                <Text style={styles.donationCardSub}>Nutritious meals for those in need.</Text>
              </View>
              <Switch
                value={donationEnabled}
                onValueChange={(v) => {
                  setDonationEnabled(v);
                  if (!v) { setDonationPreset(null); setDonationAmount(""); }
                }}
                trackColor={{ false: GatiMitraColors.border, true: GatiMitraColors.mintHighlight }}
                thumbColor="#fff"
              />
            </View>
            {donationEnabled && (
              <>
                <Text style={styles.donationBoxLabel}>Choose amount</Text>
                <View style={styles.donationSuggestRow}>
                  {([5, 10, 20] as const).map((amt) => (
                    <Pressable
                      key={amt}
                      onPress={() => { setDonationPreset(amt); setDonationAmount(String(amt)); }}
                      style={({ pressed }) => [
                        styles.donationAmountBox,
                        donationPreset === amt && styles.donationAmountBoxActive,
                        pressed && styles.tipChipPressed,
                      ]}
                    >
                      <Text style={[styles.donationAmountBoxText, donationPreset === amt && styles.donationAmountBoxTextActive]}>₹{amt}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => { setDonationPreset("custom"); setDonationAmount(""); }}
                    style={({ pressed }) => [
                      styles.donationAmountBox,
                      donationPreset === "custom" && styles.donationAmountBoxActive,
                      pressed && styles.tipChipPressed,
                    ]}
                  >
                    <Text style={[styles.donationAmountBoxText, donationPreset === "custom" && styles.donationAmountBoxTextActive]}>Custom</Text>
                  </Pressable>
                </View>
                <View style={styles.donationInputRow}>
                  <TextInput
                    style={styles.donationInput}
                    placeholder="Or enter amount (₹)"
                    placeholderTextColor={GatiMitraColors.textSecondary}
                    keyboardType="numeric"
                    value={donationAmount}
                    onChangeText={(t) => {
                      setDonationAmount(t);
                      if (t && !["5", "10", "20"].includes(t)) setDonationPreset("custom");
                    }}
                  />
                </View>
              </>
            )}
          </View>
        </Animated.View>

        {/* Delivery Partner Tip — attractive card, default 0; user can cancel by selecting No tip */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(110)} style={styles.sectionContrib}>
          <View style={styles.tipCard}>
            <View style={styles.tipCardHeader}>
              <View style={styles.tipIconWrap}>
                <Ionicons name="heart" size={22} color={GatiMitraColors.warmOrange} />
              </View>
              <View style={styles.tipCardTitleWrap}>
                <Text style={styles.tipCardTitle}>Delivery Partner Tip</Text>
                <Text style={styles.tipCardSub}>100% goes to your delivery partner. Optional.</Text>
              </View>
            </View>
            <Text style={styles.tipBoxLabel}>Choose amount</Text>
            <View style={styles.tipAmountBoxRow}>
              <Pressable
                onPress={() => { setTipAmount(0); setCustomTip(""); }}
                style={({ pressed }) => [
                  styles.tipAmountBox,
                  tipAmount === 0 && styles.tipAmountBoxActive,
                  pressed && styles.tipChipPressed,
                ]}
              >
                <Text style={[styles.tipAmountBoxText, tipAmount === 0 && styles.tipAmountBoxTextActive]}>No tip</Text>
              </Pressable>
              {([10, 20, 30, 50] as const).map((amt) => (
                <Pressable
                  key={amt}
                  onPress={() => setTipAmount(amt)}
                  style={({ pressed }) => [
                    styles.tipAmountBox,
                    tipAmount === amt && styles.tipAmountBoxActive,
                    pressed && styles.tipChipPressed,
                  ]}
                >
                  <Text style={[styles.tipAmountBoxText, tipAmount === amt && styles.tipAmountBoxTextActive]}>₹{amt}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setTipAmount("custom")}
                style={({ pressed }) => [
                  styles.tipAmountBox,
                  tipAmount === "custom" && styles.tipAmountBoxActive,
                  pressed && styles.tipChipPressed,
                ]}
              >
                <Text style={[styles.tipAmountBoxText, tipAmount === "custom" && styles.tipAmountBoxTextActive]}>Custom</Text>
              </Pressable>
            </View>
            {tipAmount === "custom" && (
              <View style={styles.donationInputRow}>
                <TextInput
                  style={styles.customTipInput}
                  placeholder="Enter amount (₹)"
                  placeholderTextColor={GatiMitraColors.textSecondary}
                  keyboardType="numeric"
                  value={customTip}
                  onChangeText={setCustomTip}
                />
              </View>
            )}
          </View>
        </Animated.View>

        {/* Cancellation policy — above footer */}
        <View style={styles.cancellationBlock}>
          <Text style={styles.cancellationTitle}>CANCELLATION POLICY</Text>
          <Text style={styles.cancellationText}>
            A 100% cancellation fee will be applied if you cancel the order after it is confirmed from your end.
          </Text>
        </View>

        {/* GatiMitra branding — end of content */}
        <BrandingFooter />
      </ScrollView>

      {/* Coupons sheet: available coupons + apply code input */}
      <Modal
        visible={couponSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCouponSheetVisible(false)}
      >
        <Pressable style={styles.couponModalOverlay} onPress={() => setCouponSheetVisible(false)}>
          <Pressable style={[styles.couponModalContent, { paddingBottom: insets.bottom + 24 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.couponModalHeader}>
              <Text style={styles.couponModalTitle}>Available Coupons</Text>
              <TouchableOpacity onPress={() => setCouponSheetVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={28} color={GatiMitraColors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.couponApplyRow}>
              <TextInput
                style={styles.couponCodeInput}
                placeholder="Enter coupon code"
                placeholderTextColor={GatiMitraColors.textSecondary}
                value={couponCodeInput}
                onChangeText={(t) => { setCouponCodeInput(t); setCouponApplyError(null); }}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.couponApplyBtn}
                onPress={() => {
                  const code = couponCodeInput.trim();
                  if (!code) { setCouponApplyError("Enter a coupon code"); return; }
                  setCouponApplyError(null);
                  setAppliedCouponCode(code);
                  setAppliedCouponLabel(code);
                  setCouponSheetVisible(false);
                  setCouponCodeInput("");
                }}
              >
                <Text style={styles.couponApplyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
            {couponApplyError && <Text style={styles.couponError}>{couponApplyError}</Text>}
            <ScrollView style={styles.couponList} showsVerticalScrollIndicator={false}>
              {[
                { code: "SAVE50", desc: "₹50 off on orders above ₹299", minOrder: 299 },
                { code: "FLAT20", desc: "20% off up to ₹100", minOrder: 199 },
                { code: "FIRST", desc: "₹30 off for first order", minOrder: 150 },
              ].map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={styles.couponListItem}
                  onPress={() => {
                    setCouponCodeInput(c.code);
                    setCouponApplyError(null);
                  }}
                >
                  <View style={styles.couponListItemLeft}>
                    <Text style={styles.couponListCode}>{c.code}</Text>
                    <Text style={styles.couponListDesc}>{c.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Payment method selector sheet */}
      {paymentSheetVisible && (
        <View style={styles.paymentSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaymentSheetVisible(false)} />
          <Animated.View entering={FadeIn.duration(200)} style={[styles.paymentSheet, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.paymentSheetTitle}>Pay using</Text>
            <Text style={styles.paymentSheetSubtitle}>Razorpay will show your UPI apps, cards & wallets</Text>
            {PAYMENT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  setPaymentMethod(opt.id);
                  setPaymentSheetVisible(false);
                }}
                style={[styles.paymentOptionRow, paymentMethod === opt.id && styles.paymentOptionActive]}
              >
                <Text style={styles.paymentOptionText}>{opt.label}</Text>
                {paymentMethod === opt.id && <Ionicons name="checkmark-circle" size={24} color={GatiMitraColors.emerald} />}
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      )}

      {/* Footer: attractive payment card + pill-shaped Place Order button */}
      <View style={[styles.fixedBottom, { paddingBottom: insets.bottom + GRID * 2 }]}>
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.footerPaymentCard}
            onPress={() => setPaymentSheetVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.footerPaymentIconWrap}>
              <Ionicons name="card-outline" size={18} color={GatiMitraColors.emerald} />
            </View>
            <View style={styles.footerPaymentTextWrap}>
              <View style={styles.footerPaySingleRow}>
                <Text style={styles.footerPayLabel} numberOfLines={1}>Pay using {paymentLabel}</Text>
                <Ionicons name="chevron-up" size={14} color={GatiMitraColors.textSecondary} style={styles.footerPayChevron} />
              </View>
            </View>
          </TouchableOpacity>
          {isStoreClosed ? (
            <View style={styles.footerCtaSlotDisabled}>
              <Text style={styles.ctaDisabledText}>Store closed</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.footerCtaSlotDisabled}>
              <Text style={styles.ctaDisabledText}>Add items</Text>
            </View>
          ) : !canPlaceOrder ? (
            <View style={styles.footerCtaSlotDisabled}>
              <Text style={styles.ctaDisabledLabel}>Place Order • ₹{toPay.toFixed(2)}</Text>
              <Text style={styles.ctaDisabledHint}>
                {!selectedAddress
                  ? "Check your address before proceeding"
                  : billingQuery.isError
                      ? "Could not load bill — retry"
                      : billingQuery.isLoading
                        ? "Loading bill…"
                        : !serverBill
                          ? "Waiting for bill"
                          : "Select payment"}
              </Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.footerCtaSlot, pressed && styles.ctaTouchPressed]}
              onPress={handlePlaceOrderPress}
              disabled={placeOrder.isPending || finalizeOrder.isPending || razorpayCreating}
            >
              <LinearGradient
                colors={GatiMitraColors.primaryGradientShort as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                {placeOrder.isPending || finalizeOrder.isPending || razorpayCreating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <View style={styles.ctaLeftPart}>
                      <Text style={styles.ctaTotalAmount} numberOfLines={1}>₹{toPay.toFixed(2)}</Text>
                      <Text style={styles.ctaTotalLabel} numberOfLines={1}>TOTAL</Text>
                    </View>
                    <View style={styles.ctaRightPart}>
                      <Text style={styles.ctaLabel} numberOfLines={1}>Place Order</Text>
                      <Ionicons name="chevron-forward" size={22} color="#fff" />
                    </View>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}
        </View>
        <View style={styles.codUnavailableWrap}>
          <Text style={styles.codUnavailableFooter}>Cash on Delivery is currently unavailable in your area.</Text>
        </View>
      </View>

      {editingItem && merchantId && (
        <ItemCustomizationSheet
          visible={!!editingCartItemId}
          onClose={() => setEditingCartItemId(null)}
          storeId={merchantId}
          item={editingItem}
          merchantName={merchantName ?? ""}
          isStoreClosed={isStoreClosed}
          onAdd={(params) => {
            updateQuantity(editingCartItemId!, -999);
            useCartStore.getState().addItem(merchantId!, merchantName!, {
              menuItemId: params.menuItemId,
              name: params.name,
              price: params.price,
              isVeg: params.isVeg,
            }, params.quantity);
            setEditingCartItemId(null);
          }}
        />
      )}

      <RazorpayCheckoutModal
        visible={razorpayModalVisible && !!razorpayOrderParams}
        orderParams={razorpayOrderParams}
        onSuccess={handleRazorpaySuccess}
        onCancel={handleRazorpayCancel}
      />

      {/* Simulated payment (when Razorpay not configured in dev) */}
      {simulatedPaymentOrder && (
        <View style={styles.simulatedPaymentOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleSimulatedPaymentCancel} />
          <Pressable onPress={() => {}} style={styles.simulatedPaymentCardWrap}>
            <Animated.View entering={FadeIn.duration(220)} style={styles.simulatedPaymentCard}>
              <View style={styles.simulatedPaymentIconWrap}>
                <Ionicons name="card-outline" size={28} color={GatiMitraColors.emerald} />
              </View>
              <Text style={styles.simulatedPaymentTitle}>Complete payment</Text>
              <View style={styles.simulatedPaymentDevBadge}>
                <Text style={styles.simulatedPaymentDevBadgeText}>Dev mode</Text>
              </View>
              <Text style={styles.simulatedPaymentSubtitle}>
                Razorpay is not configured. Simulate success to create order.
              </Text>
              <View style={styles.simulatedAmountRow}>
                <Text style={styles.simulatedAmountLabel}>Amount to pay</Text>
                <Text style={styles.simulatedAmountValue}>₹{(simulatedPaymentOrder.amount / 100).toFixed(2)}</Text>
              </View>
              <TouchableOpacity style={styles.simulatedConfirmBtn} onPress={handleSimulatedPaymentComplete} activeOpacity={0.85}>
                <Text style={styles.simulatedConfirmBtnText}>Confirm payment</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.simulatedCancelBtn} onPress={handleSimulatedPaymentCancel} activeOpacity={0.85}>
                <Text style={styles.simulatedCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function BillRow({
  label,
  value,
  bold,
  green,
}: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <View style={styles.billRow}>
      <Text style={styles.billLabel}>{label}</Text>
      <Text style={[styles.billValue, bold && styles.billValueBold, green && styles.billValueGreen]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: GatiMitraColors.textSecondary },
  ctaSecondary: { marginTop: SPACING, paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.emerald },
  header: {
    backgroundColor: GatiMitraColors.background,
    zIndex: 20,
    paddingHorizontal: SPACING,
    paddingBottom: GRID,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    ...GatiMitraColors.elevationShadow,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  headerBack: { padding: GRID, marginRight: GRID },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraColors.textPrimary },
  headerDistanceTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  headerDistanceTagFar: { backgroundColor: GatiMitraColors.warningAmberBg },
  headerDistanceTagIcon: { marginRight: 4 },
  headerDistanceTagText: { fontSize: 12, fontWeight: "600", color: GatiMitraColors.emerald },
  headerDistanceTagTextFar: { color: GatiMitraColors.warningAmber },
  headerShareLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  headerShareLocationText: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.emerald },
  distanceBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.warningAmberBg,
    paddingVertical: 12,
    paddingHorizontal: SPACING,
    gap: 10,
  },
  distanceBannerText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#92400E" },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING, paddingTop: SPACING },
  section: { marginBottom: SPACING - 2 },
  sectionContrib: { marginBottom: SPACING + 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary, marginBottom: GRID },
  sectionTitleSmall: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    marginBottom: GRID,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: 12,
    ...GatiMitraColors.elevationShadow,
  },
  orderSummaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: GRID * 2 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary, flex: 1 },
  etaBadge: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.emerald },
  orderItemsPreview: { gap: GRID },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: GRID,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  orderItemThumbWrap: { position: "relative", marginRight: GRID * 2 },
  orderItemThumb: { width: 48, height: 48, borderRadius: 10 },
  orderItemThumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  nonVegBg: { backgroundColor: "#FED7AA" },
  qtyBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GatiMitraColors.emerald,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  qtyBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  orderItemInfo: { flex: 1, minWidth: 0 },
  orderItemName: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  orderItemPrice: { fontSize: 14, color: GatiMitraColors.emerald, marginTop: 2 },
  orderItemActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyBtnSmall: { padding: 4 },
  qtyValueSmall: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary, minWidth: 20, textAlign: "center" },
  addMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: GRID,
    paddingTop: GRID,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    gap: GRID,
  },
  addMoreIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  addMoreText: { flex: 1, fontSize: 15, fontWeight: "600", color: GatiMitraColors.emerald },
  upsellSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  upsellSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GatiMitraColors.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  upsellSectionIconPlus: { position: "absolute", right: 4, bottom: 4 },
  upsellScrollWrap: { height: 158 },
  upsellScrollInner: { flex: 1, minHeight: 0 },
  upsellScrollContent: { paddingVertical: 4, paddingRight: SPACING, gap: 10, flexGrow: 0 },
  upsellCard: {
    width: 88,
    flexShrink: 0,
    marginRight: 0,
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: 12,
    padding: 0,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  upsellCardAdded: { borderColor: GatiMitraColors.emerald, backgroundColor: GatiMitraColors.mintSoft },
  upsellCardPressed: { backgroundColor: GatiMitraColors.mintSoft, opacity: 0.9 },
  upsellImageWrap: {
    width: 88,
    height: 88,
    position: "relative",
    backgroundColor: GatiMitraColors.mintSoft,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  upsellImage: { width: "100%", height: "100%", resizeMode: "cover", borderRadius: 0 },
  upsellImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  upsellVegBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellNonVegBadge: { backgroundColor: "#8B4513" },
  upsellVegDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  upsellAddBtnOnImage: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellAddBtnAdded: { backgroundColor: GatiMitraColors.emerald },
  upsellName: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    marginTop: 6,
    marginHorizontal: 6,
    width: 76,
  },
  upsellPrice: { fontSize: 12, fontWeight: "700", color: GatiMitraColors.emerald, marginTop: 2, marginBottom: 6, marginHorizontal: 6 },
  deliveryEtaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  deliveryEtaText: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.emerald },
  scheduleRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  scheduleText: { flex: 1, fontSize: 13, color: GatiMitraColors.textSecondary },
  deliveryDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: 8 },
  deliveryAddrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: GRID * 2,
    marginBottom: 10,
  },
  deliveryAddrTextWrap: { flex: 1, minWidth: 0 },
  deliveryAddrLabel: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  deliveryAddrSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
  leaveAtDoorChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  leaveAtDoorChipText: { fontSize: 12, color: GatiMitraColors.emerald, fontWeight: "600" },
  editAddressCta: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.warmOrange },
  changeAddressCta: { fontSize: 13, color: GatiMitraColors.emerald, marginTop: 2, fontWeight: "600" },
  leaveAtDoorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaveAtDoorLabel: { fontSize: 15, color: GatiMitraColors.textPrimary },
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: SPACING,
    gap: GRID * 2,
    ...GatiMitraColors.elevationShadow,
  },
  couponRowText: { flex: 1, fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  appliedCouponWrap: { flex: 1 },
  appliedCouponText: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.emerald },
  billSummaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  billSummaryHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  billSummaryTotal: { fontSize: 17, fontWeight: "800", color: GatiMitraColors.textPrimary },
  billSummaryExpanded: { marginTop: GRID },
  billSkeletonWrap: { gap: GRID * 2 },
  billSkeletonLine: { height: 20, borderRadius: 8 },
  billSkeletonLast: { width: "60%" },
  billSkeletonLastLine: { height: 20, borderRadius: 8, width: "60%" },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  billLabel: { fontSize: 14, color: GatiMitraColors.textSecondary },
  billValue: { fontSize: 14, color: GatiMitraColors.textPrimary },
  billValueBold: { fontWeight: "800", fontSize: 16 },
  billValueGreen: { color: GatiMitraColors.emerald, fontWeight: "600" },
  billDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: GRID },
  contributionTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  contributionSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  donationRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  donationCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraColors.emerald,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  donationCardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 0 },
  donationIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: GRID * 2,
  },
  donationCardTitleWrap: { flex: 1, minWidth: 0 },
  donationCardTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  donationCardSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  donationBoxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  donationSuggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 0 },
  donationAmountBox: {
    minWidth: 58,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  donationAmountBoxActive: {
    backgroundColor: GatiMitraColors.mintSoft,
    borderColor: GatiMitraColors.emerald,
    borderWidth: 2,
  },
  donationAmountBoxText: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  donationAmountBoxTextActive: { color: GatiMitraColors.emerald, fontWeight: "800" },
  donationChip: {
    minWidth: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.softBackground,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  donationChipActive: { backgroundColor: GatiMitraColors.mintSoft, borderColor: GatiMitraColors.emerald },
  donationChipText: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  donationChipTextActive: { color: GatiMitraColors.emerald, fontWeight: "700" },
  donationInputRow: { marginTop: 12 },
  donationInput: {
    borderWidth: 2,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
    backgroundColor: "#fff",
  },
  tipCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraColors.warmOrange,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  tipCardHeader: { flexDirection: "row", alignItems: "flex-start" },
  tipIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.warningAmberBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: GRID * 2,
  },
  tipCardTitleWrap: { flex: 1, minWidth: 0 },
  tipCardTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  tipCardSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  tipBoxLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  tipAmountBoxRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tipAmountBox: {
    minWidth: 56,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  tipAmountBoxActive: {
    backgroundColor: GatiMitraColors.warningAmberBg,
    borderColor: GatiMitraColors.warmOrange,
    borderWidth: 2,
  },
  tipAmountBoxText: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary },
  tipAmountBoxTextActive: { color: GatiMitraColors.warmOrange, fontWeight: "800" },
  tipChips: { flexDirection: "row", flexWrap: "wrap", gap: GRID, marginTop: GRID },
  tipChip: {
    minWidth: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.softBackground,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tipChipPressed: { opacity: 0.9 },
  tipChipActive: { backgroundColor: GatiMitraColors.emerald, borderColor: GatiMitraColors.emerald },
  tipChipText: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  tipChipTextActive: { color: "#fff" },
  customTipInput: {
    marginTop: GRID * 2,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
  },
  paymentSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  paymentSheet: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    padding: SPACING,
    paddingTop: GRID * 3,
  },
  paymentSheetTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.textPrimary, marginBottom: 6 },
  paymentSheetSubtitle: { fontSize: 13, color: GatiMitraColors.textSecondary, marginBottom: SPACING },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  paymentOptionActive: { backgroundColor: GatiMitraColors.mintSoft },
  paymentOptionText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  simulatedPaymentSheet: { maxWidth: 340 },
  simulatedPaymentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    paddingHorizontal: 24,
  },
  simulatedPaymentCardWrap: { width: "100%", maxWidth: 340 },
  simulatedPaymentCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: 20,
    paddingHorizontal: SPACING * 2,
    paddingTop: SPACING * 2.5,
    paddingBottom: SPACING * 2,
    ...GatiMitraColors.elevationShadow,
    shadowRadius: 16,
    elevation: 6,
  },
  simulatedPaymentIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  simulatedPaymentTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
    marginBottom: 6,
  },
  simulatedPaymentDevBadge: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 10,
  },
  simulatedPaymentDevBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.3,
  },
  simulatedPaymentSubtitle: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: SPACING * 1.5,
  },
  simulatedAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING * 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: GatiMitraColors.mintSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(5, 150, 105, 0.12)",
  },
  simulatedAmountLabel: { fontSize: 14, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  simulatedAmountValue: { fontSize: 20, fontWeight: "700", color: GatiMitraColors.textPrimary },
  simulatedConfirmBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 4,
  },
  simulatedConfirmBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  simulatedCancelBtn: { paddingVertical: 12, alignItems: "center" },
  simulatedCancelBtnText: { fontSize: 15, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  fixedBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING,
    paddingTop: GRID * 2,
    backgroundColor: GatiMitraColors.cardSurface,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    zIndex: 50,
    ...GatiMitraColors.elevationShadow,
  },
  footerRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  footerPaymentCard: {
    width: 100,
    minWidth: 100,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.mintSoft,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(5, 150, 105, 0.15)",
  },
  footerPaymentIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerPaymentTextWrap: { flex: 1, minWidth: 0 },
  footerPaySingleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "nowrap",
  },
  footerPayLabel: { fontSize: 11, fontWeight: "600", color: GatiMitraColors.textPrimary, flexShrink: 1 },
  footerPayChevron: { flexShrink: 0 },
  footerCtaSlot: { flex: 1, minWidth: 280, borderRadius: 28, overflow: "hidden", minHeight: 54, ...GatiMitraColors.cardShadowSoft },
  footerCtaSlotDisabled: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "#9ca3af",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 54,
  },
  codUnavailableWrap: { width: "100%", marginTop: 10, alignItems: "center" },
  codUnavailableFooter: { fontSize: 12, color: GatiMitraColors.textSecondary, textAlign: "center", alignSelf: "stretch" },
  cancellationBlock: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  cancellationTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  cancellationText: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    lineHeight: 16,
  },
  ctaDisabled: {
    paddingVertical: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#9ca3af",
    alignItems: "center",
  },
  ctaDisabledText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  ctaDisabledLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
  ctaDisabledHint: { fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  ctaTouch: { borderRadius: CARD_RADIUS, overflow: "hidden", ...GatiMitraColors.cardShadowSoft },
  ctaTouchPressed: { opacity: 0.96 },
  ctaGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 28,
    overflow: "hidden",
    minWidth: 0,
    gap: 12,
  },
  ctaLeftPart: { alignItems: "flex-start", flexShrink: 0, minWidth: 72 },
  ctaTotalAmount: { fontSize: 16, fontWeight: "800", color: "#fff" },
  ctaTotalLabel: { fontSize: 10, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  ctaRightPart: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0, minWidth: 100 },
  ctaLabel: { fontSize: 15, fontWeight: "700", color: "#fff" },
  ctaAmount: { fontSize: 16, fontWeight: "800", color: "#fff" },
  couponModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  couponModalContent: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    padding: SPACING,
    maxHeight: "70%",
  },
  couponModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING },
  couponModalTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.textPrimary },
  couponApplyRow: { flexDirection: "row", gap: GRID, marginBottom: GRID },
  couponCodeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: GatiMitraColors.textPrimary,
  },
  couponApplyBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
  },
  couponApplyBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  couponError: { fontSize: 13, color: GatiMitraColors.errorRed, marginBottom: GRID },
  couponList: { maxHeight: 280 },
  couponListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  couponListItemLeft: { flex: 1 },
  couponListCode: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  couponListDesc: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
});
