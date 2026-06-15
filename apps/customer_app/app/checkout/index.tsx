/**
 * GatiMitra Checkout — premium, production-level food delivery experience.
 * Single compact header, order summary with thumbnails, delivery card, coupons,
 * bill summary, optional contributions (tip + donation), inline payment, Place Order CTA.
 * No COD. No duplicate headers. All data backend-driven.
 */

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Pressable,
  Modal,
  BackHandler,
  Platform,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  PanResponder,
  Animated as RNAnimated,
} from "react-native";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useLocationStore } from "@/store/locationStore";
import { useOrderStore } from "@/store/orderStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";
import { orderService } from "@/services/order.service";
import { billingService, type CalculateBillResponse } from "@/services/billing.service";
import { previewEtaRange, formatEtaRange } from "@/lib/etaPreview";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { applyWeatherToEtaRange } from "@/services/weather.service";
import { paymentService } from "@/services/payment.service";
import { addressService, type Address } from "@/services/address.service";
import { profileService } from "@/services/profile.service";
import { RazorpayCheckoutModal, type RazorpayPaymentResult, type RazorpayOrderParams } from "@/components/RazorpayCheckoutModal";
import { merchantService, type MerchantSummary, type MenuItem } from "@/services/merchant.service";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP } from "@/constants/layout";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { haversineKm, SERVICE_RADIUS_KM } from "@/lib/billSummary";
import { matchSavedAddressIdNearCoords } from "@/lib/deliveryDropResolution";
import {
  buildDeliveryInstructionsList,
  parseDeliveryInstructionsList,
} from "@/lib/delivery-instructions";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { reverseGeocode } from "@/services/location.service";
import { getRoute } from "@/services/distance.service";
import { BrandingFooter } from "@/components/BrandingFooter";
import { isNetworkError, getNetworkErrorMessage } from "@/utils/networkError";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CouponApplyCelebration } from "@/components/checkout/CouponApplyCelebration";
import { CheckoutOffersSheet } from "@/components/checkout/CheckoutOffersSheet";
import { cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import {
  prefetchMenuItemFullConfig,
  prefetchMenuItemFullConfigsForMenu,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { useScreenChromeStore } from "@/store/screenChromeStore";

/** Wait before POST /billing/calculate after tip/donation slider moves. */
const BILLING_INPUT_DEBOUNCE_MS = 400;

function roundBillAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function discountMatchesCoupon(
  label: string | undefined | null,
  code: string | null,
  couponLabel: string | null
): boolean {
  if (!code) return false;
  const lbl = (label ?? "").toLowerCase();
  const c = code.toLowerCase();
  if (lbl.includes(c)) return true;
  if (couponLabel) {
    const cl = couponLabel.toLowerCase();
    if (cl.length > 2 && lbl.includes(cl)) return true;
  }
  return false;
}

// gstComponentLineTotal was used by the old inclusive-amount modal — removed
// because the modal now shows only the tax portion (`.gst`) per line so we
// don't duplicate the base values already displayed on the main bill rows.

/**
 * Total for the "GST & other charges" row.
 *
 * The bill displays each fee-bucket BASE separately (packaging, platform,
 * delivery, surge, small-order, convenience, subscription). This row is just
 * the taxes + any non-displayed residual — so the math reconciles:
 *
 *   itemsNet + Σ(displayed fee bases) + "GST & other charges" = preFinal
 *
 * which means:
 *
 *   "GST & other charges" = preFinal − itemsNet − Σ(displayed fee bases)
 *
 * For a typical bill this equals `taxTotal` exactly. If a misc rule wasn't
 * surfaced as its own row (rare), the difference appears here so the bill
 * always sums to To-pay.
 */
function computeGstAndOtherChargesTotal(
  bill: CalculateBillResponse,
  displayedMiscTotal: number,
): number {
  const preTipDon = roundBillAmount(bill.finalAmount - bill.tipAmount - bill.donationAmount);
  const accounted =
    bill.itemsNetAfterDiscounts +
    bill.packagingFee +
    bill.platformFee +
    bill.deliveryFee +
    bill.surgeFee +
    bill.smallOrderFee +
    bill.convenienceFee +
    displayedMiscTotal;
  return Math.max(0, roundBillAmount(preTipDon - accounted));
}

const GRID = 6;
const SPACING = GRID * 2;
/** Checkout item / bill cards — reference uses ~16px radius */
const CARD_RADIUS = 16;
const ANIM_DURATION = 240;

/** Checkout accents — mint green CTAs / links (replaces maroon & pink-red) */
const CX = {
  mint: "#2DB5A0",
  mintDark: "#249682",
  mintSoft: "#E8F8F5",
  mintBorder: "#9FD9CD",
  mintGradient: ["#3EC9A8", "#2DB5A0"] as const,
  textSecondary: "#666666",
} as const;

/** Matches checkout header strip — synced with root status bar via screenChromeStore. */
const CHECKOUT_HEADER_BG = "#F8F8F8";

const GMITRA_PLUS_NAME = "GMitra plus";

const SCHEDULE_SLOT_OPTIONS = [
  "11:00 AM - 11:30 AM",
  "11:30 AM - 12:00 PM",
  "12:00 PM - 12:30 PM",
  "12:30 PM - 1:00 PM",
  "1:00 PM - 1:30 PM",
  "1:30 PM - 2:00 PM",
  "2:00 PM - 2:30 PM",
  "2:30 PM - 3:00 PM",
  "3:00 PM - 3:30 PM",
  "5:00 PM - 5:30 PM",
  "6:00 PM - 6:30 PM",
  "7:00 PM - 8:00 PM",
  "8:00 PM - 8:30 PM",
] as const;

function checkoutAddressRowIcon(
  label: string | null | undefined,
  contactName: string | null | undefined
): React.ComponentProps<typeof Ionicons>["name"] {
  if (contactName?.trim()) return "person-outline";
  if (!label?.trim()) return "location-outline";
  const l = label.toLowerCase();
  if (l === "home") return "home-outline";
  if (l === "work") return "briefcase-outline";
  return "location-outline";
}

function formatAddressToStoreDistance(
  storeLat: number | null | undefined,
  storeLng: number | null | undefined,
  addr: Address
): string {
  if (storeLat == null || storeLng == null) return "—";
  const km = haversineKm(Number(storeLat), Number(storeLng), addr.latitude, addr.longitude);
  const m = km * 1000;
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${km.toFixed(1)} km`;
}

/** One-line summary in the checkout card (Zomato-style). */
function formatCheckoutReceiverLine(
  name: string | null | undefined,
  mobile: string | null | undefined
): string {
  const n = name?.trim() ?? "";
  const m = mobile?.trim() ?? "";
  if (!n && !m) return "Add receiver details";
  let mDisp = m;
  if (m && !m.startsWith("+")) {
    const digits = m.replace(/\D/g, "");
    if (digits.length === 10) mDisp = `+91-${digits}`;
    else mDisp = m;
  } else if (m.startsWith("+91")) {
    const rest = m.slice(3).replace(/\D/g, "");
    mDisp = rest.length >= 10 ? `+91-${rest.slice(0, 10)}` : m;
  }
  if (n && mDisp) return `${n}, ${mDisp}`;
  return n || mDisp;
}

function cartItemSubline(item: CartItem): string {
  const parts: string[] = [];
  if (item.variantName?.trim()) parts.push(item.variantName.trim());
  if (item.addons?.length) {
    for (const a of item.addons) {
      const q = a.quantity > 1 ? ` ×${a.quantity}` : "";
      parts.push(`${a.addonName}${q}`);
    }
  }
  return parts.join(" · ");
}

function cartItemBaseId(menuItemId: string): string {
  return menuItemId.includes("_") ? menuItemId.split("_")[0]! : menuItemId;
}

function findMenuItemByCartBaseId(
  menu: import("@/services/merchant.service").MenuItem[] | undefined,
  baseId: string
): import("@/services/merchant.service").MenuItem | undefined {
  if (!menu?.length || !baseId) return undefined;
  return menu.find(
    (m) => m.id === baseId || (m.menuItemId != null && String(m.menuItemId) === baseId)
  );
}

function isCartItemCustomizable(
  cartItem: CartItem,
  menuItem?: import("@/services/merchant.service").MenuItem
): boolean {
  if (cartItem.variantId || cartItem.variantName?.trim() || (cartItem.addons?.length ?? 0) > 0) {
    return true;
  }
  if (!menuItem) return false;
  return !!(menuItem.hasVariants || menuItem.hasAddons || menuItem.hasCustomizations);
}

function DietIndicator({ isVeg }: { isVeg: boolean }) {
  return (
    <View style={[dietStyles.box, isVeg ? dietStyles.boxVeg : dietStyles.boxNonVeg]}>
      <View style={[dietStyles.dot, isVeg ? dietStyles.dotVeg : dietStyles.dotNonVeg]} />
    </View>
  );
}

const dietStyles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
    borderRadius: 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  boxVeg: { borderColor: "#22C55E" },
  boxNonVeg: { borderColor: "#8D4A2B" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotVeg: { backgroundColor: "#22C55E" },
  dotNonVeg: { backgroundColor: "#8D4A2B" },
});

/** Shown in "Order failed" alert when payment may have been charged. */
const ORDER_FAILED_REFUND_NOTE =
  " If you were charged, the amount will be reverted within 24–48 working hours. In some cases, refunds may be instant. For any issues, contact support with your payment details.";

const PAYMENT_OPTIONS = [
  { id: "upi", label: "UPI (GPay, PhonePe, Paytm & more)", displayName: "UPI" },
  { id: "card", label: "Credit / Debit Card", displayName: "Card" },
  { id: "wallet", label: "Wallets (Paytm, Amazon Pay & more)", displayName: "Wallet" },
] as const;

/** Tip slider labels (0–₹60); default tip is ₹0 until user drags. */
const TIP_SLIDER_LABELS = [0, 20, 40, 60] as const;
const TIP_SLIDER_MAX = 60;
const TIP_SLIDER_THUMB_R = 10;
/** Horizontal inset so thumb center sits on ₹0 and ₹60 (not past track ends). */
const TIP_TRACK_PAD = TIP_SLIDER_THUMB_R;
/** Half-width of each ₹ label (px) — centers text under tick on inner track. */
const TIP_LABEL_HALF_WIDTH: readonly [number, number, number, number] = [12, 14, 14, 16];

const FEEDING_INDIA_ART = require("../../public/img/fed.png");

/** Horizontal marquee for restaurant note below utility pills. */
function RestaurantNoteMarquee({ note }: { note: string }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const textW = useRef(0);
  const viewW = useRef(0);
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    translateX.setValue(0);
    const overflow = textW.current - viewW.current;
    if (overflow <= 4) return;
    const scrollMs = Math.max(3500, overflow * 22);
    loopRef.current = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(600),
        RNAnimated.timing(translateX, {
          toValue: -overflow,
          duration: scrollMs,
          useNativeDriver: true,
        }),
        RNAnimated.delay(900),
        RNAnimated.timing(translateX, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [note, translateX]);

  return (
    <View
      style={restaurantNoteMarqueeStyles.wrap}
      onLayout={(e) => {
        viewW.current = e.nativeEvent.layout.width;
      }}
    >
      <RNAnimated.View style={{ flexDirection: "row", transform: [{ translateX }] }}>
        <Text
          style={restaurantNoteMarqueeStyles.text}
          onLayout={(e) => {
            textW.current = e.nativeEvent.layout.width;
          }}
          numberOfLines={1}
        >
          {note}
        </Text>
      </RNAnimated.View>
    </View>
  );
}

const restaurantNoteMarqueeStyles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: CX.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(45, 181, 160, 0.25)",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: CX.mintDark,
    flexShrink: 0,
  },
});

/** Footer delivery / takeaway — active segment + shell border (mint, matches checkout CTAs). */
const DELIVERY_TOGGLE_ACTIVE = CX.mint;
const DELIVERY_TOGGLE_BORDER = "rgba(45, 181, 160, 0.38)";

/**
 * Footer row layout — must match `fixedBottom.paddingHorizontal` (12 + 12).
 * Toggle width is fixed; CTA width = screen − padding − gap − toggle (no overlap, no flex minWidth fight).
 */
const CHECKOUT_FOOTER_H_PAD = 24;
const CHECKOUT_FOOTER_TOGGLE_WIDTH = 152;
const CHECKOUT_FOOTER_GAP = 8;
/** Same outer radius as `deliveryTypeToggle` (not a full pill). */
const CHECKOUT_FOOTER_CTA_RADIUS = 14;

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const checkoutFooterCtaWidth = useMemo(
    () =>
      windowWidth -
      CHECKOUT_FOOTER_H_PAD -
      CHECKOUT_FOOTER_GAP -
      CHECKOUT_FOOTER_TOGGLE_WIDTH,
    [windowWidth],
  );
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const { items, merchantId, merchantName, updateQuantity, clearCart, syncPricesFromMap } = useCartStore();
  useEnsureStoreLiveStatus(merchantId ?? null);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const storeStatus = useStoreStatusStore((s) => (merchantId ? s.getStatus(merchantId) : null));
  const isStoreClosed = storeStatus === "CLOSED";

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  /** Delivery / Self pickup toggle. Self pickup waives the delivery fee server-side. */
  const [deliveryType, setDeliveryType] = useState<"delivery" | "self_pickup">("delivery");
  const [tipSliderValue, setTipSliderValue] = useState(0);
  const [tipSliderBlockW, setTipSliderBlockW] = useState(0);
  const [donationEnabled, setDonationEnabled] = useState(false);
  const [subscriptionOptIn, setSubscriptionOptIn] = useState(false);
  const [donationAmount, setDonationAmount] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedCouponLabel, setAppliedCouponLabel] = useState<string | null>(null);
  const [leaveAtDoor, setLeaveAtDoor] = useState(true);
  const [restaurantNote, setRestaurantNote] = useState("");
  const [restaurantNoteModalVisible, setRestaurantNoteModalVisible] = useState(false);
  const [skipCutlery, setSkipCutlery] = useState(false);
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0);
  const [scheduleSlotDraft, setScheduleSlotDraft] = useState<string | null>(null);
  const [scheduledDeliverySummary, setScheduledDeliverySummary] = useState<string | null>(null);
  const [instructionSheetVisible, setInstructionSheetVisible] = useState(false);
  const [instructionSaveBusy, setInstructionSaveBusy] = useState(false);
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [addressSheetBusyId, setAddressSheetBusyId] = useState<number | null>(null);
  const [receiverSheetVisible, setReceiverSheetVisible] = useState(false);
  const [communityInitiativeSheetVisible, setCommunityInitiativeSheetVisible] = useState(false);
  const [receiverDraftName, setReceiverDraftName] = useState("");
  const [receiverDraftMobile, setReceiverDraftMobile] = useState("");
  const [deliveryPartnerNote, setDeliveryPartnerNote] = useState("");
  const [instrLeaveWithGuard, setInstrLeaveWithGuard] = useState(false);
  const [instrAvoidCalling, setInstrAvoidCalling] = useState(false);
  const [instrDontRingBell, setInstrDontRingBell] = useState(false);
  const [instrPetAtHome, setInstrPetAtHome] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [pendingCustomizationItem, setPendingCustomizationItem] = useState<MenuItem | null>(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [billSummarySheetVisible, setBillSummarySheetVisible] = useState(false);
  /** Modal showing the per-line GST + extras breakdown when the user taps the `i` chip. */
  const [gstBreakdownModalVisible, setGstBreakdownModalVisible] = useState(false);
  const [gmitraPlusSheetVisible, setGmitraPlusSheetVisible] = useState(false);
  const [couponSheetVisible, setCouponSheetVisible] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponApplyError, setCouponApplyError] = useState<string | null>(null);
  const [couponCelebrationVisible, setCouponCelebrationVisible] = useState(false);
  const [couponCelebrationCode, setCouponCelebrationCode] = useState("");
  const [selectedPlatformOfferId, setSelectedPlatformOfferId] = useState<number | null>(null);
  const [selectedMerchantOfferId, setSelectedMerchantOfferId] = useState<number | null>(null);
  const [forceNoAutoOffer, setForceNoAutoOffer] = useState(false);
  const [currentLocationDisplay, setCurrentLocationDisplay] = useState<{ label: string; fullAddress: string } | null>(null);
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [donationPreset, setDonationPreset] = useState<5 | 10 | 15 | 20 | "custom" | null>(null);
  const [razorpayOrderParams, setRazorpayOrderParams] = useState<(RazorpayOrderParams & { pendingId?: string }) | null>(null);
  const [razorpayModalVisible, setRazorpayModalVisible] = useState(false);
  const [razorpayCreating, setRazorpayCreating] = useState(false);
  const [simulatedPaymentOrder, setSimulatedPaymentOrder] = useState<{ orderId: string; amount: number; pendingId?: string } | null>(null);
  const currentLocationAddressCreatedRef = useRef(false);
  /**
   * Idempotency key for the current checkout attempt. Generated on first
   * "Place order" tap and cleared on success / cancel / address change, so
   * retries of the SAME user-intent collapse to a single pending order, while
   * a new intent (e.g. after editing the cart) gets a fresh key.
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  const tipSliderTrackWRef = useRef(0);
  const instructionsHydratedForAddressRef = useRef<number | null>(null);

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
  });

  const { data: userProfile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
    staleTime: 60_000,
  });

  const sessionCoords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const setAddressAndCoords = useLocationStore((s) => s.setAddressAndCoords);
  const liveLocationAddress = useLocationStore((s) => s.address);

  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
  });

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["active-location"] });
      void queryClient.invalidateQueries({ queryKey: ["addresses"] });
      void queryClient.invalidateQueries({ queryKey: ["me", "profile"] });
    }, [queryClient])
  );

  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);

  useFocusEffect(
    useCallback(() => {
      setStatusBarBackground(CHECKOUT_HEADER_BG);
      return () => resetStatusBarBackground();
    }, [setStatusBarBackground, resetStatusBarBackground])
  );

  useEffect(() => {
    if (!scheduleSheetVisible) return;
    setScheduleSlotDraft(SCHEDULE_SLOT_OPTIONS[0]);
  }, [scheduleDayIndex, scheduleSheetVisible]);

  // Address selection priority — explicit pick in this checkout session wins,
  // then the customer's current default (set on the home picker or "Set as
  // default" in profile), then the last-order fallback, then the first row.
  // The default beats last-used so the user's most recent explicit choice on
  // the home header propagates to checkout without an extra tap.
  const selectedAddress = useMemo(
    () =>
      addresses.find((a) => a.id === selectedAddressId) ??
      addresses.find((a) => a.isDefault) ??
      addresses.find((a) => a.isLastUsed) ??
      addresses[0],
    [addresses, selectedAddressId]
  );

  const checkoutReceiverSummary = useMemo(() => {
    const name = selectedAddress?.contactName?.trim() || userProfile?.full_name?.trim() || "";
    const mobile = selectedAddress?.contactMobile?.trim() || userProfile?.mobile_number?.trim() || "";
    return formatCheckoutReceiverLine(name, mobile);
  }, [
    selectedAddress?.contactName,
    selectedAddress?.contactMobile,
    userProfile?.full_name,
    userProfile?.mobile_number,
  ]);

  /** Load saved rider instructions from the selected address (JSON array on customer_addresses). */
  useEffect(() => {
    if (!selectedAddress) return;
    if (instructionsHydratedForAddressRef.current === selectedAddress.id) return;
    instructionsHydratedForAddressRef.current = selectedAddress.id;
    if (!selectedAddress.deliveryInstructionsList?.length) return;
    const parsed = parseDeliveryInstructionsList(selectedAddress.deliveryInstructionsList);
    setDeliveryPartnerNote(parsed.note);
    setLeaveAtDoor(parsed.leaveAtDoor);
    setInstrLeaveWithGuard(parsed.leaveWithGuard);
    setInstrAvoidCalling(parsed.avoidCalling);
    setInstrDontRingBell(parsed.dontRingBell);
    setInstrPetAtHome(parsed.petAtHome);
  }, [selectedAddress?.id, selectedAddress?.deliveryInstructionsList]);

  const saveDeliveryPartnerInstructions = useCallback(async () => {
    const list = buildDeliveryInstructionsList({
      note: deliveryPartnerNote,
      leaveAtDoor,
      leaveWithGuard: instrLeaveWithGuard,
      avoidCalling: instrAvoidCalling,
      dontRingBell: instrDontRingBell,
      petAtHome: instrPetAtHome,
    });
    if (!selectedAddress) {
      setInstructionSheetVisible(false);
      return;
    }
    setInstructionSaveBusy(true);
    try {
      await addressService.updateAddress(selectedAddress.id, { deliveryInstructionsList: list });
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      instructionsHydratedForAddressRef.current = selectedAddress.id;
      setInstructionSheetVisible(false);
    } catch (err) {
      Alert.alert(
        "Could not save instructions",
        err instanceof Error ? err.message : "Please try again."
      );
    } finally {
      setInstructionSaveBusy(false);
    }
  }, [
    deliveryPartnerNote,
    leaveAtDoor,
    instrLeaveWithGuard,
    instrAvoidCalling,
    instrDontRingBell,
    instrPetAtHome,
    selectedAddress,
    queryClient,
  ]);

  // Keep "active location" and global location pin in sync with the checkout delivery address.
  // This makes store distance consistent across Home, Merchant detail, and Checkout.
  useEffect(() => {
    if (!selectedAddress) return;

    const lat = selectedAddress.latitude;
    const lng = selectedAddress.longitude;

    const sameAsSession =
      locationSource === "selected" &&
      sessionCoords != null &&
      Math.abs(sessionCoords.latitude - lat) < 1e-6 &&
      Math.abs(sessionCoords.longitude - lng) < 1e-6;

    const activeLat = activeLocation?.latitude;
    const activeLng = activeLocation?.longitude;
    const sameAsActive =
      activeLat != null &&
      activeLng != null &&
      Math.abs(activeLat - lat) < 1e-6 &&
      Math.abs(activeLng - lng) < 1e-6;

    if (sameAsSession && sameAsActive) return;

    // Update local app "selected" location (used by merchants list + merchant detail).
    if (!sameAsSession) {
      setAddressAndCoords(
        {
          primary: selectedAddress.label ?? "Delivery location",
          secondary: [selectedAddress.city, selectedAddress.state].filter(Boolean).join(", "),
          fullAddress: selectedAddress.fullAddress,
          city: selectedAddress.city ?? null,
          state: selectedAddress.state ?? null,
          pincode: selectedAddress.pincode ?? null,
        },
        { latitude: lat, longitude: lng },
        { source: "selected" }
      );
    }

    // Best-effort: update backend active location so future sessions/devices are consistent.
    if (!sameAsActive) {
      addressService
        .setActiveLocation({
          latitude: lat,
          longitude: lng,
          address: selectedAddress.fullAddress,
        })
        .catch(() => {});
    }
  }, [
    activeLocation?.latitude,
    activeLocation?.longitude,
    locationSource,
    sessionCoords?.latitude,
    sessionCoords?.longitude,
    selectedAddress?.id,
    selectedAddress?.latitude,
    selectedAddress?.longitude,
    selectedAddress?.fullAddress,
    selectedAddress?.label,
    selectedAddress?.city,
    selectedAddress?.state,
    selectedAddress?.pincode,
    setAddressAndCoords,
  ]);

  /**
   * Delivery pin must follow the same source as home / "Select a location":
   * 1) In-memory map pin when user chose a saved address or map (locationSource === "selected")
   * 2) Server PUT /v1/me/active-location (updated when user picks a saved row or current location)
   * 3) Fallback: isLastUsed / default / first — avoids ignoring "Kkk" when backend flags still point at HOME.
   * Do not auto-pick a saved address from device GPS here — that breaks ordering for someone else while you are elsewhere.
   */
  useEffect(() => {
    if (addresses.length === 0) return;

    let resolved: number | null = null;
    if (sessionCoords && locationSource === "selected") {
      resolved = matchSavedAddressIdNearCoords(
        addresses,
        sessionCoords.latitude,
        sessionCoords.longitude,
        0.25
      );
    }
    if (
      resolved == null &&
      activeLocation?.latitude != null &&
      activeLocation.longitude != null
    ) {
      resolved = matchSavedAddressIdNearCoords(
        addresses,
        activeLocation.latitude,
        activeLocation.longitude,
        0.08
      );
    }

    if (resolved != null) {
      // Only snap to map/active pin on first resolve — don't fight checkout address sync.
      setSelectedAddressId((prev) => (prev != null ? prev : resolved));
      return;
    }

    setSelectedAddressId((prev) => {
      if (prev != null) return prev;
      const defaultAddr =
        addresses.find((a) => a.isLastUsed) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
      return defaultAddr?.id ?? null;
    });
  }, [
    addresses,
    sessionCoords?.latitude,
    sessionCoords?.longitude,
    locationSource,
    activeLocation?.latitude,
    activeLocation?.longitude,
  ]);

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
      } catch {
        if (!cancelled) setCurrentLocationDisplay({ label: "Current location", fullAddress: "Enable location to set" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    // Always re-fetch on focus / mount so a commission rate change or a price
    // edit in the merchant app propagates immediately to the open cart UI.
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!merchantId || !merchant?.menu?.length) return;
    prefetchMenuItemFullConfigsForMenu(queryClient, merchantId, merchant.menu);
  }, [merchantId, merchant?.menu, queryClient]);

  useEffect(() => {
    if (!merchantId || !merchant?.menu?.length || items.length === 0) return;
    for (const line of items) {
      const baseId = cartItemBaseId(line.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant.menu, baseId);
      if (!isCartItemCustomizable(line, menuItem)) continue;
      const refItem = menuItem ?? {
        id: baseId,
        menuItemId: /^\d+$/.test(baseId) ? Number(baseId) : undefined,
        name: line.name,
        price: line.price,
        isVeg: line.isVeg,
        hasVariants: !!line.variantId,
        hasAddons: (line.addons?.length ?? 0) > 0,
        hasCustomizations: !!(line.variantId || line.variantName || (line.addons?.length ?? 0) > 0),
      };
      void prefetchMenuItemFullConfig(
        queryClient,
        merchantId,
        resolveFullConfigItemId(refItem)
      );
    }
  }, [merchantId, merchant?.menu, items, queryClient]);

  // Whenever the menu refreshes, push the live per-item price into the cart
  // store so the cart UI displays the same number the menu list shows. This
  // matters for items added before a commission rate change or before a
  // subscription benefit kicked in — without this the cart would keep showing
  // the stale add-time price even though the bill is server-recalculated.
  useEffect(() => {
    if (!merchant?.menu || merchant.menu.length === 0 || items.length === 0) return;
    const priceById: Record<string, number> = {};
    for (const m of merchant.menu) {
      if (typeof m.price === "number" && Number.isFinite(m.price)) {
        priceById[m.id] = m.price;
      }
    }
    if (Object.keys(priceById).length > 0) {
      syncPricesFromMap(priceById);
    }
    // Intentionally omit `items` from deps — we react to menu changes only;
    // syncPricesFromMap reads the latest items via the store getter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.menu, syncPricesFromMap]);

  const checkoutCartBannerUrl = useMemo(() => {
    if (!merchant) return null;
    const m = merchant as MerchantSummary & { imageUrl?: string | null };
    const raw = m.displayImage ?? m.banner_url ?? m.imageUrl ?? null;
    return raw ? toAbsoluteImageUrl(raw) ?? raw : null;
  }, [merchant]);

  const { data: merchantAbout } = useQuery({
    queryKey: ["merchant-about", merchantId],
    queryFn: () => merchantService.getMerchantAbout(merchantId!),
    enabled: !!merchantId,
  });

  const storeFullAddress = merchantAbout?.full_address ?? merchant?.address ?? merchant?.city ?? merchantName;

  const openCheckoutAddressSheet = useCallback(() => {
    setAddressSheetVisible(true);
  }, []);

  const deleteCheckoutAddressMutation = useMutation({
    mutationFn: (id: number) => addressService.deleteAddress(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["addresses"] });
      void queryClient.invalidateQueries({ queryKey: ["active-location"] });
    },
  });

  const selectAddressFromCheckoutSheet = useCallback(
    async (addr: Address) => {
      if (addressSheetBusyId != null) return;
      setAddressSheetBusyId(addr.id);
      try {
        idempotencyKeyRef.current = null;
        // Mirror the home-page picker: update active-location, persist this
        // pick as the customer's default (so re-opening any screen uses it),
        // then invalidate the local cache. setAddressDefault is best-effort —
        // local state still updates if the network call fails.
        await Promise.all([
          addressService.setActiveLocation({
            latitude: addr.latitude,
            longitude: addr.longitude,
            address: addr.fullAddress,
          }),
          addressService.setAddressDefault(addr.id).catch(() => {}),
        ]);
        const primary = addr.label ?? "Other";
        setAddressAndCoords(
          {
            primary,
            secondary: addr.fullAddress.slice(0, 80),
            fullAddress: addr.fullAddress,
            city: addr.city ?? null,
            state: addr.state ?? null,
            pincode: addr.pincode ?? null,
          },
          { latitude: addr.latitude, longitude: addr.longitude },
          { source: "selected" }
        );
        setSelectedAddressId(addr.id);
        await queryClient.invalidateQueries({ queryKey: ["addresses"] });
        await queryClient.invalidateQueries({ queryKey: ["active-location"] });
        setAddressSheetVisible(false);
      } catch {
        Alert.alert("Could not update address", "Please try again.");
      } finally {
        setAddressSheetBusyId(null);
      }
    },
    [addressSheetBusyId, queryClient, setAddressAndCoords]
  );

  const shareCheckoutAddress = useCallback(async (addr: Address) => {
    const label = addr.label ?? "Address";
    const name = addr.contactName ? ` – ${addr.contactName}` : "";
    const parts: string[] = [`${label}${name}`, addr.fullAddress];
    if (addr.contactMobile) parts.push(`Phone: ${addr.contactMobile}`);
    parts.push(`Location: https://maps.google.com/?q=${addr.latitude},${addr.longitude}`, "", "GatiMitra");
    try {
      await Share.share({ message: parts.join("\n") });
    } catch {
      // ignore
    }
  }, []);

  const confirmDeleteCheckoutAddress = useCallback(
    (addr: Address) => {
      Alert.alert("Delete address?", "Remove this saved address?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                idempotencyKeyRef.current = null;
                await deleteCheckoutAddressMutation.mutateAsync(addr.id);
                if (selectedAddressId === addr.id) {
                  setSelectedAddressId(null);
                }
              } catch {
                Alert.alert("Could not delete", "Please try again.");
              }
            })();
          },
        },
      ]);
    },
    [deleteCheckoutAddressMutation, selectedAddressId]
  );

  const openCheckoutAddressEditMap = useCallback(
    (addr: Address) => {
      setAddressSheetVisible(false);
      router.push({
        pathname: "/location-address",
        params: {
          latitude: String(addr.latitude),
          longitude: String(addr.longitude),
          addressId: String(addr.id),
          primary: addr.label ?? addr.fullAddress.slice(0, 40),
          afterSaveReturn: "checkout",
        },
      });
    },
    [router]
  );

  const updateReceiverContactMutation = useMutation({
    mutationFn: (args: {
      id: number;
      contactName: string | null;
      contactMobile: string | null;
    }) => addressService.updateAddress(args.id, { contactName: args.contactName, contactMobile: args.contactMobile }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
  });

  const openReceiverSheet = useCallback(() => {
    if (!selectedAddress) return;
    setReceiverDraftName(
      selectedAddress.contactName?.trim() || userProfile?.full_name?.trim() || ""
    );
    setReceiverDraftMobile(
      selectedAddress.contactMobile?.trim() || userProfile?.mobile_number?.trim() || ""
    );
    setReceiverSheetVisible(true);
  }, [selectedAddress, userProfile?.full_name, userProfile?.mobile_number]);

  const pickReceiverFromContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Contacts", "Please allow access to pick someone from your contacts.");
        return;
      }
      const c = await Contacts.presentContactPickerAsync();
      if (!c) return;
      const composed = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      const dn = (typeof c.name === "string" ? c.name : composed).trim();
      const raw = c.phoneNumbers?.[0]?.number?.replace(/[\s-]/g, "") ?? "";
      if (dn) setReceiverDraftName(dn);
      if (raw) setReceiverDraftMobile(raw);
    } catch {
      Alert.alert("Contacts", "Contact picker is not available on this device.");
    }
  }, []);

  const saveReceiverDetails = useCallback(async () => {
    if (!selectedAddress) return;
    const contactName = receiverDraftName.trim() || null;
    const contactMobile = receiverDraftMobile.trim().replace(/\s+/g, "") || null;
    try {
      idempotencyKeyRef.current = null;
      await updateReceiverContactMutation.mutateAsync({
        id: selectedAddress.id,
        contactName,
        contactMobile,
      });
      setReceiverSheetVisible(false);
    } catch {
      Alert.alert("Could not save", "Please try again.");
    }
  }, [selectedAddress, receiverDraftName, receiverDraftMobile, updateReceiverContactMutation]);

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

  /** Store→drop km from backend routing engine (UI hint while bill loads). */
  const routeDistanceKm = routeDistanceQuery.data?.distanceKm ?? null;

  const currentVsSelectedDistanceKm = useMemo(() => {
    if (!selectedAddress || !currentLocationCoords) return null;
    return haversineKm(
      selectedAddress.latitude,
      selectedAddress.longitude,
      currentLocationCoords.latitude,
      currentLocationCoords.longitude
    );
  }, [selectedAddress, currentLocationCoords]);

  /** Matches server cart subtotal (items + add-ons) for offer eligibility. */
  const cartSubtotalForOffers = useMemo(
    () =>
      items.reduce((s, i) => {
        const base = cartLineBaseUnitPrice(i);
        const line = base * i.quantity;
        const addonLine = (i.addons ?? []).reduce(
          (a, ad) => a + ad.addonPrice * ad.quantity * i.quantity,
          0
        );
        return s + line + addonLine;
      }, 0),
    [items]
  );

  const tipValue = useMemo(
    () => Math.max(0, Math.min(TIP_SLIDER_MAX, tipSliderValue)),
    [tipSliderValue]
  );

  /** Thumb position on inner track (₹0–₹60 only). */
  const tipTrackGeometry = useMemo(() => {
    const w = tipSliderBlockW;
    const inner = Math.max(0, w - 2 * TIP_TRACK_PAD);
    const center = TIP_TRACK_PAD + (tipValue / TIP_SLIDER_MAX) * inner;
    return {
      inner,
      thumbLeft: center - TIP_SLIDER_THUMB_R,
    };
  }, [tipSliderBlockW, tipValue]);

  const tipNearestLabel = useMemo(() => {
    let best: (typeof TIP_SLIDER_LABELS)[number] = TIP_SLIDER_LABELS[0];
    let d = Infinity;
    for (const s of TIP_SLIDER_LABELS) {
      const dd = Math.abs(tipSliderValue - s);
      if (dd < d) {
        d = dd;
        best = s;
      }
    }
    return best;
  }, [tipSliderValue]);

  const setTipFromLocalX = useCallback((localX: number) => {
    const w = tipSliderTrackWRef.current;
    const inner = w - 2 * TIP_TRACK_PAD;
    if (inner < 4) return;
    const clampedX = Math.max(TIP_TRACK_PAD, Math.min(w - TIP_TRACK_PAD, localX));
    const ratio = (clampedX - TIP_TRACK_PAD) / inner;
    setTipSliderValue(Math.max(0, Math.min(TIP_SLIDER_MAX, Math.round(ratio * TIP_SLIDER_MAX))));
  }, []);

  /** Reset tip when opening checkout for a store — never carry over from scroll glitches. */
  useEffect(() => {
    setTipSliderValue(0);
  }, [merchantId]);

  const tipTrackPanResponder = useMemo(
    () =>
      PanResponder.create({
        /** Do not grab touches on scroll — only horizontal drags on the track. */
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25,
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (e) => setTipFromLocalX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setTipFromLocalX(e.nativeEvent.locationX),
      }),
    [setTipFromLocalX]
  );

  const donationValue = donationEnabled
    ? (donationPreset !== "custom" && donationPreset != null ? Number(donationPreset) : parseFloat(donationAmount) || 0)
    : 0;

  const debouncedTipForBilling = useDebouncedValue(tipValue, BILLING_INPUT_DEBOUNCE_MS);
  const debouncedDonationForBilling = useDebouncedValue(donationValue, BILLING_INPUT_DEBOUNCE_MS);

  const clearCheckoutDonation = useCallback(() => {
    setDonationEnabled(false);
    setDonationPreset(null);
    setDonationAmount("");
  }, []);

  const itemsWithSnapshots = useMemo(() => {
    const baseId = (menuItemId: string) =>
      menuItemId.includes("_") ? menuItemId.split("_")[0]! : menuItemId;
    return items.map((i) => {
      const bid = baseId(i.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant?.menu, bid);
      const categoryName =
        (menuItem as { categoryName?: string } | undefined)?.categoryName ??
        (menuItem as { category_name?: string } | undefined)?.category_name;
      const rawPack =
        (menuItem as { packaging_charges?: number; packagingCharges?: number } | undefined)
          ?.packaging_charges ??
        (menuItem as { packagingCharges?: number } | undefined)?.packagingCharges;
      const packNum = rawPack != null ? Number(rawPack) : NaN;
      const snap: Record<string, unknown> = { isVeg: i.isVeg };
      if (i.variantName) snap.variant_name = i.variantName;
      if (i.variantSizeValue) snap.variant_size_value = i.variantSizeValue;
      if (i.variantSizeUnit) snap.variant_size_unit = i.variantSizeUnit;
      if (categoryName) snap.category_name = categoryName;
      if (Number.isFinite(packNum) && packNum > 0) {
        snap.packaging_enabled = true;
        snap.packaging_charges = packNum;
      }
      return {
        menuItemId: bid,
        itemName: i.name,
        quantity: i.quantity,
        basePrice: cartLineBaseUnitPrice(i),
        variantId: i.variantId ?? null,
        variantName: i.variantName ?? null,
        addons: (i.addons ?? [])
          .filter((a) => {
            const id = String(a.addonId ?? "").trim();
            return id.length > 0 && id !== "0";
          })
          .map((a) => ({
            addonId: String(a.addonId).trim(),
            customizationId: a.customizationId ?? null,
            addonName: a.addonName,
            addonPrice: a.addonPrice,
            quantity: a.quantity,
            addon_size_value: a.addonSizeValue ?? undefined,
            addon_size_unit: a.addonSizeUnit ?? undefined,
          })),
        itemSnapshot: snap,
      };
    });
  }, [items, merchant?.menu]);

  const billingCartKey = useMemo(
    () =>
      JSON.stringify(
        itemsWithSnapshots.map((i) => ({
          id: i.menuItemId,
          q: i.quantity,
          p: i.basePrice,
          v: i.variantId ?? null,
          a: (i.addons ?? []).map((ad) => [ad.addonId, ad.quantity, ad.addonPrice]),
        }))
      ),
    [itemsWithSnapshots]
  );

  const billingQuery = useQuery({
    queryKey: [
      "billing-calculate",
      merchantId,
      selectedAddress?.id,
      billingCartKey,
      debouncedTipForBilling,
      debouncedDonationForBilling,
      appliedCouponCode,
      selectedPlatformOfferId,
      selectedMerchantOfferId,
      forceNoAutoOffer,
      subscriptionOptIn,
      deliveryType,
    ],
    queryFn: ({ signal }) =>
      billingService.calculateBill(
        {
          merchantId: merchantId!,
          addressId: String(selectedAddress!.id),
          items: itemsWithSnapshots,
          tipAmount: debouncedTipForBilling,
          donationAmount: debouncedDonationForBilling,
          couponCode: appliedCouponCode ?? undefined,
          selectedPlatformOfferId,
          selectedMerchantOfferId,
          forceNoAutoOffer,
          serviceType: "FOOD",
          subscriptionOptIn,
          deliveryType,
          ...(selectedAddress?.city != null && String(selectedAddress.city).trim() !== ""
            ? { cityName: String(selectedAddress.city).trim() }
            : {}),
          ...(merchant?.latitude != null &&
            merchant?.longitude != null && {
              pickupLat: Number(merchant.latitude),
              pickupLon: Number(merchant.longitude),
            }),
        },
        { signal }
      ),
    enabled: !!merchantId && !!selectedAddress && items.length > 0 && !merchantLoading,
    /** Keeps last bill on screen while cart/tip/donation refetch — avoids skeleton layout jump. */
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isNetworkError(error) && failureCount < 1,
  });

  // Live location from the location store — geocoded by Mapbox in the app, fresh every session.
  // Pass to backend so geo-bound platform offers resolve even when the saved address has
  // placeholder values (e.g. "—" stored when reverse-geocoding failed at save time).
  const livePincode = liveLocationAddress?.pincode ?? undefined;
  const liveState = liveLocationAddress?.state ?? undefined;
  const liveCity = liveLocationAddress?.city ?? undefined;

  const serverBill = billingQuery.data ?? null;

  const checkoutOffersQuery = useQuery({
    queryKey: [
      "billing-checkout-offers",
      merchantId,
      selectedAddress?.id,
      cartSubtotalForOffers,
      livePincode,
      liveState,
    ],
    queryFn: () =>
      billingService.getCheckoutOffers({
        merchantId: merchantId!,
        addressId: String(selectedAddress!.id),
        cartSubtotal: cartSubtotalForOffers,
        serviceType: "FOOD",
        pincode: livePincode,
        state: liveState,
        city: liveCity,
      }),
    enabled: !!merchantId && !!selectedAddress && items.length > 0 && !merchantLoading,
    staleTime: 60 * 1000,
  });

  /** Store→drop km from backend routing (authoritative for pricing); client route is for UI hint only. */
  const serverDistanceKm = serverBill?.distanceKm ?? null;
  /** Distance shown to user in checkout, always backend-computed. */
  const uiDistanceKm = serverDistanceKm ?? routeDistanceKm;
  /**
   * Serviceability comes from the server (respects store.delivery_radius_km + env fallback),
   * falling back to the platform default if the server hasn't been updated yet.
   */
  const isDeliveryOutOfRange =
    serverBill?.serviceable === false ||
    serverBill?.unserviceableReason === "out_of_range" ||
    (uiDistanceKm != null &&
      serverBill?.serviceable == null &&
      uiDistanceKm > (serverBill?.serviceRadiusKm ?? SERVICE_RADIUS_KM));
  const visibleDiscounts = useMemo(
    () => (serverBill?.discounts ?? []).filter((c) => !c.hidden),
    [serverBill?.discounts]
  );

  const primaryCheckoutDiscount = useMemo(() => {
    if (visibleDiscounts.length === 0) return null;
    return [...visibleDiscounts].sort((a, b) => b.amount - a.amount)[0];
  }, [visibleDiscounts]);

  const couponDiscountAmount = useMemo(() => {
    if (!appliedCouponCode || !primaryCheckoutDiscount) return 0;
    if (!discountMatchesCoupon(primaryCheckoutDiscount.label, appliedCouponCode, appliedCouponLabel)) {
      return 0;
    }
    return primaryCheckoutDiscount.amount;
  }, [primaryCheckoutDiscount, appliedCouponCode, appliedCouponLabel]);

  const checkoutSavingsTotal =
    serverBill && serverBill.discountTotal > 0.005 ? serverBill.discountTotal : 0;

  const featuredCoupon = useMemo(() => {
    const list = checkoutOffersQuery.data?.coupons?.filter((c) => c.code !== appliedCouponCode) ?? [];
    return list[0] ?? null;
  }, [checkoutOffersQuery.data?.coupons, appliedCouponCode]);

  const appliedPlatformOfferId = useMemo(() => {
    for (const d of visibleDiscounts) {
      const id = d.meta?.platformOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    return billingQuery.isFetching ? selectedPlatformOfferId : null;
  }, [visibleDiscounts, billingQuery.isFetching, selectedPlatformOfferId]);

  const appliedMerchantOfferId = useMemo(() => {
    for (const d of visibleDiscounts) {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    return billingQuery.isFetching ? selectedMerchantOfferId : null;
  }, [visibleDiscounts, billingQuery.isFetching, selectedMerchantOfferId]);

  const appliedDiscountRows = useMemo(
    () =>
      (primaryCheckoutDiscount ? [primaryCheckoutDiscount] : []).map((d) => ({
        label: d.label,
        amount: d.amount,
        platformOfferId:
          typeof d.meta?.platformOfferId === "number" ? (d.meta.platformOfferId as number) : null,
        merchantOfferId:
          typeof d.meta?.merchantOfferId === "number" ? (d.meta.merchantOfferId as number) : null,
      })),
    [primaryCheckoutDiscount]
  );

  /** Align coupon/offer picker with server bill — one promo on the order at a time. */
  useEffect(() => {
    if (!serverBill || billingQuery.isFetching) return;

    const discounts = (serverBill.discounts ?? []).filter((c) => !c.hidden);
    if (discounts.length === 0) {
      if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
      if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      return;
    }

    const primary = [...discounts].sort((a, b) => b.amount - a.amount)[0];
    const platformId =
      typeof primary.meta?.platformOfferId === "number" ? (primary.meta.platformOfferId as number) : null;
    const merchantId =
      typeof primary.meta?.merchantOfferId === "number" ? (primary.meta.merchantOfferId as number) : null;
    const couponCode =
      typeof primary.meta?.code === "string"
        ? String(primary.meta.code).trim()
        : primary.label.replace(/^coupon\s+/i, "").trim();

    if (platformId != null) {
      if (selectedPlatformOfferId !== platformId) setSelectedPlatformOfferId(platformId);
      if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      setForceNoAutoOffer(false);
      return;
    }

    if (merchantId != null) {
      if (selectedMerchantOfferId !== merchantId) setSelectedMerchantOfferId(merchantId);
      if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      setForceNoAutoOffer(false);
      return;
    }

    if (couponCode) {
      if (appliedCouponCode?.toUpperCase() !== couponCode.toUpperCase()) {
        setAppliedCouponCode(couponCode);
        setAppliedCouponLabel(couponCode);
      }
      if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
      if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
      setForceNoAutoOffer(false);
    }
  }, [
    serverBill,
    billingQuery.isFetching,
    billingQuery.dataUpdatedAt,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    appliedCouponCode,
  ]);

  const applyCouponCode = useCallback((code: string, label?: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setCouponApplyError(null);
    setSelectedPlatformOfferId(null);
    setSelectedMerchantOfferId(null);
    setForceNoAutoOffer(false);
    setAppliedCouponCode(trimmed);
    setAppliedCouponLabel(label ?? trimmed);
    setCouponCodeInput("");
    setCouponSheetVisible(false);
    setCouponCelebrationCode(trimmed);
    setCouponCelebrationVisible(true);
  }, []);

  const applyPlatformOfferById = useCallback((offerId: number, _name: string | null) => {
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setSelectedMerchantOfferId(null);
    setSelectedPlatformOfferId(offerId);
    setForceNoAutoOffer(false);
    setCouponSheetVisible(false);
    setCouponCelebrationCode("");
    setCouponCelebrationVisible(false);
  }, []);

  const applyMerchantOfferById = useCallback((offerId: number, couponCode?: string | null) => {
    setSelectedPlatformOfferId(null);
    setAppliedCouponLabel(null);
    setForceNoAutoOffer(false);
    setSelectedMerchantOfferId(offerId);
    if (couponCode?.trim()) {
      setAppliedCouponCode(couponCode.trim());
    } else {
      setAppliedCouponCode(null);
    }
    setCouponSheetVisible(false);
  }, []);

  const removeAllCheckoutOffers = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setSelectedPlatformOfferId(null);
    setSelectedMerchantOfferId(null);
    setForceNoAutoOffer(true);
    setCouponCelebrationVisible(false);
  }, []);

  const removeAppliedCoupon = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    if (!selectedPlatformOfferId && !selectedMerchantOfferId) setForceNoAutoOffer(true);
    setCouponCelebrationVisible(false);
  }, [selectedPlatformOfferId, selectedMerchantOfferId]);

  const removeAppliedPlatformOffer = useCallback(() => {
    setSelectedPlatformOfferId(null);
    if (!appliedCouponCode && !selectedMerchantOfferId) setForceNoAutoOffer(true);
    if (!appliedCouponCode) setCouponCelebrationVisible(false);
  }, [appliedCouponCode, selectedMerchantOfferId]);

  const removeAppliedMerchantOffer = useCallback(() => {
    setSelectedMerchantOfferId(null);
    if (!appliedCouponCode && !selectedPlatformOfferId) setForceNoAutoOffer(true);
  }, [appliedCouponCode, selectedPlatformOfferId]);

  const showItemTotalStrike = false;

  const deliveryFeeLabel = useMemo(() => {
    if (!serverBill || serverBill.deliveryFee <= 0) return "Delivery fee";
    const found = serverBill.charges.find(
      (c) =>
        c.kind === "charge" &&
        !c.hidden &&
        c.meta?.source !== "checkout_tipAmount" &&
        c.meta?.source !== "checkout_donationAmount" &&
        Math.abs(c.amount - serverBill.deliveryFee) < 0.05
    );
    const base = found?.label?.trim() || "Delivery fee";
    const km = uiDistanceKm;
    return km != null ? `${base} (${km.toFixed(1)} km)` : base;
  }, [serverBill, uiDistanceKm]);

  /** Estimated delivery-fee savings with GMitra Plus — shown on attached promo row. */
  const gmitraPlusDeliverySave = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return null;
    const fee = Math.max(0, serverBill.deliveryFeeQuotedInr ?? serverBill.deliveryFee ?? 0);
    return fee > 0.005 ? Math.round(fee) : null;
  }, [serverBill, deliveryType]);

  const showGmitraPlusAttachRow = deliveryType === "delivery";

  const gmitraPlusPromoCopy = useMemo(
    () => ({
      offersTitle: subscriptionOptIn
        ? `${GMITRA_PLUS_NAME} savings on this order`
        : gmitraPlusDeliverySave != null
          ? `Save ₹${gmitraPlusDeliverySave} with free delivery`
          : "Save extra with free delivery & offers",
      offersSub: subscriptionOptIn
        ? `${GMITRA_PLUS_NAME} benefits are applied to your bill.`
        : `Add ${GMITRA_PLUS_NAME} at ₹1 for 3 months`,
      attachTitle: subscriptionOptIn
        ? `${GMITRA_PLUS_NAME} applied on this order`
        : gmitraPlusDeliverySave != null
          ? `Save ₹${gmitraPlusDeliverySave} with free delivery`
          : "Save with free delivery & offers",
      attachSub: subscriptionOptIn
        ? "Member benefits are included in your bill."
        : `Add ${GMITRA_PLUS_NAME} at ₹1 for 3 months`,
    }),
    [subscriptionOptIn, gmitraPlusDeliverySave]
  );

  const gstAndOtherBreakdown = useMemo(() => {
    if (!serverBill) return null;
    const comp = serverBill.components;

    // Subscription rows the bill renders outside (label-matched from charges).
    // Mirror that filter here so the modal total reconciles to the bill row.
    const displayedMiscTotal = (serverBill.charges ?? [])
      .filter((c) => {
        const lbl = (c.label || "").toLowerCase();
        return (
          c.amount > 0.005 &&
          (lbl.includes("gmitra") ||
            lbl.includes("plus") ||
            lbl.includes("gold") ||
            lbl.includes("subscription"))
        );
      })
      .reduce((s, c) => s + c.amount, 0);

    const total = computeGstAndOtherChargesTotal(serverBill, displayedMiscTotal);

    // Show ONLY the tax portion for each bucket — the base amounts are already
    // displayed as their own line on the bill, so duplicating them inflates
    // perceived charges and confuses the user.
    const lines: { key: string; label: string; amount: number; sub?: string }[] = [];
    const push = (key: string, label: string, amount: number, sub?: string) => {
      const a = roundBillAmount(amount);
      if (a > 0.005) lines.push({ key, label, amount: a, sub });
    };
    push(
      "food_gst",
      "GST on food",
      comp.items.gst,
      "Tax on the food subtotal after discounts."
    );
    push("delivery_gst", "GST on delivery fee", comp.delivery.gst);
    push("packaging_gst", "GST on packaging", comp.packaging.gst);
    push(
      "platform_gst",
      "GST on platform fee",
      comp.platform.gst,
      "Tax applied on the platform fee per billing rules."
    );
    push("surge_gst", "GST on surge fee", comp.surge.gst);
    push("small_order_gst", "GST on small-order fee", comp.small_order.gst);
    push("convenience_gst", "GST on convenience fee", comp.convenience.gst);
    if (comp.subscription) {
      push(
        "subscription_gst",
        "GST on subscription",
        comp.subscription.gst,
        "Tax on subscription add-ons (e.g. GMitra Plus)."
      );
    }

    const accounted = roundBillAmount(lines.reduce((s, l) => s + l.amount, 0));
    const remainder = roundBillAmount(total - accounted);
    if (remainder > 0.005) {
      lines.push({
        key: "other",
        label: "Other taxes & charges",
        amount: remainder,
        sub: "Any taxes or store-specific charges not split into a row above.",
      });
    }
    if (lines.length === 0 && total > 0.005) {
      lines.push({
        key: "aggregate",
        label: "Taxes & charges",
        amount: total,
      });
    }
    return { total: roundBillAmount(total), lines };
  }, [serverBill]);
  const toPayAmount = serverBill?.finalAmount;
  /** Zomato-style strikethrough total when discounts apply (list ≈ payable + discounts). */
  const zomatoStrikethroughTotal = useMemo(() => {
    if (!serverBill || serverBill.discountTotal <= 0.005) return null;
    return serverBill.finalAmount + serverBill.discountTotal;
  }, [serverBill]);
  const hasValidPayment = paymentMethod !== "cod" && ["upi", "card", "wallet"].includes(paymentMethod);
  const canPlaceOrder =
    !isStoreClosed &&
    items.length > 0 &&
    !!selectedAddress &&
    !!merchantId &&
    hasValidPayment &&
    billingQuery.isSuccess &&
    serverBill != null &&
    !billingQuery.isPlaceholderData;

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
      deliveryType,
      ...(tipValue > 0 && { tipAmount: tipValue }),
      ...(donationValue > 0 && { donationAmount: donationValue }),
      ...(appliedCouponCode && { couponCode: appliedCouponCode }),
      ...(selectedPlatformOfferId != null && { selectedPlatformOfferId }),
      ...(selectedMerchantOfferId != null && { selectedMerchantOfferId }),
      ...(forceNoAutoOffer && { forceNoAutoOffer: true }),
      ...(subscriptionOptIn && { subscriptionOptIn: true }),
      checkoutMetadata: {
        leaveAtDoor,
        deliveryInstructionsList: buildDeliveryInstructionsList({
          note: deliveryPartnerNote,
          leaveAtDoor,
          leaveWithGuard: instrLeaveWithGuard,
          avoidCalling: instrAvoidCalling,
          dontRingBell: instrDontRingBell,
          petAtHome: instrPetAtHome,
        }),
        ...(deliveryPartnerNote.trim() ? { deliveryInstructions: deliveryPartnerNote.trim() } : {}),
        ...(instrLeaveWithGuard ? { leaveWithGuard: true } : {}),
        ...(instrAvoidCalling ? { avoidCalling: true } : {}),
        ...(instrDontRingBell ? { dontRingBell: true } : {}),
        ...(instrPetAtHome ? { petAtHome: true } : {}),
        ...(scheduledDeliverySummary ? { scheduledDeliverySummary } : {}),
        ...(restaurantNote.trim() ? { restaurantNote: restaurantNote.trim() } : {}),
        ...(skipCutlery ? { skipCutlery: true } : {}),
      },
      ...pickup,
    };
  }, [
    merchantId,
    itemsWithSnapshots,
    selectedAddress,
    paymentMethod,
    deliveryType,
    tipValue,
    donationValue,
    appliedCouponCode,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    forceNoAutoOffer,
    subscriptionOptIn,
    leaveAtDoor,
    deliveryPartnerNote,
    instrLeaveWithGuard,
    instrAvoidCalling,
    instrDontRingBell,
    instrPetAtHome,
    scheduledDeliverySummary,
    restaurantNote,
    skipCutlery,
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
      // See comment in finalizeOrder.onSuccess — same React batching pitfall.
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId: order.orderId,
          ...(merchantName ? { merchantName } : {}),
          etaMinutes: String(etaMins),
        },
      });
      setTimeout(() => {
        clearCart();
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      }, 0);
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const msg = err?.response?.data?.message ?? err?.message ?? "Could not place order.";
      router.replace({
        pathname: "/orders/payment-failure",
        params: { message: msg + ORDER_FAILED_REFUND_NOTE },
      });
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
      const recoveryPendingId = finalizeArgsRef.current?.pendingId ?? "";
      finalizeArgsRef.current = null;
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      // Order placed successfully — any future "Place order" tap should start a
      // brand-new checkout attempt, not reuse the same key.
      idempotencyKeyRef.current = null;
      const orderId = order?.orderId ?? (order as { order_id?: string })?.order_id;
      if (!orderId) {
        console.warn("[checkout] finalize success but no orderId in response", order);
        router.replace({
          pathname: "/orders/payment-confirming",
          params: {
            pendingId: recoveryPendingId,
            merchantName: merchantName ?? "",
            message: "Payment was received. We are confirming your order now.",
          },
        });
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
      // CRITICAL: navigate FIRST and defer clearCart into a separate
      // macrotask. React batches every state update inside this callback into
      // ONE render. If clearCart fires in the same batch, the checkout's
      // `items.length === 0` guard swaps the JSX to <CartEmptyView/> and
      // tears down the navigator subtree BEFORE expo-router's passive-effect
      // dispatch fires — resulting in "Do you have a route named 'orders'?"
      // and the user stuck on the previous screen. setTimeout pushes the
      // cart clear out of the current render batch.
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId,
          ...(merchantName ? { merchantName } : {}),
          etaMinutes: String(etaMins),
        },
      });
      setTimeout(() => {
        clearCart();
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      }, 0);
    },
    onError: (err: Error & { response?: { data?: { message?: string } }; code?: string }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const msg = err?.response?.data?.message ?? err?.message ?? "Order could not be confirmed.";
      const apiCode = (err as unknown as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const networkErr = isNetworkError(err);

      const shouldDeferToRecovery =
        finalizeArgsRef.current &&
        (networkErr ||
          err?.response == null ||
          apiCode === "PAYMENT_PENDING_CONFIRMATION" ||
          apiCode === "PAYMENT_NOT_CAPTURED" ||
          String(msg).toLowerCase().includes("contact support") ||
          String(msg).toLowerCase().includes("could not be created"));

      if (shouldDeferToRecovery && finalizeArgsRef.current) {
        router.replace({
          pathname: "/orders/payment-confirming",
          params: {
            pendingId: finalizeArgsRef.current.pendingId,
            merchantName: merchantName ?? "",
            message: "Payment received. We are confirming your order in the background.",
          },
        });
      } else {
        // Pass the error code through to the failure screen so it can pick the
        // right primary CTA ("Try a different payment method" vs "Retry payment"
        // vs "Check connection & retry").
        router.replace({
          pathname: "/orders/payment-failure",
          params: { message: msg + ORDER_FAILED_REFUND_NOTE, code: apiCode ?? "" },
        });
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
        // Stable Idempotency-Key: generated once per checkout attempt; reused on
        // retry. Cleared on success / cancel / address change. This guards the
        // backend /v1/orders/pending endpoint from producing duplicate pending
        // rows (and duplicate Razorpay orders) on double-tap or flaky retries.
        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        }
        const pending = await orderService.createPendingOrder({
          ...payload,
          idempotencyKey: idempotencyKeyRef.current,
        });
        const razorpayOrder = await paymentService.createRazorpayOrder({
          amountPaise: pending.amount,
          receipt: pending.pendingId,
          pendingId: pending.pendingId,
        });
        // Dummy / simulated payment: backend has PAYMENT_DUMMY_MODE=true or no
        // Razorpay creds in dev. We render an in-app Success/Failed sheet
        // instead of opening the Razorpay native SDK or browser fallback.
        const isDummyKey =
          razorpayOrder.keyId === "dummy_key" ||
          razorpayOrder.keyId === "dev_sim_key";
        if (isDummyKey) {
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
    // Let the user re-tap "Place order" with a fresh intent — most cancels mean
    // "I changed my mind" not "retry the same idempotent attempt".
    idempotencyKeyRef.current = null;
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

  const [simulatedSubmitting, setSimulatedSubmitting] = useState(false);

  const handleSimulatedPaymentComplete = useCallback(() => {
    if (!simulatedPaymentOrder || simulatedSubmitting) return;
    // Re-use the existing finalize pipeline — same signature, same backend
    // route. The backend recognises simulated_signature when PAYMENT_DUMMY_MODE
    // is on and short-circuits the gateway verification step. Every downstream
    // action (order row in orders_core, items, payments, ledger, push
    // notification to customer, realtime events to merchant + rider apps) runs
    // exactly as it would for a real Razorpay capture.
    setSimulatedSubmitting(true);
    handleRazorpaySuccess({
      razorpayOrderId: simulatedPaymentOrder.orderId,
      razorpayPaymentId: `sim_pay_${Date.now().toString(36)}`,
      razorpaySignature: "simulated_signature",
    });
    setSimulatedPaymentOrder(null);
    // setSimulatedSubmitting is reset when the finalize mutation settles below
  }, [simulatedPaymentOrder, simulatedSubmitting, handleRazorpaySuccess]);

  const handleSimulatedPaymentFail = useCallback(async () => {
    if (!simulatedPaymentOrder || simulatedSubmitting) return;
    setSimulatedSubmitting(true);
    const { pendingId, orderId } = simulatedPaymentOrder;
    setSimulatedPaymentOrder(null);
    try {
      if (pendingId) {
        await paymentService.markDummyPaymentFailed({
          pendingId,
          razorpayOrderId: orderId,
          reason: "User chose Simulate Failure in dummy payment sheet.",
        });
      }
    } catch (e) {
      // Best-effort: even if the failure call errors out, we still take the user
      // to the failure screen so they don't get stuck on checkout.
      console.warn("[checkout] dummy fail call errored", e);
    } finally {
      // Reset idempotency so the next "Place order" tap starts a fresh attempt.
      idempotencyKeyRef.current = null;
      setSimulatedSubmitting(false);
      router.replace({
        pathname: "/orders/payment-failure",
        params: {
          title: "Payment couldn't be completed",
          message: "Your simulated payment was declined. You can try a different payment method.",
          code: "DUMMY_USER_DECLINED",
        },
      });
    }
  }, [simulatedPaymentOrder, simulatedSubmitting, router]);

  const handleSimulatedPaymentCancel = useCallback(() => {
    if (simulatedSubmitting) return;
    setSimulatedPaymentOrder(null);
  }, [simulatedSubmitting]);

  // Reset the "submitting" flag once the overlay is closed AND the finalize
  // mutation has settled. Without this, a finalize error would leave the flag
  // stuck true and a second checkout attempt would render disabled buttons.
  useEffect(() => {
    if (
      simulatedSubmitting &&
      simulatedPaymentOrder == null &&
      !finalizeOrder.isPending
    ) {
      setSimulatedSubmitting(false);
    }
  }, [simulatedSubmitting, simulatedPaymentOrder, finalizeOrder.isPending]);

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
    const lineFor = (cartItem: (typeof items)[0], menuItem: import("@/services/merchant.service").MenuItem | undefined) => {
      const fromCart = cartItemSubline(cartItem);
      const fromMenu = menuItem?.description?.trim();
      return fromCart || fromMenu || null;
    };
    if (!merchant?.menu) {
      return items.map((i) => ({
        ...i,
        imageUrl: null as string | null,
        checkoutSubtext: cartItemSubline(i) || null,
      }));
    }
    return items.map((cartItem) => {
      const baseId = cartItemBaseId(cartItem.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant.menu, baseId);
      return {
        ...cartItem,
        imageUrl: menuItem?.imageUrl ?? null,
        checkoutSubtext: lineFor(cartItem, menuItem),
      };
    });
  }, [items, merchant?.menu]);

  // Canonical delivery range — uses the SAME formula as the restaurant list
  // and merchant detail header so the customer sees the same number on every
  // screen for a given store + address.
  const checkoutWeatherCoords = useMemo(() => {
    if (selectedAddress?.latitude != null && selectedAddress?.longitude != null) {
      return { lat: selectedAddress.latitude, lng: selectedAddress.longitude };
    }
    if (sessionCoords?.latitude != null && sessionCoords?.longitude != null) {
      return { lat: sessionCoords.latitude, lng: sessionCoords.longitude };
    }
    return null;
  }, [selectedAddress?.latitude, selectedAddress?.longitude, sessionCoords?.latitude, sessionCoords?.longitude]);
  const { data: checkoutWeather } = useLocationWeather({
    lat: checkoutWeatherCoords?.lat,
    lng: checkoutWeatherCoords?.lng,
    area: selectedAddress?.label ?? undefined,
    city: selectedAddress?.city ?? undefined,
  });
  const deliveryEta = useMemo(() => {
    const base = previewEtaRange({
      distanceKm: serverBill?.distanceKm ?? merchant?.distanceKm ?? null,
      prepMinutes: merchant?.avgPreparationTimeMinutes ?? null,
    });
    const adjusted = applyWeatherToEtaRange(
      base.etaMinMinutes,
      base.etaMaxMinutes,
      checkoutWeather?.etaDelayMinutes ?? 0
    );
    return formatEtaRange(adjusted);
  }, [
    merchant?.avgPreparationTimeMinutes,
    merchant?.distanceKm,
    serverBill?.distanceKm,
    checkoutWeather?.etaDelayMinutes,
  ]);
  const deliveryEtaImpactLabel = checkoutWeather?.etaImpactLabel ?? null;

  const scheduleDayTabs = useMemo(() => {
    const out: { id: string; line1: string; line2: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const line1 = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const line2 =
        i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "long" });
      const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ id, line1, line2 });
    }
    return out;
  }, []);

  const partnerInstructionSummary = useMemo(() => {
    const bits: string[] = [];
    if (leaveAtDoor) bits.push("Leave at door");
    if (instrLeaveWithGuard) bits.push("Leave with guard");
    if (instrAvoidCalling) bits.push("Avoid calling");
    if (instrDontRingBell) bits.push("Don't ring bell");
    if (instrPetAtHome) bits.push("Pet at home");
    const t = deliveryPartnerNote.trim();
    if (t) bits.push(t.length > 36 ? `${t.slice(0, 36)}…` : t);
    return bits.join(" · ");
  }, [
    leaveAtDoor,
    instrLeaveWithGuard,
    instrAvoidCalling,
    instrDontRingBell,
    instrPetAtHome,
    deliveryPartnerNote,
  ]);

  const editingItem = useMemo((): import("@/services/merchant.service").MenuItem | null => {
    if (!editingCartItemId) return null;
    const cartLine = items.find((i) => i.menuItemId === editingCartItemId);
    if (!cartLine) return null;
    const baseId = cartItemBaseId(cartLine.menuItemId);
    const menuItem = findMenuItemByCartBaseId(merchant?.menu, baseId);
    return {
      id: menuItem?.id ?? baseId,
      menuItemId: menuItem?.menuItemId ?? (/^\d+$/.test(baseId) ? Number(baseId) : undefined),
      name: cartLine.name,
      price: cartLine.price,
      isVeg: cartLine.isVeg,
      imageUrl: menuItem?.imageUrl ?? cartLine.imageUrl ?? undefined,
      description: menuItem?.description,
      hasVariants: menuItem?.hasVariants ?? !!cartLine.variantId,
      hasAddons: menuItem?.hasAddons ?? (cartLine.addons?.length ?? 0) > 0,
      hasCustomizations:
        menuItem?.hasCustomizations ??
        !!(cartLine.variantId || cartLine.variantName || (cartLine.addons?.length ?? 0) > 0),
    };
  }, [editingCartItemId, items, merchant?.menu]);

  const editingCartSelection = useMemo(() => {
    if (!editingCartItemId) return null;
    const cartLine = items.find((i) => i.menuItemId === editingCartItemId);
    if (!cartLine) return null;
    return {
      variantId: cartLine.variantId ?? null,
      variantName: cartLine.variantName ?? null,
      addons: (cartLine.addons ?? []).map((a) => ({ addonId: a.addonId })),
      quantity: cartLine.quantity,
    };
  }, [editingCartItemId, items]);

  const handleEditCartItem = useCallback(
    (cartLine: CartItem) => {
      if (!merchantId) return;
      const baseId = cartItemBaseId(cartLine.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant?.menu, baseId);
      if (isCartItemCustomizable(cartLine, menuItem)) {
        const refItem = menuItem ?? {
          id: baseId,
          menuItemId: /^\d+$/.test(baseId) ? Number(baseId) : undefined,
          name: cartLine.name,
          price: cartLine.price,
          isVeg: cartLine.isVeg,
          hasVariants: !!cartLine.variantId,
          hasAddons: (cartLine.addons?.length ?? 0) > 0,
          hasCustomizations: !!(cartLine.variantId || cartLine.variantName || (cartLine.addons?.length ?? 0) > 0),
        };
        void prefetchMenuItemFullConfig(
          queryClient,
          merchantId,
          resolveFullConfigItemId(refItem)
        );
        setPendingCustomizationItem(null);
        setEditingCartItemId(cartLine.menuItemId);
        return;
      }
      router.push({
        pathname: "/home/merchant/[id]",
        params: {
          id: merchantId,
          focusItemId: menuItem?.id ?? (menuItem?.menuItemId != null ? String(menuItem.menuItemId) : baseId),
        },
      });
    },
    [merchantId, merchant?.menu, router]
  );

  const paymentLabel = PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)?.displayName ?? "UPI";

  const completeYourMealItems = useMemo(() => {
    const raw = merchant?.menu ?? (merchant as { menu_items?: import("@/services/merchant.service").MenuItem[] } | undefined)?.menu_items;
    const menu = Array.isArray(raw) ? raw : [];
    const normalized = menu
      .filter((m) => m && (m.id ?? (m as { item_id?: string }).item_id) && (m.name ?? (m as { item_name?: string }).item_name))
      .map((m) => {
        const rawImage =
          (m as { imageUrl?: string }).imageUrl ??
          (m as { item_image_url?: string }).item_image_url ??
          (m as { displayImage?: string }).displayImage;
        const imageUrl =
          typeof rawImage === "string" && rawImage.trim()
            ? toAbsoluteImageUrl(rawImage.trim()) ?? rawImage.trim()
            : undefined;
        return {
          id: String((m as { id?: string }).id ?? (m as { item_id?: string }).item_id ?? ""),
          menuItemId: (m as { menuItemId?: number }).menuItemId,
          name: String((m as { name?: string }).name ?? (m as { item_name?: string }).item_name ?? ""),
          price: Number((m as { price?: number }).price ?? (m as { selling_price?: number }).selling_price ?? 0),
          isVeg: Boolean((m as { isVeg?: boolean }).isVeg ?? (m as { food_type?: string }).food_type?.toLowerCase().startsWith("veg")),
          imageUrl,
          isRecommended: (m as { isRecommended?: boolean }).isRecommended ?? (m as { is_recommended?: boolean }).is_recommended,
          isPopular: (m as { isPopular?: boolean }).isPopular ?? (m as { is_popular?: boolean }).is_popular,
          hasVariants: Boolean((m as { hasVariants?: boolean }).hasVariants ?? (m as { has_variants?: boolean }).has_variants),
          hasAddons: Boolean((m as { hasAddons?: boolean }).hasAddons ?? (m as { has_addons?: boolean }).has_addons),
          hasCustomizations: Boolean(
            (m as { hasCustomizations?: boolean }).hasCustomizations ??
              (m as { has_customizations?: boolean }).has_customizations
          ),
          description: (m as { description?: string }).description,
        };
      })
      .filter((m) => Boolean(m.imageUrl));
    const isAlreadyInCart = (m: (typeof normalized)[number]) => {
      const numId = m.menuItemId != null ? String(m.menuItemId) : null;
      return items.some(
        (i) =>
          i.menuItemId === m.id ||
          i.menuItemId?.startsWith?.(m.id + "_") ||
          (numId != null && (i.menuItemId === numId || i.menuItemId?.startsWith?.(numId + "_")))
      );
    };
    return [...normalized]
      .sort((a, b) => {
        const aScore = (a.isRecommended ? 2 : 0) + (a.isPopular ? 1 : 0);
        const bScore = (b.isRecommended ? 2 : 0) + (b.isPopular ? 1 : 0);
        return bScore - aScore;
      })
      .filter((m) => !isAlreadyInCart(m))
      .slice(0, 10);
  }, [merchant, items]);

  const handleUpsellItemPress = useCallback(
    (m: (typeof completeYourMealItems)[number]) => {
      if (!merchantId || !merchantName) return;
      const menuItem: MenuItem =
        findMenuItemByCartBaseId(merchant?.menu, m.id) ?? {
          id: m.id,
          menuItemId: m.menuItemId,
          name: m.name,
          price: m.price,
          isVeg: m.isVeg,
          imageUrl: m.imageUrl,
          description: m.description,
          hasVariants: m.hasVariants,
          hasAddons: m.hasAddons,
          hasCustomizations: m.hasCustomizations,
        };
      const needsCustomization = !!(menuItem.hasVariants || menuItem.hasAddons || menuItem.hasCustomizations);
      if (needsCustomization) {
        void prefetchMenuItemFullConfig(queryClient, merchantId, resolveFullConfigItemId(menuItem));
        setEditingCartItemId(null);
        setPendingCustomizationItem(menuItem);
        return;
      }
      useCartStore.getState().addItem(
        merchantId,
        merchantName,
        {
          menuItemId: String(m.menuItemId ?? m.id),
          name: m.name,
          price: m.price,
          isVeg: m.isVeg,
          imageUrl: m.imageUrl ?? null,
        },
        1,
        checkoutCartBannerUrl
      );
    },
    [merchantId, merchantName, merchant?.menu, queryClient, checkoutCartBannerUrl]
  );

  const customizationSheetItem = editingItem ?? pendingCustomizationItem;
  const customizationSheetVisible = !!editingCartItemId || !!pendingCustomizationItem;

  /**
   * Exactly ~3.5 cards visible: 3.5·chipW + 3·gaps ≤ track.
   * Floor chip width so the strip never clips early; gap slightly tight for small phones.
   */
  const upsellChipLayout = useMemo(() => {
    const scrollHPad = 12 * 2;
    const outerHPad = 14 * 2;
    const track = Math.max(220, windowWidth - scrollHPad - outerHPad);
    const gap = 8;
    const chipW = Math.max(64, Math.floor((track - 3 * gap) / 3.5));
    const radius = Math.max(8, Math.min(11, Math.round(chipW * 0.09)));
    return { chipW, gap, radius };
  }, [windowWidth]);

  // Note: early-return moved BELOW the next `useMemo` because React requires
  // a stable number of hook calls per render. Returning before a useMemo
  // changed the hook count when the cart emptied → "fewer hooks than expected".
  const cartIsEmpty = !merchantId || items.length === 0;

  const showBillSkeleton =
    merchantLoading || (addressesLoading && addresses.length === 0) || billingQuery.isLoading;

  const showDistanceBanner =
    isDeliveryOutOfRange ||
    (currentVsSelectedDistanceKm != null && currentVsSelectedDistanceKm > 1.5);

  if (cartIsEmpty) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.emptyText}>Cart is empty</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.ctaSecondary}>
          <Text style={styles.ctaSecondaryText}>Back to cart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Zomato-style header: back · merchant name (top, small) + eta + address (with chevron) · share icon */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP + 4 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerStoreName} numberOfLines={1}>
              {merchantName ?? storeFullAddress}
            </Text>
            <TouchableOpacity
              style={styles.headerAddressRow}
              onPress={openCheckoutAddressSheet}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Text style={styles.headerEtaText} numberOfLines={1}>
                <Text style={styles.headerEtaStrong}>{deliveryEta}</Text>
                <Text style={styles.headerEtaSecondary}>
                  {" "}to {selectedAddress?.label?.toLowerCase() ?? "address"}
                </Text>
                <Text style={styles.headerAddressSep}>{"  |  "}</Text>
                <Text style={styles.headerFullAddressInline} numberOfLines={1}>
                  {selectedAddress?.fullAddress ?? "Tap to choose address"}
                </Text>
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color="#888888"
                style={styles.headerChevron}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handleShareLocation}
            style={styles.headerShareIconBtn}
            hitSlop={10}
            accessibilityLabel="Share location"
          >
            <Ionicons name="share-social-outline" size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* One-line distance banner — Zomato style ("Selected address is N km away from your location") */}
      {showDistanceBanner && (
        <Animated.View entering={FadeIn.duration(ANIM_DURATION)} style={styles.distanceBannerOuter}>
          <View style={styles.distanceBannerNotch} />
          <View style={styles.distanceBannerCompact}>
            <Text style={styles.distanceBannerCompactText} numberOfLines={2}>
              Selected address is{" "}
              {(isDeliveryOutOfRange ? uiDistanceKm : currentVsSelectedDistanceKm)?.toFixed(
                (isDeliveryOutOfRange ? uiDistanceKm ?? 0 : currentVsSelectedDistanceKm ?? 0) >= 10 ? 0 : 1
              )}{" "}
              km away from your location
            </Text>
          </View>
        </Animated.View>
      )}

      {checkoutSavingsTotal > 0 ? (
        <View style={styles.checkoutSavingsTag}>
          <Text style={styles.checkoutSavingsTagText}>
            🥳 You saved ₹{checkoutSavingsTotal.toFixed(0)} on this order
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: showDistanceBanner ? 16 : 12,
            paddingBottom: insets.bottom + 128,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Order summary card — diet icon + lines + mint stepper, utility pills */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION)} style={styles.section}>
          <View style={styles.card}>
            <View style={styles.orderItemsPreview}>
              {itemsWithImage.map((item, index) => {
                const sub = item.checkoutSubtext;
                const lineTotal = item.price * item.quantity;
                const priceLabel =
                  Math.abs(lineTotal - Math.round(lineTotal)) < 0.01
                    ? `₹${Math.round(lineTotal)}`
                    : `₹${lineTotal.toFixed(2)}`;
                return (
                  <View
                    key={item.menuItemId}
                    style={[
                      styles.orderItemRow,
                      index < itemsWithImage.length - 1 && styles.orderItemRowSpacer,
                    ]}
                  >
                    <DietIndicator isVeg={item.isVeg} />
                    <View style={styles.orderItemMid}>
                      <Text style={styles.orderItemName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {sub ? (
                        <Text style={styles.orderItemSub} numberOfLines={2}>
                          {sub}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={styles.orderItemEditRow}
                        onPress={() => handleEditCartItem(item)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <Text style={styles.orderItemEditText}>Edit</Text>
                        <Ionicons name="caret-forward" size={12} color={CX.mint} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.orderItemRightCol}>
                      <View style={styles.orderItemStepperPill}>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.menuItemId, -1)}
                          style={styles.qtyBtnSmall}
                          hitSlop={6}
                          accessibilityLabel="Decrease quantity"
                        >
                          <Text style={styles.qtyGlyph}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyValueSmall}>{item.quantity}</Text>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.menuItemId, 1)}
                          style={styles.qtyBtnSmall}
                          hitSlop={6}
                          accessibilityLabel="Increase quantity"
                        >
                          <Text style={styles.qtyGlyph}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.orderItemLinePrice}>{priceLabel}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId } })}
              style={styles.addMoreRow}
              activeOpacity={0.75}
            >
              <Text style={styles.addMorePlus}>+</Text>
              <Text style={styles.addMoreText}>Add more items</Text>
            </TouchableOpacity>
            <View style={styles.checkoutUtilityPillRow}>
              <TouchableOpacity
                style={[
                  styles.checkoutUtilityPill,
                  restaurantNote.trim().length > 0 && styles.checkoutUtilityPillActive,
                ]}
                onPress={() => setRestaurantNoteModalVisible(true)}
                activeOpacity={0.8}
              >
                <View style={styles.checkoutUtilityPillInner}>
                  <Ionicons name="document-text-outline" size={13} color={CX.textSecondary} />
                  <Text style={styles.checkoutUtilityPillText} numberOfLines={1} ellipsizeMode="tail">
                    Add a note for the restaurant
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkoutUtilityPill, skipCutlery && styles.checkoutUtilityPillActive]}
                onPress={() => setSkipCutlery((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={styles.checkoutUtilityPillInner}>
                  <Ionicons name="restaurant-outline" size={13} color={CX.textSecondary} />
                  <Text style={styles.checkoutUtilityPillText} numberOfLines={1} ellipsizeMode="tail">
                    {"Don't send cutlery"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            {restaurantNote.trim().length > 0 ? (
              <RestaurantNoteMarquee
                note={`Note for restaurant: ${restaurantNote.trim()}`}
              />
            ) : null}
          </View>
        </Animated.View>

        {/* Complete your meal with — above coupons/subscription; ~3.5 cards visible; names wrap */}
        {completeYourMealItems.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(40)} style={styles.section}>
            <View style={styles.upsellOuterCard}>
              <View style={styles.upsellSectionHeader}>
                <View style={styles.upsellSectionIcon}>
                  <Ionicons name="grid-outline" size={14} color="#9CA3AF" />
                  <View style={styles.upsellSectionIconPlus}>
                    <Ionicons name="add" size={8} color="#9CA3AF" />
                  </View>
                </View>
                <Text style={styles.upsellSectionTitle}>Complete your meal with</Text>
              </View>
              <View style={styles.upsellScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.upsellScrollContent,
                    { gap: upsellChipLayout.gap, paddingRight: upsellChipLayout.gap },
                  ]}
                  style={styles.upsellScrollInner}
                >
                  {completeYourMealItems.map((m) => {
                    const { chipW, radius } = upsellChipLayout;
                    const imgRadius = { borderTopLeftRadius: radius, borderTopRightRadius: radius };
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => handleUpsellItemPress(m)}
                        style={({ pressed }) => [
                          styles.upsellCard,
                          {
                            width: chipW,
                            borderRadius: radius,
                          },
                          pressed && styles.upsellCardPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.upsellImageWrap,
                            { width: chipW, height: chipW },
                            imgRadius,
                          ]}
                        >
                          {m.imageUrl ? (
                            <Image source={{ uri: m.imageUrl }} style={styles.upsellImage} />
                          ) : (
                            <View style={[styles.upsellImagePlaceholder, !m.isVeg && styles.nonVegBg, imgRadius]}>
                              <Ionicons name="restaurant" size={20} color={GatiMitraColors.textSecondary} />
                            </View>
                          )}
                          <View style={[styles.upsellVegBadge, !m.isVeg && styles.upsellNonVegBadge]}>
                            {m.isVeg ? (
                              <View style={styles.upsellVegDot} />
                            ) : (
                              <View style={styles.upsellNonVegDot} />
                            )}
                          </View>
                          <View style={styles.upsellAddBtnOnImage} pointerEvents="none">
                            <Ionicons name="add" size={18} color={CX.mint} />
                          </View>
                        </View>
                        <Text style={[styles.upsellName, { width: chipW - 16 }]}>{m.name}</Text>
                        <Text style={styles.upsellPrice}>₹{m.price}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Offers — blue banner, GMitra plus, applied savings, coupons */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(50)} style={styles.section}>
          <View style={styles.offersCard}>
            <LinearGradient
              colors={["#C8DCF2", "#EAF4FC", "#F5FAFF"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.offersCardBanner}
            >
              <Text style={styles.offersCardBannerTitle}>
                Save extra by applying coupons on every order
              </Text>
              <View style={styles.offersCardBannerIconGlow}>
                <View style={styles.offersCardBannerIconOuter}>
                  <View style={styles.offersCardBannerIconBox}>
                    <Text style={styles.offersCardBannerPct}>%</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.offersDottedSep} />

            <View style={styles.offersBodyRow}>
              <MaterialCommunityIcons name="crown-outline" size={22} color="#CA8A04" style={styles.offersSubIcon} />
              <View style={styles.offersBodyTextCol}>
                <Text style={styles.offersSubLineBold}>{gmitraPlusPromoCopy.offersTitle}</Text>
                <Text style={styles.offersSubLineMuted} numberOfLines={2}>
                  {gmitraPlusPromoCopy.offersSub}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  hitSlop={8}
                  onPress={() => setGmitraPlusSheetVisible(true)}
                >
                  <Text style={styles.offersLearnMore}>Learn more {'>'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.offersApplyOutline, subscriptionOptIn && styles.offersApplyFilled]}
                onPress={() => setSubscriptionOptIn(!subscriptionOptIn)}
                activeOpacity={0.85}
              >
                <Text style={[styles.offersApplyOutlineText, subscriptionOptIn && styles.offersApplyFilledText]}>
                  {subscriptionOptIn ? "ADDED" : "APPLY"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.offersDottedSep} />

            <View style={styles.offersAppliedRow}>
              {primaryCheckoutDiscount || appliedCouponCode ? (
                <View style={styles.offersGreenTick}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : (
                <View style={styles.offersCouponIconCircle}>
                  <Text style={styles.offersCouponIconPct}>%</Text>
                </View>
              )}
              <View style={styles.offersBodyTextCol}>
                <Text style={styles.offersAppliedHeadline} numberOfLines={2}>
                  {primaryCheckoutDiscount
                    ? primaryCheckoutDiscount.amount > 0.005
                      ? `You saved ₹${primaryCheckoutDiscount.amount.toFixed(0)} with ${primaryCheckoutDiscount.label}`
                      : `${primaryCheckoutDiscount.label} applied!`
                    : appliedCouponCode
                      ? `${appliedCouponLabel ?? appliedCouponCode} applied`
                      : featuredCoupon
                        ? featuredCoupon.description ||
                          `Save more with '${featuredCoupon.code}'`
                        : "Apply a coupon to save on this order"}
                </Text>
                <TouchableOpacity onPress={() => setCouponSheetVisible(true)} activeOpacity={0.7} hitSlop={6}>
                  <Text style={styles.offersLearnMore}>View all coupons ›</Text>
                </TouchableOpacity>
              </View>
              {primaryCheckoutDiscount || appliedCouponCode || appliedPlatformOfferId || appliedMerchantOfferId ? (
                <TouchableOpacity onPress={removeAllCheckoutOffers} hitSlop={8} activeOpacity={0.7}>
                  <Text style={styles.offersRemoveRed}>Remove</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.offersApplyOutline}
                  onPress={() => {
                    if (featuredCoupon) setCouponCodeInput(featuredCoupon.code);
                    setCouponSheetVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.offersApplyOutlineText}>APPLY</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Delivery + bill — Zomato-style single card: savings banner, dashed rules, ETA, address, bill, GMitra bubble */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(60)} style={styles.section}>
          <View style={styles.zomatoCheckoutCard}>
            <View style={styles.zomatoCardPad}>
              <View style={styles.deliveryEtaRow}>
                <Ionicons name="timer-outline" size={20} color={GatiMitraColors.textSecondary} />
                <View style={styles.zomatoEtaTextCol}>
                  <Text style={styles.zomatoEtaLine}>
                    Delivery in <Text style={styles.zomatoEtaBold}>{deliveryEta}</Text>
                  </Text>
                  {deliveryEtaImpactLabel ? (
                    <Text style={styles.weatherEtaImpact}>{deliveryEtaImpactLabel}</Text>
                  ) : null}
                  {scheduledDeliverySummary ? (
                    <Text style={styles.scheduledSummaryLine} numberOfLines={2}>
                      {scheduledDeliverySummary}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.zomatoScheduleRow}>
                <Text style={styles.zomatoScheduleLine}>
                  Want this later?{" "}
                </Text>
                <Pressable
                  onPress={() => setScheduleSheetVisible(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Schedule delivery"
                >
                  <Text style={styles.zomatoScheduleLink}>Schedule it</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.zomatoCardDash} />

            <View style={styles.zomatoAddrBlock}>
              <View style={styles.zomatoAddrRowInner}>
                <Ionicons name="location-outline" size={20} color={GatiMitraColors.textSecondary} />
                <Pressable
                  style={({ pressed }) => [
                    styles.deliveryAddrTextWrap,
                    pressed && styles.deliveryAddrRowPressed,
                  ]}
                  onPress={openCheckoutAddressSheet}
                  android_ripple={{ color: "rgba(45, 181, 160, 0.08)" }}
                >
                  <View style={styles.deliveryAddrTitleRow}>
                    <View style={styles.deliveryAddrTitleTextWrap}>
                      <Text style={styles.deliveryAddrLabel} numberOfLines={1}>
                        <Text style={styles.deliveryAddrPre}>Delivery at </Text>
                        <Text style={styles.deliveryAddrName}>
                          {selectedAddress?.label ?? currentLocationDisplay?.label ?? "—"}
                        </Text>
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.deliveryAddrSub} numberOfLines={2} ellipsizeMode="tail">
                    {selectedAddress
                      ? selectedAddress.fullAddress
                      : currentLocationDisplay?.fullAddress ?? "Tap to choose delivery address"}
                  </Text>
                  {leaveAtDoor ? (
                    <View style={[styles.leaveAtDoorChip, styles.leaveAtDoorChipBelowAddr]}>
                      <Ionicons name="checkmark-circle" size={14} color={GatiMitraColors.emerald} />
                      <Text style={styles.leaveAtDoorChipText}>Leave at door</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  style={styles.zomatoAddrChevronHit}
                  onPress={openCheckoutAddressSheet}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.zomatoCardDash} />

            <TouchableOpacity
              style={[styles.zomatoCardPad, styles.instructionPartnerRow]}
              onPress={() => setInstructionSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="chatbox-ellipses-outline" size={20} color={GatiMitraColors.textSecondary} />
              <View style={styles.instructionPartnerTextCol}>
                <Text style={styles.instructionPartnerTitle}>Add instructions for delivery partner</Text>
                {partnerInstructionSummary ? (
                  <Text style={styles.instructionPartnerSummary} numberOfLines={2}>
                    {partnerInstructionSummary}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>

            {selectedAddress ? (
              <>
                <View style={styles.zomatoCardDash} />
                <TouchableOpacity
                  style={[styles.zomatoCardPad, styles.checkoutReceiverRow]}
                  onPress={openReceiverSheet}
                  activeOpacity={0.75}
                  disabled={!selectedAddress}
                >
                  <Ionicons name="call-outline" size={20} color={GatiMitraColors.textSecondary} />
                  <Text style={styles.checkoutReceiverText} numberOfLines={1}>
                    {checkoutReceiverSummary}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
              </>
            ) : null}

            <View style={styles.zomatoCardDash} />

            <TouchableOpacity
              style={[styles.zomatoBillHeader, showGmitraPlusAttachRow && styles.zomatoBillHeaderWithAttach]}
              onPress={() => setBillSummarySheetVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={22} color={GatiMitraColors.textSecondary} />
              <View style={styles.zomatoBillHeaderMid}>
                <Text style={styles.zomatoBillTitle}>Total Bill</Text>
                <Text style={styles.zomatoBillSub}>Incl. taxes and charges</Text>
              </View>
              {!showBillSkeleton ? (
                <View style={styles.zomatoBillHeaderRight}>
                  <View style={styles.zomatoBillPriceCluster}>
                    {zomatoStrikethroughTotal != null ? (
                      <Text style={styles.zomatoBillStrike}>
                        ₹{zomatoStrikethroughTotal.toFixed(2)}
                      </Text>
                    ) : null}
                    <Text style={styles.zomatoBillFinal}>
                      {toPayAmount != null ? `₹${toPayAmount.toFixed(2)}` : "—"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={GatiMitraColors.textSecondary} />
                </View>
              ) : (
                <View style={styles.billSummaryHeaderRight}>
                  <GMSkeleton style={{ width: 72, height: 18, borderRadius: 4 }} />
                </View>
              )}
            </TouchableOpacity>

            {showBillSkeleton ? (
              <View style={[styles.billSkeletonWrap, styles.zomatoCardPadH]}>
                <GMSkeleton style={styles.billSkeletonLine} />
                <GMSkeleton style={styles.billSkeletonLastLine} />
              </View>
            ) : null}

            {showGmitraPlusAttachRow ? (
              <View style={styles.zomatoGoldAttach}>
                <View style={styles.zomatoGoldPointerShell}>
                  <View style={styles.zomatoGoldPointerBorder} />
                  <View style={styles.zomatoGoldPointerFill} />
                </View>
                <View style={styles.zomatoGoldCrownRing}>
                  <MaterialCommunityIcons name="crown" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.zomatoGoldTextCol}>
                  <Text style={styles.zomatoGoldTitle}>{gmitraPlusPromoCopy.attachTitle}</Text>
                  <Text style={styles.zomatoGoldSub} numberOfLines={2}>
                    {gmitraPlusPromoCopy.attachSub}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.zomatoGoldAddBtn,
                    subscriptionOptIn && styles.zomatoGoldAddBtnApplied,
                  ]}
                  onPress={() => setSubscriptionOptIn(!subscriptionOptIn)}
                  onLongPress={() => setGmitraPlusSheetVisible(true)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.zomatoGoldAddBtnText,
                      subscriptionOptIn && styles.zomatoGoldAddBtnTextApplied,
                    ]}
                  >
                    {subscriptionOptIn ? "Added" : "Add Plus"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Feeding India — reference-style hero + white donation row */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(100)} style={styles.sectionContrib}>
          <View style={styles.feedingIndiaCard}>
            <LinearGradient
              colors={["#DBEAFE", "#E0F2FE", "#BFDBFE"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.feedingIndiaHero}
            >
              <View style={styles.feedingIndiaHeroDecor} pointerEvents="none">
                <View style={styles.feedingWaveBlob} />
                <View style={styles.feedingWaveBlobB} />
              </View>
              <View style={styles.feedingIndiaHeroTextWrap}>
                <View style={styles.feedingIndiaTitleRow}>
                  <View style={styles.feedingIndiaTitleTextBlock}>
                    <Text style={styles.feedingIndiaHeadline} numberOfLines={2}>
                      <Text style={styles.feedingIndiaJoin}>Join us at </Text>
                      <Text style={styles.feedingIndiaBrand}>feeding</Text>
                      <Text style={styles.feedingIndiaHeart}> ❤️</Text>
                      <Text style={styles.feedingIndiaBrand}> india</Text>
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setCommunityInitiativeSheetVisible(true)}
                    hitSlop={10}
                    style={styles.feedingIndiaInfoHit}
                  >
                    <Ionicons name="information-circle-outline" size={18} color="#1E3A8A" />
                  </Pressable>
                </View>
                <Text style={styles.feedingIndiaTagline}>
                  Making everyday orders more meaningful.
                </Text>
              </View>
              <View style={styles.feedingIndiaArt}>
                <Image
                  source={FEEDING_INDIA_ART}
                  style={styles.feedingIndiaArtImage}
                  resizeMode="contain"
                  accessibilityLabel="Feeding India"
                />
              </View>
            </LinearGradient>

            <View style={styles.feedingIndiaWhite}>
              <View style={styles.feedingIndiaDonateLineRow}>
                <Text style={styles.feedingIndiaDonateLine}>
                  Donate with <Text style={styles.feedingIndiaDonateBold}>every order</Text>
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#111827" />
              </View>
              <View style={styles.feedingInrRowOuter}>
                <View style={styles.feedingInrPresetsGroup}>
                  {([5, 10, 15] as const).map((amt) => {
                    const isActive = donationEnabled && donationPreset === amt;
                    return (
                      <Pressable
                        key={amt}
                        onPress={() => {
                          if (isActive) {
                            clearCheckoutDonation();
                          } else {
                            setDonationEnabled(true);
                            setDonationPreset(amt);
                            setDonationAmount(String(amt));
                          }
                        }}
                        style={({ pressed }) => [
                          styles.feedingInrPresetBox,
                          isActive && styles.feedingInrPresetBoxActive,
                          pressed && styles.tipChipPressed,
                        ]}
                      >
                        <Text style={[styles.feedingInrPresetAmt, isActive && styles.feedingInrAmtActive]}>
                          ₹{amt}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.feedingInrCustomSlot}>
                  {donationEnabled && donationPreset === "custom" ? (
                    <View style={[styles.feedingInrCustomCompact, styles.feedingInrCustomCompactActive]}>
                      <View style={styles.feedingInrCustomInnerCompact}>
                        <Text style={[styles.feedingInrRupeeCompact, styles.feedingInrAmtActive]}>₹</Text>
                        <View style={styles.feedingInrInputUnderlineWrapCompact}>
                          <TextInput
                            style={styles.feedingInrCustomInputCompact}
                            placeholder="0"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="numeric"
                            value={donationAmount}
                            onChangeText={setDonationAmount}
                            selectTextOnFocus
                          />
                          <View style={styles.feedingInrCustomUnderline} />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setDonationEnabled(true);
                        setDonationPreset("custom");
                        setDonationAmount("");
                      }}
                      style={({ pressed }) => [styles.feedingInrCustomTrigger, pressed && styles.tipChipPressed]}
                    >
                      <Text style={styles.feedingInrPresetAmt}>Custom</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              {donationEnabled && donationValue > 0 ? (
                <View style={styles.feedingDonationConfirmRow}>
                  <Ionicons name="checkmark-circle" size={18} color={CX.mintDark} />
                  <Text style={styles.feedingDonationConfirmText} numberOfLines={1}>
                    Amount added to your order
                  </Text>
                  <TouchableOpacity onPress={clearCheckoutDonation} hitSlop={10} activeOpacity={0.7}>
                    <Text style={styles.feedingDonationClearText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Delivery partner tip — compact reference card */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(110)} style={styles.sectionContrib}>
          <View style={styles.tipSliderCard}>
            <View style={styles.tipHeaderRow}>
              <View style={styles.tipHeaderTextCol}>
                <View style={styles.tipTitleRow}>
                  <MaterialCommunityIcons name="hand-heart" size={15} color={CX.mintDark} />
                  <Text style={styles.tipSliderHeading}>
                    {tipValue > 0 ? "Added a tip" : "Add a tip"}
                  </Text>
                </View>
                <Text style={styles.tipSliderLead}>Drag for up to ₹60 on the slider.</Text>
                <Text style={styles.tipSliderLeadBold}>
                  Your partner keeps <Text style={styles.tipSliderLead100}>100%</Text> of what you add.
                </Text>
              </View>
              <View style={styles.tipHeroArt} pointerEvents="none">
                <Ionicons name="sparkles" size={11} color="#111827" style={styles.tipSparkleA} />
                <Ionicons name="sparkles" size={9} color="#111827" style={styles.tipSparkleB} />
                <View style={styles.tipHeroArtCircle}>
                  <MaterialCommunityIcons name="wallet-outline" size={18} color={CX.mintDark} />
                  <View style={styles.tipHeroHeartBadge}>
                    <Ionicons name="heart" size={11} color="#F97316" />
                  </View>
                </View>
              </View>
            </View>

            {tipValue > 0 ? (
              <View style={styles.tipSelectedRow}>
                <Text style={styles.tipSelectedLabel}>Tip</Text>
                <View style={styles.tipSelectedBadge}>
                  <Text style={styles.tipSelectedValue}>₹{tipSliderValue}</Text>
                </View>
              </View>
            ) : null}

            <View
              style={styles.tipSliderBlock}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                tipSliderTrackWRef.current = w;
                setTipSliderBlockW(w);
              }}
            >
              <Pressable
                style={styles.tipSliderTrackMeasure}
                onPress={(e) => setTipFromLocalX(e.nativeEvent.locationX)}
              >
                <View style={styles.tipSliderTrackPressable} {...tipTrackPanResponder.panHandlers}>
                  <View style={[styles.tipSliderTrackBg, { marginHorizontal: TIP_TRACK_PAD }]}>
                    <View
                      style={[
                        styles.tipSliderFill,
                        { width: `${(tipValue / TIP_SLIDER_MAX) * 100}%` },
                      ]}
                    />
                  </View>
                  <View
                    pointerEvents="none"
                    style={[styles.tipSliderThumb, { left: tipTrackGeometry.thumbLeft }]}
                  />
                </View>
              </Pressable>
              <View style={styles.tipSliderLabelsRow}>
                {TIP_SLIDER_LABELS.map((v, i) => {
                  const atStop = tipNearestLabel === v;
                  const w = tipSliderBlockW;
                  const half = TIP_LABEL_HALF_WIDTH[i];
                  const inner = Math.max(0, w - 2 * TIP_TRACK_PAD);
                  const cx = w > 0 ? TIP_TRACK_PAD + (i / 3) * inner : 0;
                  let leftPx = w > 0 ? cx - half : 0;
                  if (i === 0) leftPx = Math.max(0, leftPx);
                  if (i === 3 && w > 0) leftPx = Math.min(w - half * 2, leftPx);
                  return (
                    <Pressable
                      key={`tip-lbl-${v}`}
                      onPress={() => {
                        setTipSliderValue(v);
                      }}
                      hitSlop={8}
                      style={[styles.tipSliderLabelHitAbs, { left: leftPx }]}
                    >
                      <Text style={[styles.tipSliderLabel, atStop && styles.tipSliderLabelActive]}>₹{v}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
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

      <CouponApplyCelebration
        visible={couponCelebrationVisible}
        couponCode={couponCelebrationCode}
        savedAmount={couponDiscountAmount}
        onDismiss={() => setCouponCelebrationVisible(false)}
      />

      <CheckoutOffersSheet
        visible={couponSheetVisible}
        onClose={() => setCouponSheetVisible(false)}
        bottomInset={insets.bottom}
        loading={checkoutOffersQuery.isLoading}
        error={checkoutOffersQuery.isError}
        data={checkoutOffersQuery.data}
        cartSubtotal={cartSubtotalForOffers}
        couponInput={couponCodeInput}
        onCouponInputChange={(t) => {
          setCouponCodeInput(t);
          setCouponApplyError(null);
        }}
        couponError={couponApplyError}
        appliedCouponCode={appliedCouponCode}
        appliedPlatformOfferId={appliedPlatformOfferId}
        appliedMerchantOfferId={appliedMerchantOfferId}
        appliedDiscounts={appliedDiscountRows}
        onApplyCouponCode={(code, description) => {
          const trimmed = (code || couponCodeInput).trim();
          if (!trimmed) {
            setCouponApplyError("Enter a coupon code");
            return;
          }
          applyCouponCode(trimmed, description);
        }}
        onApplyPlatformOffer={applyPlatformOfferById}
        onApplyMerchantOffer={applyMerchantOfferById}
        onRemoveCoupon={removeAppliedCoupon}
        onRemovePlatformOffer={removeAppliedPlatformOffer}
        onRemoveMerchantOffer={removeAppliedMerchantOffer}
        onRemoveAllOffers={removeAllCheckoutOffers}
      />

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

      {/* Footer: fixed-width delivery / takeaway toggle + Place Order CTA (width = screen − padding − gap − toggle; same corner radius as toggle shell). */}
      <View style={[styles.fixedBottom, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.footerRow}>
          <View style={styles.deliveryTypeToggle}>
            <TouchableOpacity
              style={[
                styles.deliveryTypeSeg,
                deliveryType === "delivery" && styles.deliveryTypeSegActive,
              ]}
              onPress={() => setDeliveryType("delivery")}
              activeOpacity={0.88}
            >
              <MaterialCommunityIcons
                name="motorbike"
                size={20}
                color={deliveryType === "delivery" ? "#FFFFFF" : "#111111"}
              />
              <Text
                style={[
                  styles.deliveryTypeSegText,
                  deliveryType === "delivery" && styles.deliveryTypeSegTextActive,
                ]}
              >
                Delivery
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.deliveryTypeSeg,
                deliveryType === "self_pickup" && styles.deliveryTypeSegActive,
              ]}
              onPress={() => setDeliveryType("self_pickup")}
              activeOpacity={0.88}
            >
              <MaterialCommunityIcons
                name="shopping-outline"
                size={20}
                color={deliveryType === "self_pickup" ? "#FFFFFF" : "#111111"}
              />
              <Text
                style={[
                  styles.deliveryTypeSegText,
                  deliveryType === "self_pickup" && styles.deliveryTypeSegTextActive,
                ]}
              >
                Takeaway
              </Text>
            </TouchableOpacity>
          </View>
          {isStoreClosed ? (
            <View style={[styles.footerCtaSlotDisabled, { width: checkoutFooterCtaWidth }]}>
              <Text style={styles.ctaDisabledText}>Store closed</Text>
            </View>
          ) : items.length === 0 ? (
            <View style={[styles.footerCtaSlotDisabled, { width: checkoutFooterCtaWidth }]}>
              <Text style={styles.ctaDisabledText}>Add items</Text>
            </View>
          ) : !canPlaceOrder ? (
            <View style={[styles.footerCtaSlotDisabled, { width: checkoutFooterCtaWidth }]}>
              <Text style={styles.ctaDisabledLabel}>
                Place Order
                {toPayAmount != null ? ` • ₹${toPayAmount.toFixed(2)}` : ""}
              </Text>
              <Text style={styles.ctaDisabledHint}>
                {!selectedAddress
                  ? "Check your address before proceeding"
                  : billingQuery.isError
                      ? "Could not load bill — retry"
                      : billingQuery.isLoading
                        ? "Loading bill…"
                        : billingQuery.isPlaceholderData && billingQuery.isFetching
                          ? "Updating bill…"
                          : !serverBill
                            ? "Waiting for bill"
                            : "Select payment"}
              </Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.footerCtaSlot,
                { width: checkoutFooterCtaWidth },
                pressed && styles.ctaTouchPressed,
              ]}
              onPress={handlePlaceOrderPress}
              disabled={placeOrder.isPending || finalizeOrder.isPending || razorpayCreating}
            >
              <LinearGradient
                colors={[CX.mintGradient[0], CX.mintGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                {placeOrder.isPending || finalizeOrder.isPending || razorpayCreating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <View style={styles.ctaLeftPart}>
                      <Text style={styles.ctaTotalAmount} numberOfLines={1}>
                        {toPayAmount != null ? `₹${toPayAmount.toFixed(2)}` : "—"}
                      </Text>
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

      {customizationSheetItem && merchantId && (
        <ItemCustomizationSheet
          visible={customizationSheetVisible}
          onClose={() => {
            setEditingCartItemId(null);
            setPendingCustomizationItem(null);
          }}
          storeId={merchantId}
          item={customizationSheetItem}
          merchantName={merchantName ?? ""}
          isStoreClosed={isStoreClosed}
          storeMenu={merchant?.menu}
          initialSelection={editingCartItemId ? editingCartSelection : null}
          onAdd={(params) => {
            if (editingCartItemId) {
              updateQuantity(editingCartItemId, -999);
            }
            useCartStore.getState().addItem(merchantId!, merchantName!, {
              menuItemId: params.menuItemId,
              name: params.name,
              price: params.price,
              isVeg: params.isVeg,
              basePrice: params.basePrice,
              variantId: params.variantId,
              variantName: params.variantName,
              addons: params.addons,
              imageUrl: params.imageUrl ?? customizationSheetItem?.imageUrl ?? null,
            }, params.quantity, checkoutCartBannerUrl);
            setEditingCartItemId(null);
            setPendingCustomizationItem(null);
          }}
        />
      )}

      <Modal
        visible={restaurantNoteModalVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setRestaurantNoteModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.noteSheetRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable
            style={styles.noteSheetDim}
            onPress={() => setRestaurantNoteModalVisible(false)}
          />
          <View style={[styles.noteSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.noteSheetTitleRow}>
              <Text style={styles.noteSheetTitle}>Add a note for the restaurant</Text>
              <TouchableOpacity
                onPress={() => setRestaurantNoteModalVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.noteSheetInput}
              value={restaurantNote}
              onChangeText={setRestaurantNote}
              placeholder="e.g. Note for the entire order"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={280}
              textAlignVertical="top"
            />
            <Text style={styles.noteSheetDisclaimer}>
              {`The restaurant will try its best to follow your requests. However, refunds or cancellations in this regard won't be possible.`}
            </Text>
            <View style={styles.noteSheetFooter}>
              <TouchableOpacity
                onPress={() => setRestaurantNote("")}
                style={styles.noteSheetClearBtn}
                hitSlop={8}
              >
                <Text style={styles.noteSheetClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteSheetSaveBtn}
                onPress={() => setRestaurantNoteModalVisible(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.noteSheetSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={scheduleSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setScheduleSheetVisible(false)}
      >
        <View style={styles.noteSheetRoot}>
          <Pressable style={styles.noteSheetDim} onPress={() => setScheduleSheetVisible(false)} />
          <View style={[styles.noteSheetCard, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]}>
            <Text style={styles.scheduleSheetTitle}>Select your delivery time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.scheduleTabRow}
              keyboardShouldPersistTaps="handled"
            >
              {scheduleDayTabs.map((tab, idx) => {
                const on = idx === scheduleDayIndex;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setScheduleDayIndex(idx)}
                    style={styles.scheduleTabHit}
                    hitSlop={4}
                  >
                    <Text style={[styles.scheduleTabLine1, on && styles.scheduleTabLine1On]}>{tab.line1}</Text>
                    <Text style={[styles.scheduleTabLine2, on && styles.scheduleTabLine2On]}>{tab.line2}</Text>
                    <View style={[styles.scheduleTabUnderline, on ? styles.scheduleTabUnderlineOn : styles.scheduleTabUnderlineOff]} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView
              style={styles.scheduleSlotScroll}
              contentContainerStyle={styles.scheduleSlotScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {SCHEDULE_SLOT_OPTIONS.map((slot) => {
                const picked = scheduleSlotDraft === slot;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => setScheduleSlotDraft(slot)}
                    style={[styles.scheduleSlotRow, picked && styles.scheduleSlotRowOn]}
                  >
                    <Text style={[styles.scheduleSlotText, picked && styles.scheduleSlotTextOn]}>{slot}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => {
                const tab = scheduleDayTabs[scheduleDayIndex];
                const slot = scheduleSlotDraft ?? SCHEDULE_SLOT_OPTIONS[0];
                if (tab && slot) {
                  setScheduledDeliverySummary(`${tab.line1} (${tab.line2}), ${slot}`);
                }
                setScheduleSheetVisible(false);
              }}
            >
              <LinearGradient
                colors={[CX.mintGradient[0], CX.mintGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.scheduleConfirmBtn}
              >
                <Text style={styles.scheduleConfirmBtnText}>Confirm</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={instructionSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setInstructionSheetVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.noteSheetRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.noteSheetDim} onPress={() => setInstructionSheetVisible(false)} />
          <View
            style={[
              styles.noteSheetCard,
              styles.instructionSheetCard,
              { paddingBottom: Math.max(insets.bottom, 16) + 12 },
            ]}
          >
            <View style={styles.instructionSheetCloseWrap}>
              <Pressable
                style={styles.instructionSheetCloseRing}
                onPress={() => setInstructionSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.instructionSheetTitle}>Instruction for Delivery partner</Text>
            <Text style={styles.instructionSheetAddr} numberOfLines={4}>
              {selectedAddress
                ? `${selectedAddress.label ? `${selectedAddress.label} — ` : ""}${selectedAddress.fullAddress}`
                : currentLocationDisplay?.fullAddress ?? "Add a delivery address to continue"}
            </Text>
            <TextInput
              style={styles.instructionNoteInput}
              value={deliveryPartnerNote}
              onChangeText={setDeliveryPartnerNote}
              placeholder="Add a short note for your delivery partner (optional)"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={240}
              textAlignVertical="top"
            />
            <ScrollView
              style={styles.instructionSheetScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.instructionVoiceRow, styles.instructionDisabledBlock]} pointerEvents="none">
                <Ionicons name="mic-outline" size={20} color="#9CA3AF" />
                <Text style={styles.instructionVoiceHintDisabled}>Tap and hold to record instruction</Text>
                <Text style={styles.instructionComingSoon}>Soon</Text>
              </View>
              <Text style={[styles.instructionImageLabel, styles.instructionDisabledLabel]}>
                Door/building image (optional)
              </Text>
              <View style={[styles.instructionImageDashed, styles.instructionDisabledBlock]} pointerEvents="none">
                <Ionicons name="camera-outline" size={22} color="#9CA3AF" />
                <Text style={styles.instructionImageCtaDisabled}>Add an image</Text>
              </View>
              <Text style={[styles.instructionImageHelp, styles.instructionDisabledLabel]}>
                This helps our delivery partners find your exact location faster
              </Text>

              <View style={styles.instrCheckLine}>
                <View style={styles.instrCheckLeft}>
                  <MaterialCommunityIcons name="door-open" size={22} color={GatiMitraColors.textPrimary} />
                  <Text style={styles.instrCheckLabel}>Leave at door</Text>
                </View>
                <Pressable
                  onPress={() => setLeaveAtDoor((v) => !v)}
                  style={[styles.instrCheckBox, leaveAtDoor && styles.instrCheckBoxOn]}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: leaveAtDoor }}
                >
                  {leaveAtDoor ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
              </View>
              <View style={styles.instrCheckLine}>
                <View style={styles.instrCheckLeft}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={GatiMitraColors.textPrimary} />
                  <Text style={styles.instrCheckLabel}>Leave with guard</Text>
                </View>
                <Pressable
                  onPress={() => setInstrLeaveWithGuard((v) => !v)}
                  style={[styles.instrCheckBox, instrLeaveWithGuard && styles.instrCheckBoxOn]}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: instrLeaveWithGuard }}
                >
                  {instrLeaveWithGuard ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
              </View>
              <View style={styles.instrCheckLine}>
                <View style={styles.instrCheckLeft}>
                  <MaterialCommunityIcons name="phone-off-outline" size={22} color={GatiMitraColors.textPrimary} />
                  <Text style={styles.instrCheckLabel}>Avoid calling</Text>
                </View>
                <Pressable
                  onPress={() => setInstrAvoidCalling((v) => !v)}
                  style={[styles.instrCheckBox, instrAvoidCalling && styles.instrCheckBoxOn]}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: instrAvoidCalling }}
                >
                  {instrAvoidCalling ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
              </View>
              <View style={styles.instrCheckLine}>
                <View style={styles.instrCheckLeft}>
                  <Ionicons name="notifications-off-outline" size={22} color={GatiMitraColors.textPrimary} />
                  <Text style={styles.instrCheckLabel}>Don't ring the bell</Text>
                </View>
                <Pressable
                  onPress={() => setInstrDontRingBell((v) => !v)}
                  style={[styles.instrCheckBox, instrDontRingBell && styles.instrCheckBoxOn]}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: instrDontRingBell }}
                >
                  {instrDontRingBell ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
              </View>
              <View style={[styles.instrCheckLine, styles.instrCheckLineLast]}>
                <View style={styles.instrCheckLeft}>
                  <Ionicons name="paw-outline" size={22} color={GatiMitraColors.textPrimary} />
                  <Text style={styles.instrCheckLabel}>Pet at home</Text>
                </View>
                <Pressable
                  onPress={() => setInstrPetAtHome((v) => !v)}
                  style={[styles.instrCheckBox, instrPetAtHome && styles.instrCheckBoxOn]}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: instrPetAtHome }}
                >
                  {instrPetAtHome ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.instructionSaveBtnFull, instructionSaveBusy && { opacity: 0.7 }]}
              onPress={() => void saveDeliveryPartnerInstructions()}
              activeOpacity={0.9}
              disabled={instructionSaveBusy}
            >
              {instructionSaveBusy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.instructionSaveBtnFullText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={addressSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setAddressSheetVisible(false)}
      >
        <View style={styles.noteSheetRoot}>
          <Pressable style={styles.noteSheetDim} onPress={() => setAddressSheetVisible(false)} />
          <View
            style={[
              styles.noteSheetCard,
              styles.addressSelectSheetCard,
              {
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                maxHeight: Math.min(640, windowHeight * 0.92),
              },
            ]}
          >
            <View style={styles.addressSelectCloseWrap}>
              <Pressable
                style={styles.addressSelectCloseRing}
                onPress={() => setAddressSheetVisible(false)}
                hitSlop={14}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.addressSelectSheetTitle}>Select an address</Text>

            <Pressable
              style={styles.addressSelectAddPressable}
              onPress={() => {
                setAddressSheetVisible(false);
                router.push({ pathname: "/location", params: { afterSaveReturn: "checkout" } });
              }}
              android_ripple={{ color: "rgba(45, 181, 160, 0.18)" }}
            >
              <LinearGradient
                colors={["#F0FDFA", "#E6FAF5", "#DCF5EF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.addressSelectAddGradient}
              >
                <View style={styles.addressSelectAddIconCircle}>
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.addressSelectAddTextCol}>
                  <Text style={styles.addressSelectAddTitle}>Add Address</Text>
                  <Text style={styles.addressSelectAddSub} numberOfLines={2}>
                    Search area or drop a pin on the map
                  </Text>
                </View>
                <View style={styles.addressSelectAddChevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={CX.mint} />
                </View>
              </LinearGradient>
            </Pressable>

            <View style={styles.addressSelectSectionRule} />

            <Text style={styles.addressSelectSectionLabel}>SAVED ADDRESSES</Text>

            {addressesLoading ? (
              <View style={styles.addressSelectLoading}>
                <ActivityIndicator size="small" color={CX.mint} />
              </View>
            ) : addresses.length === 0 ? (
              <Text style={styles.addressSelectEmpty}>
                No saved addresses yet. Tap Add Address to save a delivery location.
              </Text>
            ) : (
              <ScrollView
                style={[styles.addressSelectScroll, { maxHeight: Math.min(460, windowHeight * 0.58) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {addresses.map((addr) => {
                  const isSelected = selectedAddress?.id === addr.id;
                  const busy = addressSheetBusyId === addr.id;
                  const dist = formatAddressToStoreDistance(merchant?.latitude, merchant?.longitude, addr);
                  const title = addr.contactName?.trim() || addr.label || "Saved address";
                  return (
                    <View
                      key={addr.id}
                      style={[styles.addressSelectCard, isSelected && styles.addressSelectCardSelected]}
                    >
                      {isSelected ? (
                        <Text style={styles.addressSelectDeliversTo}>DELIVERS TO</Text>
                      ) : null}
                      <Pressable
                        onPress={() => void selectAddressFromCheckoutSheet(addr)}
                        disabled={addressSheetBusyId != null}
                        style={({ pressed }) => [
                          styles.addressSelectTapBlock,
                          pressed && { opacity: 0.94 },
                        ]}
                      >
                        <View
                          style={[
                            styles.addressSelectCardInnerRow,
                            !isSelected && styles.addressSelectCardInnerRowPadTop,
                          ]}
                        >
                          <View style={styles.addressSelectIconCol}>
                            {busy ? (
                              <ActivityIndicator size="small" color={CX.mint} />
                            ) : (
                              <Ionicons
                                name={checkoutAddressRowIcon(addr.label, addr.contactName)}
                                size={24}
                                color="#374151"
                              />
                            )}
                            <Text style={styles.addressSelectDist}>{dist}</Text>
                          </View>
                          <View style={styles.addressSelectBody}>
                            <Text style={styles.addressSelectCardTitle} numberOfLines={1}>
                              {title}
                            </Text>
                            {addr.contactName && addr.label ? (
                              <Text style={styles.addressSelectSub} numberOfLines={1}>
                                {addr.label}
                              </Text>
                            ) : null}
                            <Text style={styles.addressSelectAddr} numberOfLines={4}>
                              {addr.fullAddress}
                            </Text>
                            {addr.contactMobile ? (
                              <Text style={styles.addressSelectPhone} numberOfLines={1}>
                                Phone number: {addr.contactMobile}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                      <View style={styles.addressSelectActionsRow}>
                        <Pressable
                          style={styles.addressSelectActionBtn}
                          hitSlop={8}
                          android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: true }}
                          onPress={() => {
                            Alert.alert("Address", undefined, [
                              {
                                text: "Edit on map",
                                onPress: () => openCheckoutAddressEditMap(addr),
                              },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => confirmDeleteCheckoutAddress(addr),
                              },
                              { text: "Cancel", style: "cancel" },
                            ]);
                          }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={17} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          style={styles.addressSelectActionBtn}
                          hitSlop={8}
                          android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: true }}
                          onPress={() => void shareCheckoutAddress(addr)}
                        >
                          <Ionicons name="share-outline" size={17} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          style={styles.addressSelectActionBtn}
                          hitSlop={8}
                          android_ripple={{ color: "rgba(255,255,255,0.25)", borderless: true }}
                          onPress={() => confirmDeleteCheckoutAddress(addr)}
                          disabled={deleteCheckoutAddressMutation.isPending}
                        >
                          <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={receiverSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setReceiverSheetVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.noteSheetRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.noteSheetDim} onPress={() => setReceiverSheetVisible(false)} />
          <View style={[styles.noteSheetCard, styles.receiverSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={styles.noteSheetTitleRow}>
              <Text style={styles.noteSheetTitle}>Update receiver details</Text>
              <TouchableOpacity
                onPress={() => setReceiverSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={styles.receiverSheetAddr} numberOfLines={3}>
              {selectedAddress
                ? `${selectedAddress.label ? `${selectedAddress.label} — ` : ""}${selectedAddress.fullAddress}`
                : ""}
            </Text>
            <Text style={styles.receiverFieldLabel}>Receiver&apos;s name</Text>
            <View style={styles.receiverInputRow}>
              <TextInput
                style={styles.receiverTextInput}
                value={receiverDraftName}
                onChangeText={setReceiverDraftName}
                placeholder="Name on the order"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
              />
              {receiverDraftName.length > 0 ? (
                <Pressable onPress={() => setReceiverDraftName("")} hitSlop={8} style={styles.receiverInputIconBtn}>
                  <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                </Pressable>
              ) : null}
              <Pressable onPress={() => void pickReceiverFromContacts()} style={styles.receiverInputIconBtn} hitSlop={8}>
                <Ionicons name="book-outline" size={22} color={CX.mint} />
              </Pressable>
            </View>
            <Text style={styles.receiverFieldLabel}>Receiver&apos;s mobile number</Text>
            <View style={styles.receiverInputRow}>
              <TextInput
                style={styles.receiverTextInput}
                value={receiverDraftMobile}
                onChangeText={setReceiverDraftMobile}
                placeholder="+91 9876543210"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
              {receiverDraftMobile.length > 0 ? (
                <Pressable onPress={() => setReceiverDraftMobile("")} hitSlop={8} style={styles.receiverInputIconBtn}>
                  <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                </Pressable>
              ) : null}
            </View>
            <TouchableOpacity
              activeOpacity={0.92}
              disabled={updateReceiverContactMutation.isPending}
              onPress={() => void saveReceiverDetails()}
            >
              <LinearGradient
                colors={[CX.mintGradient[0], CX.mintGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.receiverSubmitBtn}
              >
                {updateReceiverContactMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.receiverSubmitBtnText}>Submit</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={communityInitiativeSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setCommunityInitiativeSheetVisible(false)}
      >
        <View style={styles.noteSheetRoot}>
          <Pressable style={styles.noteSheetDim} onPress={() => setCommunityInitiativeSheetVisible(false)} />
          <View
            style={[
              styles.noteSheetCard,
              styles.addressSelectSheetCard,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
                maxHeight: Math.min(620, windowHeight * 0.88),
              },
            ]}
          >
            <View style={styles.addressSelectCloseWrap}>
              <Pressable
                style={styles.addressSelectCloseRing}
                onPress={() => setCommunityInitiativeSheetVisible(false)}
                hitSlop={14}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.communitySheetScrollContent}
            >
              <LinearGradient
                colors={["#DBEAFE", "#EFF6FF", "#FFFFFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.communitySheetHero}
              >
                <View style={styles.communitySheetHeroRow}>
                  <View style={styles.communitySheetHeroText}>
                    <Text style={styles.communitySheetTitle}>GatiMitra Community Initiative</Text>
                    <Text style={styles.communitySheetSub}>
                      {"We're building a platform that not only delivers orders faster but also aims to create opportunities and support communities in the future."}
                    </Text>
                  </View>
                  <View style={styles.communitySheetHeroIcons}>
                    <View style={styles.communitySheetIconBubble}>
                      <Ionicons name="rocket-outline" size={22} color={CX.mintDark} />
                    </View>
                    <View style={styles.communitySheetIconBubble}>
                      <Ionicons name="people-outline" size={22} color={CX.mintDark} />
                    </View>
                    <View style={styles.communitySheetIconBubble}>
                      <Ionicons name="leaf-outline" size={22} color={CX.mintDark} />
                    </View>
                  </View>
                </View>
              </LinearGradient>
              <View style={styles.communityImpactDividerRow}>
                <View style={styles.communityImpactRule} />
                <Text style={styles.communityImpactDividerLabel}>OUR JOURNEY</Text>
                <View style={styles.communityImpactRule} />
              </View>
              <View style={styles.communityImpactRow}>
                <View style={styles.communityImpactCol}>
                  <Text style={styles.communityImpactEmoji}>🚀</Text>
                  <Text style={styles.communityImpactLabel}>Startup Phase</Text>
                </View>
                <View style={styles.communityImpactCol}>
                  <Text style={styles.communityImpactEmoji}>🤝</Text>
                  <Text style={styles.communityImpactLabel}>Community Driven</Text>
                </View>
                <View style={styles.communityImpactCol}>
                  <Text style={styles.communityImpactEmoji}>🌱</Text>
                  <Text style={styles.communityImpactLabel}>Growing Together</Text>
                </View>
              </View>
              <Text style={styles.communitySheetFinePrint}>
                {
                  "Optional donations at checkout support verified NGO meal programmes. We'll share more community programmes here as GatiMitra grows."
                }
              </Text>
            </ScrollView>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => setCommunityInitiativeSheetVisible(false)}
              style={styles.communitySheetCtaWrap}
            >
              <LinearGradient
                colors={[CX.mintGradient[0], CX.mintGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.communitySheetCta}
              >
                <Text style={styles.communitySheetCtaText}>Continue Supporting</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={gmitraPlusSheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setGmitraPlusSheetVisible(false)}
      >
        <View style={styles.noteSheetRoot}>
          <Pressable style={styles.noteSheetDim} onPress={() => setGmitraPlusSheetVisible(false)} />
          <View style={[styles.noteSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.noteSheetTitleRow}>
              <Text style={styles.noteSheetTitle}>{GMITRA_PLUS_NAME}</Text>
              <TouchableOpacity
                onPress={() => setGmitraPlusSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.gmitraSheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.gmitraSheetLead}>
                {GMITRA_PLUS_NAME} is a membership that helps you save on every order with better delivery pricing and
                exclusive restaurant offers.
              </Text>
              <Text style={styles.gmitraSheetSectionTitle}>What you get</Text>
              <Text style={styles.gmitraSheetBullet}>• Lower or zero delivery fees on eligible orders</Text>
              <Text style={styles.gmitraSheetBullet}>• Member-only discounts and coupons at checkout</Text>
              <Text style={styles.gmitraSheetBullet}>• Priority access to new offers and partner deals</Text>
              <Text style={styles.gmitraSheetDisclaimer}>
                Benefits may vary by city, restaurant, and order value. Add {GMITRA_PLUS_NAME} to this order with the
                button below, or tap APPLY next to Learn more on checkout.
              </Text>
            </ScrollView>
            <View style={styles.gmitraSheetFooterRow}>
              <TouchableOpacity
                style={styles.gmitraSheetSecondaryBtn}
                onPress={() => setGmitraPlusSheetVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.gmitraSheetSecondaryBtnText}>Got it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.noteSheetSaveBtn,
                  styles.gmitraSheetPrimaryCta,
                  subscriptionOptIn && styles.gmitraSheetPrimaryCtaDisabled,
                ]}
                onPress={() => {
                  setSubscriptionOptIn(true);
                  setGmitraPlusSheetVisible(false);
                }}
                disabled={subscriptionOptIn}
                activeOpacity={0.9}
              >
                <Text style={styles.noteSheetSaveBtnText}>
                  {subscriptionOptIn ? "Already added" : `Add ${GMITRA_PLUS_NAME}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={gstBreakdownModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGstBreakdownModalVisible(false)}
      >
        <View style={styles.gstModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setGstBreakdownModalVisible(false)} />
          <View style={styles.gstModalCard}>
            <View style={styles.gstModalHeader}>
              <Text style={styles.gstModalTitle}>GST & other charges</Text>
              <Pressable
                onPress={() => setGstBreakdownModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={GatiMitraColors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.gstModalSubtitle}>
              Every GST and platform charge on this order, broken out one by one.
            </Text>
            <ScrollView style={styles.gstModalScroll} showsVerticalScrollIndicator={false}>
              {gstAndOtherBreakdown?.lines.map((row) => (
                <View key={row.key} style={styles.gstModalLine}>
                  <View style={styles.gstModalLineLeft}>
                    <Text style={styles.gstModalLineLabel}>{row.label}</Text>
                    {row.sub ? <Text style={styles.gstModalLineSub}>{row.sub}</Text> : null}
                  </View>
                  <Text style={styles.gstModalLineValue}>₹{row.amount.toFixed(2)}</Text>
                </View>
              ))}
              <View style={styles.gstModalDivider} />
              <View style={styles.gstModalLine}>
                <Text style={styles.gstModalTotalLabel}>Total</Text>
                <Text style={styles.gstModalTotalValue}>
                  ₹{(gstAndOtherBreakdown?.total ?? 0).toFixed(2)}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={billSummarySheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setBillSummarySheetVisible(false)}
      >
        <View style={styles.noteSheetRoot}>
          <Pressable style={styles.noteSheetDim} onPress={() => setBillSummarySheetVisible(false)} />
          <View
            style={[
              styles.noteSheetCard,
              styles.addressSelectSheetCard,
              {
                paddingBottom: Math.max(insets.bottom, 16) + 12,
                maxHeight: Math.min(720, windowHeight * 0.92),
              },
            ]}
          >
            <View style={styles.addressSelectCloseWrap}>
              <Pressable
                style={styles.addressSelectCloseRing}
                onPress={() => setBillSummarySheetVisible(false)}
                hitSlop={14}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={styles.addressSelectSheetTitle}>Bill Summary</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.billSummarySheetScroll}
            >
              {serverBill ? (
                <>
                  <View style={styles.billSheetSectionLabelWrap}>
                    <Text style={styles.billSheetSectionLabel}>PRICE BREAKDOWN</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Item total</Text>
                    <View style={styles.billSheetItemTotalRight}>
                      {showItemTotalStrike ? (
                        <Text style={styles.billValueStrike}>₹{serverBill.itemTotal.toFixed(2)}</Text>
                      ) : null}
                      <Text
                        style={[
                          styles.billValue,
                          showItemTotalStrike && styles.billValueBold,
                          showItemTotalStrike && styles.billSheetNetAfterDiscount,
                        ]}
                      >
                        ₹{(showItemTotalStrike ? serverBill.itemsNetAfterDiscounts : serverBill.itemTotal).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  {serverBill.addonTotal > 0 && (
                    <BillRow label="Add-ons" value={`₹${serverBill.addonTotal.toFixed(2)}`} />
                  )}

                  {/* Fee bases (no GST baked in) — keeps the bill compact. */}
                  {serverBill.components.packaging.taxable_value > 0.005 && (
                    <BillRow
                      label="Packaging charges"
                      value={`₹${serverBill.components.packaging.taxable_value.toFixed(2)}`}
                    />
                  )}
                  {serverBill.components.platform.taxable_value > 0.005 && (
                    <BillRow
                      label="Platform fee"
                      value={`₹${serverBill.components.platform.taxable_value.toFixed(2)}`}
                    />
                  )}
                  {serverBill.components.surge.taxable_value > 0.005 && (
                    <BillRow
                      label="Surge fee"
                      value={`₹${serverBill.components.surge.taxable_value.toFixed(2)}`}
                    />
                  )}
                  {serverBill.components.small_order.taxable_value > 0.005 && (
                    <BillRow
                      label="Small order fee"
                      value={`₹${serverBill.components.small_order.taxable_value.toFixed(2)}`}
                    />
                  )}
                  {serverBill.components.convenience.taxable_value > 0.005 && (
                    <BillRow
                      label="Convenience fee"
                      value={`₹${serverBill.components.convenience.taxable_value.toFixed(2)}`}
                    />
                  )}

                  {primaryCheckoutDiscount ? (
                    <BillRow
                      key="sheet-primary-discount"
                      label={primaryCheckoutDiscount.label}
                      value={`-₹${primaryCheckoutDiscount.amount.toFixed(2)}`}
                      green
                    />
                  ) : null}

                  {serverBill.components.delivery.taxable_value > 0.005 && (
                    <BillRow
                      label={deliveryFeeLabel}
                      value={`₹${serverBill.components.delivery.taxable_value.toFixed(2)}`}
                    />
                  )}

                  {/* Subscription / misc charges — surface each subscription as its own line
                      so the customer can see what they opted into. */}
                  {(serverBill.charges ?? [])
                    .filter((c) => {
                      const lbl = (c.label || "").toLowerCase();
                      return (
                        c.amount > 0.005 &&
                        (lbl.includes("gmitra") ||
                          lbl.includes("plus") ||
                          lbl.includes("gold") ||
                          lbl.includes("subscription"))
                      );
                    })
                    .map((c, idx) => (
                      <BillRow
                        key={`sheet-sub-${c.ruleId ?? idx}`}
                        label={c.label}
                        value={`₹${c.amount.toFixed(2)}`}
                      />
                    ))}

                  {/* Single combined "GST & other charges" row. Tapping the i icon
                      opens a modal that breaks down every GST + ungrouped extra. */}
                  {gstAndOtherBreakdown != null && gstAndOtherBreakdown.total > 0.005 && (
                    <GstOtherChargesRow
                      label="GST & other charges"
                      value={`₹${gstAndOtherBreakdown.total.toFixed(2)}`}
                      onInfoPress={() => setGstBreakdownModalVisible(true)}
                    />
                  )}
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
                  <View style={styles.billSheetToPayRow}>
                    <Text style={styles.billSheetToPayLabel}>To pay</Text>
                    <Text style={styles.billSheetToPayValue}>₹{serverBill.finalAmount.toFixed(2)}</Text>
                  </View>
                  {serverBill.discountTotal > 0.005 ? (
                    <View style={styles.billSheetSavingsBanner}>
                      <Text style={styles.billSheetSavingsEmoji}>🎉</Text>
                      <Text style={styles.billSheetSavingsText}>
                        You saved ₹{serverBill.discountTotal.toFixed(0)} on this order
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.billSheetEmpty}>
                  {billingQuery.isError
                    ? "Could not load bill from server. Check your connection and try again."
                    : "Calculating bill on server…"}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RazorpayCheckoutModal
        visible={razorpayModalVisible && !!razorpayOrderParams}
        orderParams={razorpayOrderParams}
        prefill={{
          contact: selectedAddress?.contactMobile ?? null,
          name: selectedAddress?.contactName ?? null,
          email: null,
        }}
        onSuccess={handleRazorpaySuccess}
        onCancel={handleRazorpayCancel}
      />

      {/* Dummy / simulated payment sheet (backend has PAYMENT_DUMMY_MODE=true
          or no Razorpay creds in dev). Lets QA pick Success or Failure and
          drive the exact same downstream flow as a real Razorpay payment. */}
      {simulatedPaymentOrder && (
        <View style={styles.simulatedPaymentOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={simulatedSubmitting ? undefined : handleSimulatedPaymentCancel}
          />
          <Pressable onPress={() => {}} style={styles.simulatedPaymentCardWrap}>
            <Animated.View entering={FadeIn.duration(220)} style={styles.simulatedPaymentCard}>
              <View style={styles.simulatedPaymentIconWrap}>
                <Ionicons name="flask-outline" size={28} color={GatiMitraColors.emerald} />
              </View>
              <Text style={styles.simulatedPaymentTitle}>Test payment</Text>
              <View style={styles.simulatedPaymentDevBadge}>
                <Text style={styles.simulatedPaymentDevBadgeText}>Dummy mode</Text>
              </View>
              <Text style={styles.simulatedPaymentSubtitle}>
                Razorpay is bypassed. Pick an outcome to drive the rest of the order flow end-to-end (merchant, rider, notifications all fire on success).
              </Text>
              <View style={styles.simulatedAmountRow}>
                <Text style={styles.simulatedAmountLabel}>Amount to pay</Text>
                <Text style={styles.simulatedAmountValue}>₹{(simulatedPaymentOrder.amount / 100).toFixed(2)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.simulatedConfirmBtn, simulatedSubmitting && styles.simulatedBtnDisabled]}
                onPress={handleSimulatedPaymentComplete}
                activeOpacity={0.85}
                disabled={simulatedSubmitting}
              >
                {simulatedSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.simulatedConfirmBtnText}>Simulate Success</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simulatedFailBtn, simulatedSubmitting && styles.simulatedBtnDisabled]}
                onPress={handleSimulatedPaymentFail}
                activeOpacity={0.85}
                disabled={simulatedSubmitting}
              >
                <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginRight: 8 }} />
                <Text style={styles.simulatedFailBtnText}>Simulate Failure</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.simulatedCancelBtn}
                onPress={handleSimulatedPaymentCancel}
                activeOpacity={0.85}
                disabled={simulatedSubmitting}
              >
                <Text style={styles.simulatedCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * The "GST & other charges" row exposes a single `i` chip that opens a modal
 * listing every GST + ungrouped extra item individually. Keeps the bill itself
 * compact while still being fully transparent.
 */
function GstOtherChargesRow({
  label,
  value,
  onInfoPress,
}: {
  label: string;
  value: string;
  onInfoPress: () => void;
}) {
  return (
    <View style={styles.billRow}>
      <View style={styles.billRowLabelWithInfo}>
        <Text style={styles.billLabel}>{label}</Text>
        <Pressable
          onPress={onInfoPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Show breakdown of GST and other charges"
        >
          <Ionicons name="information-circle-outline" size={19} color={GatiMitraColors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.billValue}>{value}</Text>
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

/**
 * Bill row that exposes a per-line GST breakdown via an inline "i" affordance.
 * Tapping the info chip toggles a small panel underneath with base/GST/total —
 * matches Zomato/Swiggy's transparent fee disclosure.
 *
 * If `breakdown` is omitted the row renders exactly like a plain BillRow (no
 * info icon, no toggle) — that way callers can pass conditional breakdowns
 * without branching at the call site.
 */
function BillRowExpandable({
  label,
  total,
  green,
  bold,
  breakdown,
  note,
}: {
  label: string;
  total: number;
  green?: boolean;
  bold?: boolean;
  breakdown?: { base: number; gst: number; gstRateLabel?: string | null };
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasBreakdown =
    breakdown != null &&
    (Math.abs(breakdown.gst) > 0.005 || Math.abs(breakdown.base) > 0.005);
  return (
    <>
      <View style={styles.billRow}>
        <View style={styles.billRowLabelWithInfo}>
          <Text style={styles.billLabel}>{label}</Text>
          {hasBreakdown ? (
            <Pressable
              onPress={() => setOpen((s) => !s)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={open ? `Hide breakdown of ${label}` : `Show breakdown of ${label}`}
            >
              <Ionicons
                name={open ? "chevron-up-circle" : "information-circle-outline"}
                size={18}
                color={GatiMitraColors.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>
        <Text
          style={[
            styles.billValue,
            bold && styles.billValueBold,
            green && styles.billValueGreen,
          ]}
        >
          {green && total > 0 ? `-₹${total.toFixed(2)}` : `₹${Math.abs(total).toFixed(2)}`}
        </Text>
      </View>
      {open && hasBreakdown && breakdown ? (
        <View style={styles.billBreakdownPanel}>
          <View style={styles.billBreakdownRow}>
            <Text style={styles.billBreakdownLabel}>Base</Text>
            <Text style={styles.billBreakdownValue}>₹{breakdown.base.toFixed(2)}</Text>
          </View>
          <View style={styles.billBreakdownRow}>
            <Text style={styles.billBreakdownLabel}>
              GST{breakdown.gstRateLabel ? ` (${breakdown.gstRateLabel})` : ""}
            </Text>
            <Text style={styles.billBreakdownValue}>₹{breakdown.gst.toFixed(2)}</Text>
          </View>
          <View style={[styles.billBreakdownRow, styles.billBreakdownTotalRow]}>
            <Text style={styles.billBreakdownTotalLabel}>Total</Text>
            <Text style={styles.billBreakdownTotalValue}>
              ₹{(breakdown.base + breakdown.gst).toFixed(2)}
            </Text>
          </View>
          {note ? <Text style={styles.billBreakdownNote}>{note}</Text> : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F6F8" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: GatiMitraColors.textSecondary },
  ctaSecondary: { marginTop: SPACING, paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryText: { fontSize: 16, fontWeight: "600", color: CX.mint },
  header: {
    backgroundColor: CHECKOUT_HEADER_BG,
    zIndex: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    ...GatiMitraColors.elevationShadow,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  headerBack: {
    alignSelf: "center",
    paddingVertical: 2,
    paddingHorizontal: 2,
    marginRight: 4,
    justifyContent: "center",
  },
  headerCenter: { flex: 1, minWidth: 0 },
  headerStoreName: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    marginBottom: 4,
    lineHeight: 16,
    paddingBottom: 0,
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  headerAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    marginTop: 0,
  },
  headerEtaText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 14,
    color: "#111111",
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  headerEtaStrong: { fontSize: 12, fontWeight: "700", color: "#278048", lineHeight: 14 },
  headerEtaSecondary: { fontSize: 12, fontWeight: "700", color: "#111111", lineHeight: 14 },
  headerAddressSep: { fontSize: 12, color: "#9CA3AF", fontWeight: "400", lineHeight: 14 },
  headerFullAddressInline: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "400",
    lineHeight: 14,
  },
  headerChevron: { marginLeft: 2 },
  headerShareIconBtn: {
    alignSelf: "center",
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginLeft: 2,
    justifyContent: "center",
  },
  /** Same height rhythm as distanceBannerCompact — below location warning. */
  checkoutSavingsTag: {
    width: "100%",
    backgroundColor: "#EFF6FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#BFDBFE",
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutSavingsTagText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
    color: "#2563EB",
    textAlign: "center",
  },
  distanceBannerOuter: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "#F5F6F8",
  },
  distanceBannerNotch: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFF9E1",
    marginBottom: -1,
  },
  distanceBannerCompact: {
    width: "100%",
    backgroundColor: "#FFF9E1",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8D48B",
    borderBottomWidth: 1,
    borderBottomColor: "#E8D48B",
  },
  distanceBannerCompactText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 15,
    color: "#6B4F1D",
    textAlign: "center",
  },
  savedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF9E1",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8D48B",
    borderBottomWidth: 1,
    borderBottomColor: "#E8D48B",
    gap: 8,
  },
  savedBannerEmoji: { fontSize: 16 },
  savedBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 15,
    color: "#6B4F1D",
  },
  // Offers card — vertical blue banner, white-rim % tile, GMitra plus, coupons
  offersCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
    ...GatiMitraColors.elevationShadow,
  },
  offersCardBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  offersCardBannerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    lineHeight: 19,
  },
  offersCardBannerIconGlow: {
    padding: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    shadowColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  offersCardBannerIconOuter: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    shadowColor: "#93C5FD",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  offersCardBannerIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  offersCardBannerPct: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
  },
  offersDottedSep: {
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    borderStyle: Platform.OS === "ios" ? "dotted" : "dashed",
  },
  offersBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  offersAppliedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  offersSubIcon: {},
  offersBodyTextCol: { flex: 1, minWidth: 0 },
  offersSubLineBold: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  offersSubLineMuted: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
    marginTop: 3,
  },
  offersLearnMore: {
    fontSize: 12,
    fontWeight: "600",
    color: CX.mint,
    marginTop: 8,
  },
  offersApplyOutline: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CX.mint,
    backgroundColor: "#FFFFFF",
  },
  offersApplyOutlineText: {
    fontSize: 11,
    fontWeight: "700",
    color: CX.mint,
    letterSpacing: 0.6,
  },
  offersApplyFilled: {
    backgroundColor: CX.mint,
    borderColor: CX.mint,
  },
  offersApplyFilledText: {
    color: "#FFFFFF",
  },
  offersGreenTick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  offersAppliedLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
    color: "#111827",
  },
  offersSavingsBlue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4A90E2",
  },
  offersRemoveRed: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E23744",
    letterSpacing: 0.2,
    paddingTop: 2,
  },
  offersAppliedHeadline: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 19,
  },
  offersCouponHeadline: {
    fontSize: 14,
    fontWeight: "400",
    color: "#111827",
  },
  offersCouponIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  offersCouponIconPct: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  // Contact (name + phone) row inside delivery card
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
    marginTop: 6,
  },
  contactRowText: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  scroll: { flex: 1, backgroundColor: "#F5F6F8" },
  scrollContent: { paddingHorizontal: 12 },
  section: { marginTop: 0, marginBottom: 10 },
  sectionContrib: { marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary, marginBottom: 8 },
  sectionTitleSmall: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
    ...GatiMitraColors.elevationShadow,
  },
  orderItemsPreview: { gap: 0 },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 0,
    paddingBottom: 0,
    gap: 8,
  },
  orderItemRowSpacer: {
    marginBottom: 12,
  },
  orderItemMid: { flex: 1, minWidth: 0, paddingRight: 4 },
  orderItemName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222222",
    lineHeight: 18,
  },
  orderItemSub: {
    fontSize: 12,
    fontWeight: "400",
    color: "#666666",
    marginTop: 1,
    lineHeight: 15,
  },
  orderItemEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  orderItemEditText: { fontSize: 12, fontWeight: "600", color: CX.mint },
  orderItemRightCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 72,
  },
  orderItemStepperPill: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 72,
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: CX.mint,
    backgroundColor: CX.mintSoft,
  },
  qtyBtnSmall: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyGlyph: {
    fontSize: 14,
    fontWeight: "500",
    color: CX.mint,
    lineHeight: 16,
    textAlign: "center",
  },
  qtyValueSmall: {
    fontSize: 12,
    fontWeight: "700",
    color: CX.mint,
    minWidth: 18,
    textAlign: "center",
  },
  orderItemLinePrice: {
    fontSize: 14,
    fontWeight: "700",
    color: "#222222",
    marginTop: 6,
    textAlign: "right",
  },
  addMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 0,
    paddingTop: 8,
    paddingBottom: 0,
    gap: 5,
  },
  addMorePlus: { fontSize: 17, fontWeight: "700", color: CX.mint, lineHeight: 20 },
  addMoreText: { fontSize: 14, fontWeight: "700", color: CX.mint, flexShrink: 1 },
  checkoutUtilityPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  checkoutUtilityPill: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  checkoutUtilityPillInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  checkoutUtilityPillActive: {
    borderColor: CX.mint,
    backgroundColor: CX.mintSoft,
  },
  checkoutUtilityPillText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "500",
    color: "#666666",
    textAlign: "left",
    lineHeight: 14,
  },
  noteSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  noteSheetDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  noteSheetCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  noteSheetTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  noteSheetTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 22,
  },
  noteSheetInput: {
    minHeight: 120,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FAFAFA",
  },
  noteSheetDisclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
    marginTop: 12,
  },
  noteSheetFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 4,
  },
  noteSheetClearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  noteSheetClearText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  noteSheetSaveBtn: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: CX.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  noteSheetSaveBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  gmitraSheetScroll: {
    maxHeight: 340,
    marginBottom: 16,
  },
  gmitraSheetLead: {
    fontSize: 14,
    lineHeight: 21,
    color: "#374151",
    marginBottom: 14,
  },
  gmitraSheetSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  gmitraSheetBullet: {
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5563",
    marginBottom: 6,
  },
  gmitraSheetDisclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: "#9CA3AF",
    marginTop: 14,
  },
  gmitraSheetFooterRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginTop: 4,
  },
  gmitraSheetSecondaryBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: CX.mint,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  gmitraSheetSecondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: CX.mint,
  },
  gmitraSheetPrimaryCta: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
  },
  gmitraSheetPrimaryCtaDisabled: {
    opacity: 0.55,
  },
  nonVegBg: { backgroundColor: "#FED7AA" },
  upsellOuterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
    ...GatiMitraColors.elevationShadow,
  },
  upsellSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  upsellSectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellSectionIconPlus: { position: "absolute", right: 3, bottom: 3 },
  upsellSectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    letterSpacing: -0.1,
  },
  upsellScrollWrap: {},
  upsellScrollInner: { flex: 1, minHeight: 0 },
  upsellScrollContent: {
    paddingVertical: 0,
    paddingLeft: 0,
    flexGrow: 0,
    alignItems: "flex-start",
  },
  upsellCard: {
    flexShrink: 0,
    marginRight: 0,
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    padding: 0,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  upsellCardPressed: { opacity: 0.92 },
  upsellImageWrap: {
    position: "relative",
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
  },
  upsellImage: { width: "100%", height: "100%", resizeMode: "cover", borderRadius: 0 },
  upsellImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellVegBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    width: 15,
    height: 15,
    borderRadius: 3,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellNonVegBadge: { borderColor: "#8D4A2B" },
  upsellVegDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22C55E" },
  upsellNonVegDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#8D4A2B" },
  upsellAddBtnOnImage: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 5,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: CX.mintBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  upsellName: {
    alignSelf: "stretch",
    fontSize: 11,
    fontWeight: "500",
    color: "#1F2937",
    marginTop: 6,
    marginHorizontal: 8,
    marginBottom: 0,
    lineHeight: 15,
    textAlign: "left",
  },
  upsellPrice: {
    alignSelf: "stretch",
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 4,
    marginHorizontal: 8,
    marginBottom: 0,
    textAlign: "left",
  },
  zomatoCheckoutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
    ...GatiMitraColors.elevationShadow,
  },
  zomatoSavingsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DBEAFE",
  },
  zomatoSavingsBannerEmoji: { fontSize: 16 },
  zomatoSavingsBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
    lineHeight: 18,
  },
  zomatoCardPad: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  zomatoCardPadH: { paddingHorizontal: 14 },
  zomatoCardDash: {
    marginHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    borderStyle: Platform.OS === "ios" ? "dotted" : "dashed",
  },
  zomatoEtaLine: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    fontWeight: "500",
  },
  zomatoEtaTextCol: { flex: 1, minWidth: 0 },
  zomatoEtaBold: { fontWeight: "800", color: GatiMitraColors.textPrimary },
  scheduledSummaryLine: {
    fontSize: 12,
    fontWeight: "600",
    color: CX.mintDark,
    marginTop: 5,
    lineHeight: 16,
  },
  zomatoScheduleRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  zomatoScheduleLine: { fontSize: 12, color: GatiMitraColors.textSecondary },
  zomatoScheduleLink: {
    fontSize: 12,
    fontWeight: "800",
    color: CX.mint,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
    textDecorationColor: CX.mint,
  },
  zomatoAddrBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deliveryAddrTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  deliveryAddrTitleTextWrap: { flex: 1, minWidth: 0 },
  leaveAtDoorChipBelowAddr: { marginTop: 6, alignSelf: "flex-start" },
  zomatoAddrChevronHit: {
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    paddingLeft: 4,
  },
  zomatoAddrRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deliveryAddrPre: { fontWeight: "500", color: GatiMitraColors.textPrimary },
  deliveryAddrName: { fontWeight: "800", color: GatiMitraColors.textPrimary },
  zomatoContactRow: {
    borderTopWidth: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  zomatoBillHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  zomatoBillHeaderWithAttach: {
    paddingBottom: 8,
    borderBottomWidth: 0,
  },
  zomatoBillHeaderMid: { flex: 1, minWidth: 0 },
  zomatoBillTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary },
  zomatoBillSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 2 },
  zomatoBillHeaderRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  zomatoBillPriceCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
    maxWidth: 210,
  },
  zomatoBillStrike: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  zomatoBillFinal: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  zomatoSavedPill: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  zomatoSavedPillText: { fontSize: 10, fontWeight: "700", color: "#1D4ED8" },
  zomatoGoldAttach: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CX.mintSoft,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  zomatoGoldPointerShell: {
    position: "absolute",
    top: -9,
    left: 16,
    width: 18,
    height: 10,
  },
  zomatoGoldPointerBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: CX.mintBorder,
  },
  zomatoGoldPointerFill: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: CX.mintSoft,
  },
  zomatoGoldCrownRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CX.mintDark,
    alignItems: "center",
    justifyContent: "center",
  },
  zomatoGoldTextCol: { flex: 1, minWidth: 0 },
  zomatoGoldTitle: { fontSize: 13, fontWeight: "800", color: CX.mintDark, lineHeight: 17 },
  zomatoGoldSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 2, lineHeight: 15 },
  zomatoGoldAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CX.mint,
    backgroundColor: "#FFFFFF",
    minWidth: 72,
    alignItems: "center",
  },
  zomatoGoldAddBtnApplied: {
    borderColor: CX.mint,
    backgroundColor: CX.mint,
  },
  zomatoGoldAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: CX.mint,
    textAlign: "center",
  },
  zomatoGoldAddBtnTextApplied: {
    color: "#FFFFFF",
  },
  deliveryEtaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 8 },
  weatherEtaImpact: { fontSize: 11, color: GatiMitraColors.splashMint, fontWeight: "600", marginTop: 2 },
  deliveryEtaText: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.emerald },
  scheduleRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  scheduleText: { flex: 1, fontSize: 12, color: GatiMitraColors.textSecondary },
  deliveryDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: 8 },
  deliveryAddrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    borderRadius: 12,
    marginHorizontal: -4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  deliveryAddrRowPressed: {
    opacity: 0.92,
    backgroundColor: "rgba(20, 184, 166, 0.06)",
  },
  deliveryAddrTextWrap: { flex: 1, minWidth: 0 },
  deliveryAddrLabel: { fontSize: 14, fontWeight: "400", color: GatiMitraColors.textPrimary },
  deliveryAddrSub: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 2 },
  leaveAtDoorChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  leaveAtDoorChipText: { fontSize: 11, color: GatiMitraColors.emerald, fontWeight: "600" },
  changeAddressCta: { fontSize: 12, color: CX.mint, marginTop: 2, fontWeight: "600" },
  leaveAtDoorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leaveAtDoorLabel: { fontSize: 14, color: GatiMitraColors.textPrimary },
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: SPACING,
    gap: 12,
    ...GatiMitraColors.elevationShadow,
  },
  couponRowText: { flex: 1, fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  appliedCouponWrap: { flex: 1 },
  appliedCouponText: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.emerald },
  billSummaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  billSummaryHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  billSummaryTotal: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  billSummarySheetScroll: { paddingBottom: 24, paddingTop: 2 },
  billSheetSectionLabelWrap: { marginBottom: 10 },
  billSheetSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1.2,
  },
  billSheetItemTotalRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  billValueStrike: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  billSheetNetAfterDiscount: { fontSize: 15, fontWeight: "800", color: GatiMitraColors.textPrimary },
  billSheetToPayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 2,
  },
  billSheetToPayLabel: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  billSheetToPayValue: { fontSize: 21, fontWeight: "800", color: "#0F172A" },
  billSheetSavingsBanner: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E0F2FE",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  billSheetSavingsEmoji: { fontSize: 18 },
  billSheetSavingsText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#0369A1",
    lineHeight: 20,
  },
  billSheetEmpty: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    lineHeight: 21,
    paddingVertical: 24,
    textAlign: "center",
  },
  billSkeletonWrap: { gap: 12 },
  billSkeletonLine: { height: 18, borderRadius: 8 },
  billSkeletonLast: { width: "60%" },
  billSkeletonLastLine: { height: 18, borderRadius: 8, width: "60%" },
  billRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  billRowLabelWithInfo: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  billLabel: { fontSize: 13, color: GatiMitraColors.textSecondary },
  gstModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: SPACING,
    position: "relative",
  },
  gstModalCard: {
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: SPACING + 2,
    ...GatiMitraColors.elevationShadow,
  },
  gstModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gstModalTitle: { fontSize: 17, fontWeight: "800", color: GatiMitraColors.textPrimary, flex: 1 },
  gstModalSubtitle: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 6, marginBottom: 12 },
  gstModalScroll: { maxHeight: 360 },
  gstModalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 12,
  },
  gstModalLineLeft: { flex: 1, minWidth: 0 },
  gstModalLineLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  gstModalLineSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 4, lineHeight: 16 },
  gstModalLineValue: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary },
  gstModalDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: 4 },
  gstModalTotalLabel: { fontSize: 14, fontWeight: "800", color: GatiMitraColors.textPrimary },
  gstModalTotalValue: { fontSize: 14, fontWeight: "800", color: GatiMitraColors.textPrimary },
  billValue: { fontSize: 13, color: GatiMitraColors.textPrimary },
  billValueBold: { fontWeight: "800", fontSize: 15 },
  billValueGreen: { color: GatiMitraColors.emerald, fontWeight: "600" },
  billDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: 8 },
  /** Inline GST breakdown panel revealed when the user taps the "i" chip on a bill row. */
  billBreakdownPanel: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: -2,
    marginBottom: 6,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  billBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  billBreakdownLabel: { fontSize: 12, color: GatiMitraColors.textSecondary },
  billBreakdownValue: { fontSize: 12, color: GatiMitraColors.textPrimary, fontWeight: "600" },
  billBreakdownTotalRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  billBreakdownTotalLabel: { fontSize: 12, fontWeight: "700", color: GatiMitraColors.textPrimary },
  billBreakdownTotalValue: { fontSize: 12, fontWeight: "800", color: GatiMitraColors.textPrimary },
  billBreakdownNote: {
    marginTop: 6,
    fontSize: 11,
    fontStyle: "italic",
    color: GatiMitraColors.textSecondary,
  },
  contributionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  contributionSub: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 4 },
  donationRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  // Zomato-style compact donation / tip card (banner + horizontal pill row)
  donationCompactCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    overflow: "hidden",
  },
  donationCompactBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    marginHorizontal: -12,
    marginTop: -12,
    paddingHorizontal: 14,
  },
  donationCompactBannerTextWrap: { flex: 1, minWidth: 0 },
  donationCompactTitle: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  donationCompactBrand: { fontSize: 15, fontWeight: "800", color: GatiMitraColors.textPrimary, marginTop: 2 },
  donationCompactIllustration: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  donationCompactSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    marginBottom: 8,
  },
  donationCompactPillRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  donationCompactPill: {
    flex: 1,
    minWidth: 60,
    paddingVertical: 9,
    paddingHorizontal: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    position: "relative",
  },
  donationCompactPillActive: {
    borderColor: CX.mint,
    backgroundColor: CX.mintSoft,
    borderWidth: 2,
  },
  donationCompactPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  donationCompactPillTextActive: { color: CX.mint },
  tipSliderCard: {
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  tipHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 2,
  },
  tipHeaderTextCol: { flex: 1, minWidth: 0 },
  tipTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tipSliderHeading: { fontSize: 14, fontWeight: "800", color: "#111827" },
  tipSliderLead: { fontSize: 10, color: "#6B7280", marginTop: 1, lineHeight: 13 },
  tipSliderLeadBold: { fontSize: 10, color: "#374151", marginTop: 1, lineHeight: 13 },
  tipSliderLead100: { fontWeight: "800", color: "#111827" },
  tipHeroArt: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    marginTop: 0,
  },
  tipHeroArtCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  tipHeroHeartBadge: {
    position: "absolute",
    top: 0,
    right: 2,
    backgroundColor: "#fff",
    borderRadius: 6,
    padding: 1,
  },
  tipSparkleA: { position: "absolute", top: 0, right: 0 },
  tipSparkleB: { position: "absolute", bottom: 4, left: -2 },
  tipSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 2,
  },
  tipSelectedLabel: { fontSize: 10, fontWeight: "600", color: "#6B7280" },
  tipSelectedBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 44,
    alignItems: "center",
  },
  tipSelectedValue: { fontSize: 13, fontWeight: "800", color: CX.mintDark },
  tipSliderBlock: { marginTop: 0, marginBottom: 0 },
  tipSliderTrackMeasure: {
    width: "100%",
    minHeight: 28,
    justifyContent: "center",
    paddingVertical: 0,
  },
  tipSliderTrackPressable: {
    height: 28,
    width: "100%",
    justifyContent: "center",
    position: "relative",
  },
  tipSliderTrackBg: {
    height: 7,
    width: "100%",
    borderRadius: 4,
    backgroundColor: "#DCFCE7",
    overflow: "hidden",
    position: "relative",
  },
  tipSliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: CX.mint,
  },
  tipSliderThumb: {
    position: "absolute",
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: CX.mint,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  tipSliderLabelsRow: {
    position: "relative",
    width: "100%",
    height: 18,
    marginTop: 4,
  },
  tipSliderLabelHitAbs: {
    position: "absolute",
    top: 0,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
  },
  tipSliderLabel: { fontSize: 11, fontWeight: "600", color: "#94A3B8", textAlign: "center" },
  tipSliderLabelActive: { color: CX.mintDark, fontWeight: "800" },
  donationMealBadge: {
    position: "absolute",
    top: -6,
    fontSize: 8,
    fontWeight: "800",
    color: "#fff",
    backgroundColor: CX.mint,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: "hidden",
    letterSpacing: 0.3,
  },
  feedingIndiaCard: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  feedingIndiaHero: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    overflow: "hidden",
  },
  feedingIndiaHeroDecor: {
    ...StyleSheet.absoluteFillObject,
  },
  feedingWaveBlob: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.38)",
    top: -36,
    left: -48,
  },
  feedingWaveBlobB: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.22)",
    top: 8,
    right: -28,
  },
  feedingIndiaHeroTextWrap: { flex: 1, minWidth: 0, zIndex: 1, paddingRight: 6 },
  feedingIndiaTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  feedingIndiaTitleTextBlock: { flex: 1, minWidth: 0 },
  feedingIndiaHeadline: { lineHeight: 20 },
  feedingIndiaJoin: { fontSize: 13, fontWeight: "600", color: "#1E293B" },
  feedingIndiaBrand: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  feedingIndiaHeart: { fontSize: 14, color: "#EF4444" },
  feedingIndiaInfoHit: { padding: 2, marginTop: -2 },
  feedingIndiaTagline: {
    fontSize: 11,
    fontWeight: "500",
    color: "#475569",
    marginTop: 4,
    lineHeight: 15,
  },
  feedingIndiaArt: {
    width: 72,
    height: 58,
    marginLeft: 0,
    marginTop: -2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    backgroundColor: "transparent",
  },
  feedingIndiaArtImage: {
    width: 68,
    height: 54,
    backgroundColor: "transparent",
  },
  feedingIndiaWhite: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  feedingIndiaDonateLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  feedingIndiaDonateLine: { fontSize: 13, fontWeight: "500", color: "#334155", flex: 1 },
  feedingIndiaDonateBold: { fontWeight: "800", color: "#0F172A" },
  feedingInrRowOuter: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  feedingInrPresetsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  feedingInrPresetBox: {
    width: 48,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  feedingInrPresetBoxActive: {
    borderColor: CX.mint,
    borderWidth: 2,
    backgroundColor: "#FFFFFF",
  },
  feedingInrPresetAmt: { fontSize: 13, fontWeight: "700", color: "#111827" },
  feedingInrCustomSlot: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  feedingInrCustomTrigger: {
    minWidth: 76,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  feedingInrCustomCompact: {
    height: 46,
    minWidth: 88,
    maxWidth: 104,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
  },
  feedingInrCustomCompactActive: {
    borderColor: CX.mint,
    borderWidth: 2,
  },
  feedingInrCustomInnerCompact: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 2,
  },
  feedingInrRupeeCompact: { fontSize: 14, fontWeight: "800", color: "#111827", paddingBottom: 2 },
  feedingInrInputUnderlineWrapCompact: {
    minWidth: 32,
    maxWidth: 52,
  },
  feedingInrCustomInputCompact: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    paddingVertical: 0,
    paddingHorizontal: 0,
    margin: 0,
    textAlign: "center",
    minHeight: 20,
    ...Platform.select({ android: { paddingVertical: 0 } }),
  },
  feedingInrAmtActive: { color: CX.mintDark, fontWeight: "800" },
  feedingInrCustomUnderline: {
    height: 2,
    backgroundColor: CX.mint,
    borderRadius: 1,
    marginTop: 1,
  },
  feedingDonationConfirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  feedingDonationConfirmText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#111827",
  },
  feedingDonationClearText: {
    fontSize: 12,
    fontWeight: "700",
    color: CX.mint,
  },
  communitySheetScrollContent: {
    paddingBottom: 12,
  },
  communitySheetHero: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  communitySheetHeroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  communitySheetHeroText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  communitySheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 24,
  },
  communitySheetSub: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
    lineHeight: 19,
  },
  communitySheetHeroIcons: {
    gap: 8,
    paddingTop: 2,
  },
  communitySheetIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(45, 181, 160, 0.22)",
  },
  communityImpactDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  communityImpactRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#CBD5E1",
  },
  communityImpactDividerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1.2,
  },
  communityImpactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 16,
  },
  communityImpactCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  communityImpactEmoji: { fontSize: 22, marginBottom: 6 },
  communityImpactLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
    lineHeight: 15,
  },
  communitySheetFinePrint: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
    lineHeight: 16,
  },
  communitySheetCtaWrap: {
    marginTop: 4,
  },
  communitySheetCta: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  communitySheetCtaText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  checkoutReceiverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  checkoutReceiverText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  receiverSheetCard: { paddingTop: 8 },
  receiverSheetAddr: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginBottom: 16,
  },
  receiverFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 6,
  },
  receiverInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    marginBottom: 14,
    backgroundColor: "#FAFAFA",
  },
  receiverTextInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 12,
    minHeight: 48,
  },
  receiverInputIconBtn: { padding: 4 },
  receiverSubmitBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  receiverSubmitBtnText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  // Compact tip header (small icon + 2-line text — no big icon wrap, no "Choose amount" line)
  tipCompactHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  tipCompactHeaderTextWrap: { flex: 1, minWidth: 0 },
  tipCompactTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary },
  tipCompactSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 1 },
  // "Add instructions for delivery partner" - underlined link chip (Zomato style)
  leaveAtDoorChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
  },
  leaveAtDoorChipRowText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraColors.textPrimary,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
  },
  instructionPartnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 12,
  },
  instructionPartnerTextCol: { flex: 1, minWidth: 0 },
  instructionPartnerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  instructionPartnerSummary: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  scheduleSheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
  },
  scheduleTabRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingBottom: 2,
    gap: 4,
  },
  scheduleTabHit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 76,
    alignItems: "center",
  },
  scheduleTabLine1: { fontSize: 13, fontWeight: "600", color: "#9CA3AF" },
  scheduleTabLine1On: { fontSize: 13, fontWeight: "800", color: "#111827" },
  scheduleTabLine2: { fontSize: 11, fontWeight: "500", color: "#9CA3AF", marginTop: 2 },
  scheduleTabLine2On: { fontSize: 11, fontWeight: "600", color: "#4B5563" },
  scheduleTabUnderline: {
    alignSelf: "stretch",
    height: 3,
    borderRadius: 2,
    marginTop: 8,
  },
  scheduleTabUnderlineOn: { backgroundColor: CX.mint },
  scheduleTabUnderlineOff: { backgroundColor: "transparent" },
  scheduleSlotScroll: { maxHeight: 260, marginTop: 4 },
  scheduleSlotScrollContent: { paddingBottom: 12 },
  scheduleSlotRow: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  scheduleSlotRowOn: { backgroundColor: "#F3F4F6" },
  scheduleSlotText: { fontSize: 15, fontWeight: "500", color: "#9CA3AF", textAlign: "center" },
  scheduleSlotTextOn: { fontSize: 15, fontWeight: "800", color: "#111827" },
  scheduleConfirmBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  scheduleConfirmBtnText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  instructionSheetCard: {
    maxHeight: 560,
  },
  instructionSheetCloseWrap: { alignItems: "center", marginBottom: 10 },
  instructionSheetCloseRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  instructionSheetTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  instructionSheetAddr: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginBottom: 12,
  },
  instructionNoteInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    marginBottom: 12,
  },
  instructionSheetScroll: { maxHeight: 320 },
  instructionVoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: "#FAFAFA",
  },
  instructionVoiceHint: {
    flex: 1,
    fontSize: 13,
    color: "#6B7280",
  },
  instructionVoiceHintDisabled: {
    flex: 1,
    fontSize: 13,
    color: "#9CA3AF",
  },
  instructionComingSoon: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  instructionDisabledBlock: { opacity: 0.42 },
  instructionDisabledLabel: { opacity: 0.55 },
  instructionImageLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 6 },
  instructionImageDashed: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 6,
  },
  instructionImageCta: { fontSize: 14, fontWeight: "700", color: CX.mint },
  instructionImageCtaDisabled: { fontSize: 14, fontWeight: "700", color: "#9CA3AF" },
  instructionImageHelp: { fontSize: 11, color: "#9CA3AF", marginBottom: 4, lineHeight: 15 },
  instrCheckLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  instrCheckLineLast: { borderBottomWidth: 0 },
  instrCheckLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  instrCheckLabel: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  instrCheckBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: CX.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  instrCheckBoxOn: { backgroundColor: CX.mint, borderColor: CX.mint },
  instructionSaveBtnFull: {
    marginTop: 12,
    backgroundColor: CX.mint,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionSaveBtnFullText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  addressSelectSheetCard: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  addressSelectCloseWrap: {
    alignItems: "center",
    marginTop: -18,
    marginBottom: 14,
    zIndex: 4,
  },
  addressSelectCloseRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  addressSelectSheetTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  addressSelectAddPressable: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 2,
    shadowColor: "#2DB5A0",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  addressSelectAddGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(45, 181, 160, 0.22)",
  },
  addressSelectAddIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: CX.mint,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: CX.mintDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  addressSelectAddTextCol: { flex: 1, minWidth: 0, justifyContent: "center" },
  addressSelectAddTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  addressSelectAddSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
    lineHeight: 16,
  },
  addressSelectAddChevronWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(45, 181, 160, 0.2)",
  },
  addressSelectSectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginTop: 14,
    marginBottom: 4,
  },
  addressSelectSectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#8CA3C4",
    letterSpacing: 1.1,
    marginTop: 10,
    marginBottom: 8,
  },
  addressSelectLoading: { paddingVertical: 28, alignItems: "center" },
  addressSelectEmpty: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  addressSelectScroll: { flexGrow: 0 },
  addressSelectCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ECEEF1",
    marginBottom: 10,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  addressSelectCardSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: CX.mint,
    borderWidth: 2,
    shadowColor: CX.mint,
    shadowOpacity: 0.12,
  },
  addressSelectDeliversTo: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563EB",
    letterSpacing: 0.85,
    marginLeft: 14,
    marginRight: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  addressSelectTapBlock: {
    width: "100%",
  },
  addressSelectCardInnerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 12,
  },
  addressSelectCardInnerRowPadTop: { paddingTop: 12 },
  addressSelectIconCol: { width: 44, alignItems: "center", paddingTop: 2 },
  addressSelectDist: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 6,
    textAlign: "center",
  },
  addressSelectBody: { flex: 1, minWidth: 0 },
  addressSelectCardTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  addressSelectSub: { fontSize: 12, fontWeight: "600", color: "#64748B", marginTop: 2 },
  addressSelectAddr: { fontSize: 14, fontWeight: "400", color: "#4B5563", marginTop: 6, lineHeight: 20 },
  addressSelectPhone: { fontSize: 13, fontWeight: "400", color: "#6B7280", marginTop: 8 },
  addressSelectActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF1F5",
  },
  addressSelectActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CX.mint,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  donationCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraColors.emerald,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  donationCardHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 0 },
  donationIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  donationCardTitleWrap: { flex: 1, minWidth: 0 },
  donationCardTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  donationCardSub: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 3 },
  donationBoxLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 7,
  },
  donationSuggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 0 },
  donationAmountBox: {
    minWidth: 54,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  donationAmountBoxActive: {
    backgroundColor: GatiMitraColors.mintSoft,
    borderColor: CX.mint,
    borderWidth: 2,
  },
  donationAmountBoxText: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary },
  donationAmountBoxTextActive: { color: CX.mint, fontWeight: "800" },
  donationChip: {
    minWidth: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.softBackground,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  donationChipActive: { backgroundColor: GatiMitraColors.mintSoft, borderColor: CX.mint },
  donationChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  donationChipTextActive: { color: CX.mint, fontWeight: "700" },
  donationInputRow: { marginTop: 10 },
  donationInput: {
    borderWidth: 2,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    backgroundColor: "#fff",
  },
  tipCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraColors.emerald,
    overflow: "hidden",
    ...GatiMitraColors.elevationShadow,
  },
  tipCardHeader: { flexDirection: "row", alignItems: "flex-start" },
  tipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraColors.warningAmberBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  tipCardTitleWrap: { flex: 1, minWidth: 0 },
  tipCardTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  tipCardSub: { fontSize: 12, color: GatiMitraColors.textSecondary, marginTop: 3 },
  tipBoxLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 7,
  },
  tipAmountBoxRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tipAmountBox: {
    minWidth: 52,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  tipAmountBoxActive: {
    backgroundColor: GatiMitraColors.warningAmberBg,
    borderColor: GatiMitraColors.warmOrange,
    borderWidth: 2,
  },
  tipAmountBoxText: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary },
  tipAmountBoxTextActive: { color: GatiMitraColors.warmOrange, fontWeight: "800" },
  tipChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  tipChip: {
    minWidth: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.softBackground,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tipChipPressed: { opacity: 0.9 },
  tipChipActive: { backgroundColor: CX.mint, borderColor: CX.mint },
  tipChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  tipChipTextActive: { color: "#fff" },
  customTipInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 14,
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
    paddingTop: 18,
  },
  paymentSheetTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraColors.textPrimary, marginBottom: 5 },
  paymentSheetSubtitle: { fontSize: 12, color: GatiMitraColors.textSecondary, marginBottom: SPACING },
  paymentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  paymentOptionActive: { backgroundColor: GatiMitraColors.mintSoft },
  paymentOptionText: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  simulatedPaymentSheet: { maxWidth: 320 },
  simulatedPaymentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
    paddingHorizontal: 20,
  },
  simulatedPaymentCardWrap: { width: "100%", maxWidth: 320 },
  simulatedPaymentCard: {
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    ...GatiMitraColors.elevationShadow,
    shadowRadius: 14,
    elevation: 5,
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
    flexDirection: "row",
    backgroundColor: CX.mint,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  simulatedConfirmBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  simulatedFailBtn: {
    flexDirection: "row",
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  simulatedFailBtnText: { fontSize: 16, fontWeight: "700", color: "#dc2626" },
  simulatedBtnDisabled: { opacity: 0.55 },
  simulatedCancelBtn: { paddingVertical: 12, alignItems: "center" },
  simulatedCancelBtnText: { fontSize: 15, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  fixedBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#F5F6F8",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    zIndex: 50,
    ...GatiMitraColors.elevationShadow,
  },
  footerRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  // Delivery / Takeaway segmented control (reference: white shell, light pink border, magenta active half)
  deliveryTypeToggle: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 0,
    width: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    borderWidth: 1,
    borderColor: DELIVERY_TOGGLE_BORDER,
    padding: 4,
    gap: 0,
  },
  deliveryTypeSeg: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 4,
    backgroundColor: "transparent",
  },
  deliveryTypeSegActive: {
    backgroundColor: DELIVERY_TOGGLE_ACTIVE,
  },
  deliveryTypeSegText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.2,
  },
  deliveryTypeSegTextActive: { color: "#FFFFFF" },
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
  footerCtaSlot: {
    flexShrink: 0,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 54,
    ...GatiMitraColors.cardShadowSoft,
  },
  footerCtaSlotDisabled: {
    flexShrink: 0,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
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
  ctaDisabledText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  ctaDisabledLabel: { fontSize: 14, fontWeight: "700", color: "#fff" },
  ctaDisabledHint: { fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  ctaTouch: { borderRadius: CARD_RADIUS, overflow: "hidden", ...GatiMitraColors.cardShadowSoft },
  ctaTouchPressed: { opacity: 0.96 },
  ctaGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minWidth: 0,
    gap: 10,
  },
  ctaLeftPart: { alignItems: "flex-start", flexShrink: 0, minWidth: 68 },
  ctaTotalAmount: { fontSize: 15, fontWeight: "800", color: "#fff" },
  ctaTotalLabel: { fontSize: 9, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  ctaRightPart: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 90 },
  ctaLabel: { fontSize: 14, fontWeight: "700", color: "#fff" },
  ctaAmount: { fontSize: 15, fontWeight: "800", color: "#fff" },
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
  couponModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  couponModalTitle: { fontSize: 17, fontWeight: "700", color: GatiMitraColors.textPrimary },
  couponApplyRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  couponCodeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
  },
  couponApplyBtn: {
    backgroundColor: CX.mint,
    paddingHorizontal: 18,
    borderRadius: 10,
    justifyContent: "center",
  },
  couponApplyBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  couponError: { fontSize: 12, color: GatiMitraColors.errorRed, marginBottom: 8 },
  couponSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraColors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  couponSectionHint: { fontSize: 11, color: GatiMitraColors.textSecondary, marginBottom: 7, lineHeight: 15 },
  couponLoadingWrap: { paddingVertical: 24, alignItems: "center", gap: 10 },
  couponLoadingText: { fontSize: 13, color: GatiMitraColors.textSecondary },
  couponEmptyText: { fontSize: 14, color: GatiMitraColors.textSecondary, paddingVertical: 16, textAlign: "center" },
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
