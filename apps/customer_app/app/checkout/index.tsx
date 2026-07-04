/**
 * GatiMitra Checkout — premium, production-level food delivery experience.
 * Single compact header, order summary with thumbnails, delivery card, coupons,
 * bill summary, optional contributions (tip + donation), inline payment, Place Order CTA.
 * No COD. No duplicate headers. All data backend-driven.
 */

import React, { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
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
  Animated as RNAnimated,
} from "react-native";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { resolveTabBarBottomInset } from "@/constants/layout";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCartStore, type CartItem } from "@/store/cartStore";
import { useLocationStore, getDeviceLocationReadiness } from "@/store/locationStore";
import { LegalFooter, LegalLink } from "@/components/LegalLinks";
import { BrandingFooter } from "@/components/BrandingFooter";
import { useOrderStore } from "@/store/orderStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";
import { orderService } from "@/services/order.service";
import { billingService, type BillingLine, type CalculateBillResponse } from "@/services/billing.service";
import { previewEtaRange, formatEtaRange } from "@/lib/etaPreview";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { applyWeatherToEtaRange } from "@/services/weather.service";
import { paymentService } from "@/services/payment.service";
import { addressService, type Address } from "@/services/address.service";
import { shareAddressViaLink } from "@/services/addressShare.service";
import { profileService } from "@/services/profile.service";
import { RazorpayCheckoutModal, type RazorpayPaymentResult, type RazorpayOrderParams } from "@/components/RazorpayCheckoutModal";
import { merchantService, type MerchantSummary, type MenuItem } from "@/services/merchant.service";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DEFAULT_STATUS_BAR_HEIGHT, STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { haversineKm, SERVICE_RADIUS_KM } from "@/lib/billSummary";
import { matchSavedAddressIdNearCoords } from "@/lib/deliveryDropResolution";
import {
  buildDeliveryInstructionsList,
  parseDeliveryInstructionsList,
} from "@/lib/delivery-instructions";
import { seedOrderDetailCache } from "@/lib/orderDetailCache";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { reverseGeocode } from "@/services/location.service";
import { getRoute } from "@/services/distance.service";
import { checkoutRouterBack } from "@/lib/safeRouterBack";
import { useCheckoutPresentation } from "@/lib/checkoutPresentation";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { isNetworkError, getNetworkErrorMessage } from "@/utils/networkError";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CouponApplyCelebration } from "@/components/checkout/CouponApplyCelebration";
import { CouponAvailableBottomSheet } from "@/components/checkout/CouponAvailableBottomSheet";
import { BillSummarySheet } from "@/components/checkout/BillSummarySheet";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { CheckoutGatiCashWalletBar } from "@/components/checkout/CheckoutGatiCashWalletBar";
import { CheckoutMissedOfferWalletCard } from "@/components/checkout/CheckoutMissedOfferWalletCard";
import { MissedOfferUnlockSheet } from "@/components/checkout/MissedOfferUnlockSheet";
import { MissedOfferWalletCelebration } from "@/components/checkout/MissedOfferWalletCelebration";
import {
  resolveMissedOfferWalletCompensation,
  missedOfferKeyForCandidate,
  listMissedOfferWalletCandidates,
  type MissedOfferWalletCompensation,
} from "@/lib/checkout-missed-offer-wallet";
import {
  DonateWithBottomSheet,
  type DonationScope,
} from "@/components/checkout/DonateWithBottomSheet";
import {
  CheckoutGratitudeSections,
  BILL_SUMMARY_SHEET_HEIGHT_RATIO,
} from "@/components/checkout/CheckoutGratitudeSections";
import { CheckoutOffersSheet } from "@/components/checkout/CheckoutOffersSheet";
import {
  useCouponAvailablePrompt,
  type CouponAvailablePrompt,
} from "@/hooks/useCouponAvailablePrompt";
import {
  isSubscriptionBenefitDiscount,
  splitCheckoutDiscounts,
} from "@/lib/checkout-discount-display";
import { useCheckoutOfferStore } from "@/store/checkoutOfferStore";
import { useAuthStore } from "@/store/authStore";
import { walletService } from "@/services/wallet.service";
import { DeliveryPartnerInstructionSheet } from "@/components/address/DeliveryPartnerInstructionSheet";
import { cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import {
  prefetchMenuItemFullConfig,
  prefetchMenuItemFullConfigsForMenu,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import {
  useCheckoutSubscriptionPlan,
  useCurrentSubscription,
} from "@/hooks/useCustomerSubscription";
import {
  buildAddPlanCopy,
  formatPlanPriceLine,
} from "@/services/subscription.service";
import { hydrateSubscriptionPlansCache, prefetchSubscriptionPlans } from "@/lib/subscriptionCache";
import {
  buildCheckoutShareMessage,
  buildMerchantShareUrl,
} from "@/lib/merchantShare";

/** Wait before POST /billing/calculate after tip/donation slider moves. */
const BILLING_INPUT_DEBOUNCE_MS = 400;

function roundBillAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePlanHexColor(hex: string | null | undefined, fallback = "#059669"): string {
  const value = hex?.trim();
  if (value && /^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return fallback;
}

function planHexWithAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
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

function isSubscriptionDisplayCharge(c: BillingLine): boolean {
  if (c.hidden || c.amount <= 0.005) return false;
  if (c.meta?.source === "customer_subscription_delivery_waived_marker") return false;
  if (c.label === "__delivery_fee_waived_inr__") return false;
  const lbl = (c.label || "").toLowerCase();
  return (
    lbl.includes("gmitra") ||
    lbl.includes("plus") ||
    lbl.includes("gold") ||
    lbl.includes("subscription")
  );
}

/** One subscription row in bill UI — prefer DB checkout charge over generic rules. */
function pickSubscriptionBillCharges(charges: BillingLine[] | undefined): BillingLine[] {
  const list = charges ?? [];
  const checkout = list.find(
    (c) => c.meta?.source === "customer_subscription_checkout" && c.amount > 0.005 && !c.hidden
  );
  if (checkout) return [checkout];
  const matches = list.filter(isSubscriptionDisplayCharge);
  if (matches.length <= 1) return matches;
  const named = matches.find((c) => !/^subscription fee$/i.test(c.label.trim()));
  return [named ?? matches[0]];
}

function subscriptionDisplayTotal(charges: BillingLine[]): number {
  return roundBillAmount(charges.reduce((s, c) => s + c.amount, 0));
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

/** One-line summary in the checkout card (GatiMitra-style). */
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

/** Max tip amount (₹) sent to billing. */
const TIP_SLIDER_MAX = 60;

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
        <CheckoutText
          style={restaurantNoteMarqueeStyles.text}
          onLayout={(e) => {
            textW.current = e.nativeEvent.layout.width;
          }}
          numberOfLines={1}
        >
          {note}
        </CheckoutText>
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
 * Footer row: fixed-width toggle + flex CTA (`footerCtaFlex`) so the row never overflows.
 * Toggle segments use `overflow: hidden` so active fill stays inside rounded corners.
 */
const CHECKOUT_FOOTER_H_PAD = 24;
/** Horizontal inset for header, scroll sections, and footer — keeps content off screen edges. */
const CHECKOUT_PAGE_H_MARGIN = 12;
const CHECKOUT_FOOTER_TOGGLE_WIDTH = 132;
const CHECKOUT_FOOTER_GAP = 20;
/** Extra inset so the CTA does not hug the toggle on the left. */
const CHECKOUT_FOOTER_CTA_LEFT_INSET = 6;
/** Same outer radius as `deliveryTypeToggle` (not a full pill). */
const CHECKOUT_FOOTER_CTA_RADIUS = 14;
/** Scroll clearance for fixed footer (toggle + legal) without GatiCash row — keep in sync with `fixedBottom`. */
const CHECKOUT_SCROLL_FOOTER_BASE = 108;
/** Extra scroll inset when GatiCash wallet bar is visible above the place-order row. */
const CHECKOUT_SCROLL_GATICASH_BAR_EXTRA = 76;
/** Breathing room so `BrandingFooter` tagline + watermark sit fully above the fixed footer. */
const CHECKOUT_SCROLL_BRANDING_CLEARANCE = 20;

export default function CheckoutScreen() {
  const router = useRouter();
  const { variant: checkoutVariant, onSheetClose } = useCheckoutPresentation();
  const isCheckoutSheet = checkoutVariant === "sheet";
  const insets = useAppSafeAreaInsets();
  const rawInsets = useSafeAreaInsets();
  const checkoutHeaderTopPadding = useMemo(() => {
    const statusBarTopInset = rawInsets.top > 0 ? rawInsets.top : DEFAULT_STATUS_BAR_HEIGHT;
    return statusBarTopInset + (isCheckoutSheet ? 12 : STATUS_BAR_TO_HEADER_GAP);
  }, [isCheckoutSheet, rawInsets.top]);
  const footerBottomInset = Math.max(resolveTabBarBottomInset(rawInsets.bottom), 8);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const missedOfferSheetPromptKeyRef = useRef<string | null>(null);
  const pendingMissedOfferWalletRef = useRef<import("@/lib/checkout-missed-offer-wallet").MissedOfferWalletCompensation | null>(null);

  useLayoutEffect(() => {
    void hydrateSubscriptionPlansCache(queryClient);
  }, [queryClient]);

  useEffect(() => {
    void prefetchSubscriptionPlans(queryClient);
  }, [queryClient]);

  const { items, merchantId, merchantName, updateQuantity, clearCart, syncPricesFromMap } = useCartStore();
  const handleCheckoutBack = useCallback(() => {
    if (isCheckoutSheet && onSheetClose) {
      onSheetClose();
      return;
    }
    checkoutRouterBack(router, merchantId);
  }, [isCheckoutSheet, onSheetClose, router, merchantId]);
  useEnsureStoreLiveStatus(merchantId ?? null);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const storeStatus = useStoreStatusStore((s) =>
    merchantId ? (s.statusMap[merchantId] ?? null) : null
  );
  const isStoreClosed = storeStatus === "CLOSED";
  const { checkoutPlan, defaultPrice, hasPlans } = useCheckoutSubscriptionPlan();
  const { data: currentSubscription } = useCurrentSubscription(true);
  const alreadySubscribed = currentSubscription?.active === true;
  const showSubscriptionPromo = hasPlans && !alreadySubscribed && checkoutPlan != null;
  const subscriptionPlanName = checkoutPlan?.planName ?? checkoutPlan?.name ?? "Membership";
  const subscriptionAccentColor = useMemo(
    () => normalizePlanHexColor(checkoutPlan?.badgeColor),
    [checkoutPlan?.badgeColor]
  );
  const subscriptionAttachTheme = useMemo(
    () => ({
      softBg: planHexWithAlpha(subscriptionAccentColor, "18"),
      border: planHexWithAlpha(subscriptionAccentColor, "55"),
      accent: subscriptionAccentColor,
    }),
    [subscriptionAccentColor]
  );

  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("upi");
  /** Delivery / Self pickup toggle. Self pickup waives the delivery fee server-side. */
  const [deliveryType, setDeliveryType] = useState<"delivery" | "self_pickup">("delivery");
  const [tipSliderValue, setTipSliderValue] = useState(0);
  const [tipCustomMode, setTipCustomMode] = useState(false);
  const [tipCustomInput, setTipCustomInput] = useState("");
  const [donationEnabled, setDonationEnabled] = useState(false);
  const [subscriptionOptIn, setSubscriptionOptIn] = useState(false);
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] = useState<"weekly" | "monthly" | "yearly">("monthly");
  useEffect(() => {
    if (defaultPrice?.billingCycle === "weekly" || defaultPrice?.billingCycle === "monthly" || defaultPrice?.billingCycle === "yearly") {
      setSubscriptionBillingCycle(defaultPrice.billingCycle);
    }
  }, [checkoutPlan?.id, defaultPrice?.billingCycle]);

  useEffect(() => {
    if (!showSubscriptionPromo) setSubscriptionOptIn(false);
  }, [showSubscriptionPromo]);

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
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [addressSheetBusyId, setAddressSheetBusyId] = useState<number | null>(null);
  const [receiverSheetVisible, setReceiverSheetVisible] = useState(false);
  const [communityInitiativeSheetVisible, setCommunityInitiativeSheetVisible] = useState(false);
  const [donateWithSheetVisible, setDonateWithSheetVisible] = useState(false);
  const [donationScope, setDonationScope] = useState<DonationScope>("every_order");
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
  const [useGatiCashWallet, setUseGatiCashWallet] = useState(false);
  const [missedOfferWalletPending, setMissedOfferWalletPending] = useState(false);
  const [selectedMissedOfferKey, setSelectedMissedOfferKey] = useState<string | null>(null);
  const [missedOfferSheetVisible, setMissedOfferSheetVisible] = useState(false);
  const [missedOfferCelebration, setMissedOfferCelebration] =
    useState<MissedOfferWalletCompensation | null>(null);
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
  const instructionsHydratedForAddressRef = useRef<number | null>(null);
  /** Latest checkout ETA preview — read in order-success callbacks (mutations defined above useMemo). */
  const checkoutDeliveryEtaRef = useRef({ label: "", etaMaxMinutes: 0 });

  const { data: addresses = [], isLoading: addressesLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
  });

  const { data: userProfile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
    staleTime: 60_000,
  });

  const authSession = useAuthStore((s) => s.session);
  const authHydrated = useAuthStore((s) => s.hydrated);

  const gatiCashBalanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
    enabled: authHydrated && !!authSession,
    staleTime: 60_000,
    retry: false,
  });

  const gatiCashAvailable = useMemo(() => {
    const raw = gatiCashBalanceQ.data?.available_balance ?? gatiCashBalanceQ.data?.balance ?? 0;
    return roundBillAmount(Math.max(0, raw));
  }, [gatiCashBalanceQ.data?.available_balance, gatiCashBalanceQ.data?.balance]);

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
      if (isCheckoutSheet) return;
      setStatusBarBackground(CHECKOUT_HEADER_BG);
      return () => resetStatusBarBackground();
    }, [isCheckoutSheet, setStatusBarBackground, resetStatusBarBackground])
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

  const saveDeliveryPartnerInstructions = useCallback(
    async (list: string[]) => {
      if (!selectedAddress) return;
      await addressService.updateAddress(selectedAddress.id, { deliveryInstructionsList: list });
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      instructionsHydratedForAddressRef.current = selectedAddress.id;
      const parsed = parseDeliveryInstructionsList(list);
      setDeliveryPartnerNote(parsed.note);
      setLeaveAtDoor(parsed.leaveAtDoor);
      setInstrLeaveWithGuard(parsed.leaveWithGuard);
      setInstrAvoidCalling(parsed.avoidCalling);
      setInstrDontRingBell(parsed.dontRingBell);
      setInstrPetAtHome(parsed.petAtHome);
    },
    [queryClient, selectedAddress]
  );

  const checkoutDeliveryInstructionSeed = useMemo(
    () =>
      buildDeliveryInstructionsList({
        note: deliveryPartnerNote,
        leaveAtDoor,
        leaveWithGuard: instrLeaveWithGuard,
        avoidCalling: instrAvoidCalling,
        dontRingBell: instrDontRingBell,
        petAtHome: instrPetAtHome,
      }),
    [
      deliveryPartnerNote,
      leaveAtDoor,
      instrLeaveWithGuard,
      instrAvoidCalling,
      instrDontRingBell,
      instrPetAtHome,
    ]
  );

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
        const readiness = await getDeviceLocationReadiness();
        if (!readiness.isReady) {
          useLocationStore.getState().promptLocationPermissionIfNeeded({ force: true });
          return;
        }
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

  // Auto-create delivery address from current location when user has no saved addresses (GatiMitra/Swiggy style).
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
    try {
      await shareAddressViaLink(addr);
    } catch {
      Alert.alert("Share failed", "Could not create address link. Please try again.");
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

  /** Client-side estimate — checkout-offers prefers server bill subtotal when loaded. */
  const clientCartSubtotalForOffers = useMemo(
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

  /** Reset tip when opening checkout for a store — never carry over from scroll glitches. */
  useEffect(() => {
    setTipSliderValue(0);
    setTipCustomMode(false);
    setTipCustomInput("");
  }, [merchantId]);

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

  const handleBillTipSelect = useCallback((amount: number) => {
    setTipCustomMode(false);
    setTipCustomInput("");
    setTipSliderValue(amount);
  }, []);

  const handleBillTipCustomMode = useCallback(() => {
    setTipCustomMode(true);
    const n = parseFloat(tipCustomInput);
    setTipSliderValue(Number.isFinite(n) ? Math.min(TIP_SLIDER_MAX, Math.max(0, Math.round(n))) : 0);
  }, [tipCustomInput]);

  const handleBillTipCustomInputChange = useCallback((v: string) => {
    setTipCustomInput(v);
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    setTipSliderValue(Number.isFinite(n) ? Math.min(TIP_SLIDER_MAX, Math.max(0, Math.round(n))) : 0);
  }, []);

  const handleDonationPresetPress = useCallback(
    (amt: 5 | 10 | 15 | "custom") => {
      if (donationEnabled && donationPreset === amt) {
        clearCheckoutDonation();
        return;
      }
      setDonationEnabled(true);
      setDonationPreset(amt);
      if (amt !== "custom") setDonationAmount(String(amt));
      else setDonationAmount("");
    },
    [donationEnabled, donationPreset, clearCheckoutDonation]
  );

  const checkoutGratitudeProps = useMemo(
    () => ({
      tipValue,
      onTipSelect: handleBillTipSelect,
      tipCustomMode,
      onTipCustomMode: handleBillTipCustomMode,
      tipCustomInput,
      onTipCustomInputChange: handleBillTipCustomInputChange,
      donationEnabled,
      donationPreset,
      donationAmount,
      onDonationPresetPress: handleDonationPresetPress,
      onDonationClear: clearCheckoutDonation,
      onDonationAmountChange: setDonationAmount,
      onFeedingInfoPress: () => setCommunityInitiativeSheetVisible(true),
      onDonateEveryOrderPress: () => setDonateWithSheetVisible(true),
      donationScope,
    }),
    [
      tipValue,
      handleBillTipSelect,
      tipCustomMode,
      handleBillTipCustomMode,
      tipCustomInput,
      handleBillTipCustomInputChange,
      donationEnabled,
      donationPreset,
      donationAmount,
      handleDonationPresetPress,
      clearCheckoutDonation,
      donationScope,
    ]
  );

  const billSummarySheetMaxHeight = useMemo(
    () => Math.min(640, Math.round(windowHeight * BILL_SUMMARY_SHEET_HEIGHT_RATIO)),
    [windowHeight]
  );

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
      subscriptionBillingCycle,
      checkoutPlan?.id,
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
          subscriptionOptIn: showSubscriptionPromo ? subscriptionOptIn : undefined,
          subscriptionPlanId: showSubscriptionPromo && subscriptionOptIn ? checkoutPlan?.id : undefined,
          subscriptionBillingCycle:
            showSubscriptionPromo && subscriptionOptIn ? subscriptionBillingCycle : undefined,
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

  /** Authoritative item + add-on subtotal for offer min-cart gates (matches POST /billing/calculate). */
  const cartSubtotalForOffers = useMemo(() => {
    if (serverBill) {
      const serverItems = (serverBill.itemTotal ?? 0) + (serverBill.addonTotal ?? 0);
      if (serverItems > 0.005) return serverItems;
    }
    return clientCartSubtotalForOffers;
  }, [serverBill, clientCartSubtotalForOffers]);

  /** Store→drop km from backend routing (authoritative for pricing); client route is for UI hint only. */
  const serverDistanceKm = serverBill?.distanceKm ?? null;
  /** Distance shown to user in checkout, always backend-computed. */
  const uiDistanceKm = serverDistanceKm ?? routeDistanceKm;
  /** Serviceability comes from the server (respects store.delivery_radius_km + env fallback),
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

  const { subscriptionBenefits: subscriptionBenefitDiscounts, checkoutPromos: checkoutPromoDiscounts } =
    useMemo(() => splitCheckoutDiscounts(visibleDiscounts), [visibleDiscounts]);

  const subscriptionBenefitSavings = useMemo(
    () => subscriptionBenefitDiscounts.reduce((sum, d) => sum + (d.amount ?? 0), 0),
    [subscriptionBenefitDiscounts]
  );

  const checkoutOffersQuery = useQuery({
    queryKey: [
      "billing-checkout-offers",
      merchantId,
      selectedAddress?.id,
      cartSubtotalForOffers,
      livePincode,
      liveState,
      subscriptionBenefitSavings,
      selectedPlatformOfferId,
      selectedMerchantOfferId,
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

  const primaryCheckoutDiscount = useMemo(() => {
    if (checkoutPromoDiscounts.length === 0) return null;
    return [...checkoutPromoDiscounts].sort((a, b) => b.amount - a.amount)[0];
  }, [checkoutPromoDiscounts]);

  const couponDiscountAmount = useMemo(() => {
    if (!appliedCouponCode || !primaryCheckoutDiscount) return 0;
    if (!discountMatchesCoupon(primaryCheckoutDiscount.label, appliedCouponCode, appliedCouponLabel)) {
      return 0;
    }
    return primaryCheckoutDiscount.amount;
  }, [primaryCheckoutDiscount, appliedCouponCode, appliedCouponLabel]);

  const checkoutSavingsTotal =
    serverBill && serverBill.discountTotal > 0.005 ? serverBill.discountTotal : 0;

  const missedOffersFingerprint = useMemo(
    () =>
      listMissedOfferWalletCandidates(checkoutOffersQuery.data, cartSubtotalForOffers)
        .map((c) => `${c.source}:${c.id}`)
        .join("|"),
    [checkoutOffersQuery.data, cartSubtotalForOffers]
  );

  const missedOfferWalletComp = useMemo(
    () =>
      resolveMissedOfferWalletCompensation(
        checkoutOffersQuery.data,
        merchantId,
        cartSubtotalForOffers,
        deliveryType,
        selectedMissedOfferKey
      ),
    [checkoutOffersQuery.data, merchantId, cartSubtotalForOffers, deliveryType, selectedMissedOfferKey]
  );

  useEffect(() => {
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferSheetVisible(false);
    missedOfferSheetPromptKeyRef.current = null;
  }, [missedOffersFingerprint, merchantId]);

  const displayMissedOfferWalletComp = useMemo(() => {
    if (missedOfferWalletPending && pendingMissedOfferWalletRef.current) {
      return pendingMissedOfferWalletRef.current;
    }
    return missedOfferWalletComp;
  }, [missedOfferWalletPending, missedOfferWalletComp]);

  const missedOfferWalletPendingAmount = useMemo(() => {
    if (!missedOfferWalletPending || !displayMissedOfferWalletComp) return 0;
    return displayMissedOfferWalletComp.amountInr;
  }, [missedOfferWalletPending, displayMissedOfferWalletComp]);

  const openMissedOfferUnlockSheet = useCallback(() => {
    if (missedOfferWalletComp?.key) {
      setSelectedMissedOfferKey(missedOfferWalletComp.key);
    }
    setMissedOfferSheetVisible(true);
  }, [missedOfferWalletComp?.key]);

  const handleMissedOfferAddMoreItems = useCallback(() => {
    setMissedOfferSheetVisible(false);
    if (merchantId) {
      router.push(`/home/merchant/${merchantId}` as never);
    } else {
      checkoutRouterBack(router, merchantId);
    }
  }, [merchantId, router]);

  const handleUnlockMissedOfferFromSheet = useCallback(
    (source: "platform" | "merchant", offerId: number) => {
      if (!merchantId) return;
      const key = missedOfferKeyForCandidate({ source, id: offerId }, merchantId);

      if (missedOfferWalletPending) {
        if (pendingMissedOfferWalletRef.current?.key === key) {
          setCouponSheetVisible(false);
          setMissedOfferSheetVisible(false);
          return;
        }
        if (!authSession) {
          Alert.alert("Sign in required", "Please sign in to add GatiCash for this offer.");
          return;
        }
        const nextComp = resolveMissedOfferWalletCompensation(
          checkoutOffersQuery.data,
          merchantId,
          cartSubtotalForOffers,
          deliveryType,
          key
        );
        if (!nextComp) return;

        pendingMissedOfferWalletRef.current = nextComp;
        setSelectedMissedOfferKey(key);
        setMissedOfferWalletPending(true);
        setMissedOfferCelebration(nextComp);
        setCouponSheetVisible(false);
        setMissedOfferSheetVisible(false);
        return;
      }

      setSelectedMissedOfferKey(key);
      setCouponSheetVisible(false);
      setMissedOfferSheetVisible(true);
    },
    [
      merchantId,
      missedOfferWalletPending,
      authSession,
      checkoutOffersQuery.data,
      cartSubtotalForOffers,
      deliveryType,
    ]
  );

  const handleSelectMissedOfferWallet = useCallback(() => {
    if (!missedOfferWalletComp || missedOfferWalletPending) return;
    if (!authSession) {
      Alert.alert("Sign in required", "Please sign in to add GatiCash for this offer.");
      return;
    }
    pendingMissedOfferWalletRef.current = missedOfferWalletComp;
    setMissedOfferWalletPending(true);
    setSelectedMissedOfferKey(missedOfferWalletComp.key);
    setMissedOfferCelebration(missedOfferWalletComp);
    setMissedOfferSheetVisible(false);
  }, [missedOfferWalletComp, missedOfferWalletPending, authSession]);

  const handleRemoveMissedOfferWallet = useCallback(() => {
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferSheetVisible(false);
    setMissedOfferCelebration(null);
  }, []);

  const fulfillPendingMissedOfferWallet = useCallback(async () => {
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    void queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] });
  }, [queryClient]);

  const featuredCoupon = useMemo(() => {
    const list = checkoutOffersQuery.data?.coupons?.filter((c) => c.code !== appliedCouponCode) ?? [];
    return list[0] ?? null;
  }, [checkoutOffersQuery.data?.coupons, appliedCouponCode]);

  const appliedPlatformOfferId = useMemo(() => {
    for (const d of checkoutPromoDiscounts) {
      const id = d.meta?.platformOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    return billingQuery.isFetching ? selectedPlatformOfferId : null;
  }, [checkoutPromoDiscounts, billingQuery.isFetching, selectedPlatformOfferId]);

  const appliedMerchantOfferId = useMemo(() => {
    for (const d of checkoutPromoDiscounts) {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    return billingQuery.isFetching ? selectedMerchantOfferId : null;
  }, [checkoutPromoDiscounts, billingQuery.isFetching, selectedMerchantOfferId]);

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

  const subscriptionBenefitRows = useMemo(
    () =>
      subscriptionBenefitDiscounts.map((d) => ({
        label: d.label,
        amount: d.amount,
      })),
    [subscriptionBenefitDiscounts]
  );

  const offersAppliedHeadline = useMemo(() => {
    if (missedOfferWalletPending && displayMissedOfferWalletComp) {
      return `${displayMissedOfferWalletComp.offerTitle} unlocked`;
    }

    const subLabel = subscriptionBenefitDiscounts[0]?.label;
    const subSave = subscriptionBenefitSavings;

    if (primaryCheckoutDiscount) {
      const promoSave = primaryCheckoutDiscount.amount;
      if (subSave > 0.005 && subLabel) {
        return `You saved ₹${Math.round(promoSave + subSave)} with ${primaryCheckoutDiscount.label} + free delivery`;
      }
      if (promoSave > 0.005) {
        return `You saved ₹${Math.round(promoSave)} with ${primaryCheckoutDiscount.label}`;
      }
      return `${primaryCheckoutDiscount.label} applied!`;
    }

    if (subSave > 0.005 && subLabel) {
      return `You saved ₹${Math.round(subSave)} with ${subLabel}`;
    }

    if (appliedCouponCode) {
      return `${appliedCouponLabel ?? appliedCouponCode} applied`;
    }

    if (featuredCoupon) {
      return featuredCoupon.description || `Save more with '${featuredCoupon.code}'`;
    }

    return "Apply a coupon to save on this order";
  }, [
    primaryCheckoutDiscount,
    subscriptionBenefitDiscounts,
    subscriptionBenefitSavings,
    appliedCouponCode,
    appliedCouponLabel,
    featuredCoupon,
    missedOfferWalletPending,
    displayMissedOfferWalletComp,
  ]);

  const offersAppliedSubline = useMemo(() => {
    if (missedOfferWalletPending && displayMissedOfferWalletComp) {
      return `Saving ₹${Math.round(displayMissedOfferWalletComp.offerSavingsInr)} on this order · ₹${Math.round(displayMissedOfferWalletComp.amountInr)} to GatiCash after order`;
    }
    return null;
  }, [missedOfferWalletPending, displayMissedOfferWalletComp]);

  const hasMissedOfferUnlocked = Boolean(missedOfferWalletPending && displayMissedOfferWalletComp);

  const hasAppliedCheckoutPromo = Boolean(
    primaryCheckoutDiscount || appliedCouponCode || appliedPlatformOfferId || appliedMerchantOfferId
  );

  const hasCheckoutOfferSavings =
    hasAppliedCheckoutPromo || subscriptionBenefitSavings > 0.005 || hasMissedOfferUnlocked;

  /** Align coupon/offer picker with server bill — one checkout promo at a time (subscription free delivery stacks). */
  useEffect(() => {
    if (!serverBill || billingQuery.isFetching) return;

    const { checkoutPromos } = splitCheckoutDiscounts(serverBill.discounts ?? []);
    if (checkoutPromos.length === 0) {
      if (forceNoAutoOffer) {
        if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
        if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
        if (appliedCouponCode) {
          setAppliedCouponCode(null);
          setAppliedCouponLabel(null);
        }
        return;
      }

      // Membership free delivery is not a checkout promo — never keep ghost coupon codes.
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }

      if (subscriptionBenefitDiscounts.length === 0) {
        if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
        if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
      }
      return;
    }

    const primary = [...checkoutPromos].sort((a, b) => b.amount - a.amount)[0];
    if (isSubscriptionBenefitDiscount(primary)) return;

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

    if (couponCode && !isSubscriptionBenefitDiscount(primary)) {
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
    forceNoAutoOffer,
    subscriptionBenefitDiscounts.length,
  ]);

  /** Surface when an explicitly picked platform/store promo did not land on the bill. */
  useEffect(() => {
    if (!serverBill || billingQuery.isFetching) return;
    const { checkoutPromos } = splitCheckoutDiscounts(serverBill.discounts ?? []);
    if (selectedPlatformOfferId != null) {
      const applied = checkoutPromos.some(
        (d) =>
          typeof d.meta?.platformOfferId === "number" &&
          d.meta.platformOfferId === selectedPlatformOfferId
      );
      if (!applied) {
        setCouponApplyError("This offer could not be applied. Check minimum order or try another offer.");
      } else {
        setCouponApplyError(null);
      }
      return;
    }
    if (selectedMerchantOfferId != null) {
      const applied = checkoutPromos.some(
        (d) =>
          typeof d.meta?.merchantOfferId === "number" &&
          d.meta.merchantOfferId === selectedMerchantOfferId
      );
      if (!applied) {
        setCouponApplyError("This store offer could not be applied. Check eligibility or try another offer.");
      } else {
        setCouponApplyError(null);
      }
    }
  }, [
    serverBill,
    billingQuery.isFetching,
    billingQuery.dataUpdatedAt,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
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
    setCouponApplyError(null);
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

  const consumePendingCheckoutOffer = useCheckoutOfferStore((s) => s.consumePending);

  useEffect(() => {
    const pending = consumePendingCheckoutOffer();
    if (!pending) return;
    if (pending.type === "coupon" && pending.couponCode?.trim()) {
      applyCouponCode(pending.couponCode.trim(), pending.couponLabel ?? undefined);
    } else if (pending.type === "merchant" && pending.merchantOfferId != null) {
      applyMerchantOfferById(pending.merchantOfferId, pending.couponCode);
    } else if (pending.type === "platform" && pending.platformOfferId != null) {
      applyPlatformOfferById(pending.platformOfferId, null);
    }
  }, [consumePendingCheckoutOffer, applyCouponCode, applyMerchantOfferById, applyPlatformOfferById]);

  const hasAppliedCheckoutOffer = Boolean(
    appliedCouponCode || selectedPlatformOfferId || selectedMerchantOfferId
  );

  const couponAvailablePrompt = useCouponAvailablePrompt({
    offersData: checkoutOffersQuery.data,
    offersFetching: checkoutOffersQuery.isFetching,
    cartSubtotal: cartSubtotalForOffers,
    hasAppliedOffer: hasAppliedCheckoutOffer,
    blocked:
      checkoutVariant === "sheet" ||
      couponSheetVisible ||
      couponCelebrationVisible ||
      missedOfferCelebration != null ||
      billSummarySheetVisible ||
      gmitraPlusSheetVisible,
  });

  const handleCouponAvailableApply = useCallback(
    (p: CouponAvailablePrompt) => {
      couponAvailablePrompt.dismiss(p.key);
      if (p.applyType === "coupon") {
        applyCouponCode(p.couponCode, p.description);
        return;
      }
      if (p.applyType === "merchant" && p.merchantOfferId != null) {
        applyMerchantOfferById(p.merchantOfferId, p.couponCode);
        return;
      }
      if (p.applyType === "platform" && p.platformOfferId != null) {
        applyPlatformOfferById(p.platformOfferId, null);
      }
    },
    [couponAvailablePrompt, applyCouponCode, applyMerchantOfferById, applyPlatformOfferById]
  );

  useEffect(() => {
    if (
      !missedOffersFingerprint ||
      missedOfferWalletPending ||
      checkoutOffersQuery.isLoading ||
      billingQuery.isLoading ||
      couponSheetVisible ||
      couponAvailablePrompt.visible ||
      couponCelebrationVisible ||
      missedOfferCelebration != null
    ) {
      return;
    }
    if (missedOfferSheetPromptKeyRef.current === missedOffersFingerprint) return;
    missedOfferSheetPromptKeyRef.current = missedOffersFingerprint;
    const timer = setTimeout(() => setMissedOfferSheetVisible(true), 700);
    return () => clearTimeout(timer);
  }, [
    missedOffersFingerprint,
    missedOfferWalletPending,
    checkoutOffersQuery.isLoading,
    billingQuery.isLoading,
    couponSheetVisible,
    couponAvailablePrompt.visible,
    couponCelebrationVisible,
    missedOfferCelebration,
  ]);

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

  const deliveryFeeStrikeAmount = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return null;
    const waived = serverBill.deliveryFeeWaivedInr ?? 0;
    if (waived > 0.005) return waived;
    const quoted = serverBill.deliveryFeeQuotedInr ?? 0;
    if (serverBill.deliveryFee <= 0.005 && quoted > 0.005) return quoted;
    return null;
  }, [serverBill, deliveryType]);

  const showDeliveryFeeRow = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return false;
    return (
      serverBill.components.delivery.taxable_value > 0.005 ||
      (deliveryFeeStrikeAmount ?? 0) > 0.005
    );
  }, [serverBill, deliveryType, deliveryFeeStrikeAmount]);

  const billSubscriptionCharges = useMemo(
    () => pickSubscriptionBillCharges(serverBill?.charges),
    [serverBill?.charges]
  );

  const subscriptionDisplayMiscTotal = useMemo(
    () => subscriptionDisplayTotal(billSubscriptionCharges),
    [billSubscriptionCharges]
  );

  const deliveryFeeLabel = useMemo(() => {
    if (!serverBill) return "Delivery fee";
    const feeForLabel =
      deliveryFeeStrikeAmount ??
      serverBill.deliveryFee ??
      serverBill.components.delivery.taxable_value;
    if (feeForLabel <= 0.005) return "Delivery fee";
    const found = serverBill.charges.find(
      (c) =>
        c.kind === "charge" &&
        !c.hidden &&
        c.meta?.source !== "checkout_tipAmount" &&
        c.meta?.source !== "checkout_donationAmount" &&
        c.meta?.source !== "customer_subscription_delivery_waived_marker" &&
        c.label !== "__delivery_fee_waived_inr__" &&
        (Math.abs(c.amount - feeForLabel) < 0.05 ||
          Math.abs(c.amount - (serverBill.deliveryFeeQuotedInr ?? 0)) < 0.05)
    );
    const base = found?.label?.trim() || "Delivery fee";
    const km = uiDistanceKm;
    return km != null ? `${base} (${km.toFixed(1)} km)` : base;
  }, [serverBill, uiDistanceKm, deliveryFeeStrikeAmount]);

  /** Estimated delivery-fee savings with GMitra Plus — shown on attached promo row. */
  const gmitraPlusDeliverySave = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return null;
    const fee = Math.max(0, serverBill.deliveryFeeQuotedInr ?? serverBill.deliveryFee ?? 0);
    return fee > 0.005 ? Math.round(fee) : null;
  }, [serverBill, deliveryType]);

  const showGmitraPlusAttachRow = deliveryType === "delivery" && showSubscriptionPromo;

  const gmitraPlusPromoCopy = useMemo(
    () => {
      const addCopy =
        checkoutPlan && defaultPrice
          ? buildAddPlanCopy(checkoutPlan, defaultPrice)
          : `Add ${subscriptionPlanName}`;
      const freeDeliveryRadius = checkoutPlan?.maxFreeDeliveryRadiusKm ?? 7;
      return {
        offersTitle: subscriptionOptIn
          ? `${subscriptionPlanName} savings on this order`
          : gmitraPlusDeliverySave != null
            ? `Save ₹${gmitraPlusDeliverySave} with free delivery`
            : checkoutPlan?.headline ?? "Save extra with free delivery & offers",
        offersSub: subscriptionOptIn
          ? `${subscriptionPlanName} benefits are applied to your bill.`
          : addCopy,
        attachTitle: subscriptionOptIn
          ? `${subscriptionPlanName} applied on this order`
          : gmitraPlusDeliverySave != null
            ? `Save ₹${gmitraPlusDeliverySave} with free delivery`
            : checkoutPlan?.headline ?? "Save with free delivery & offers",
        attachSub: subscriptionOptIn
          ? "Member benefits are included in your bill."
          : addCopy,
        freeDeliveryNote: checkoutPlan?.freeDeliveryEnabled
          ? `Free delivery within ${freeDeliveryRadius} km`
          : null,
      };
    },
    [
      subscriptionOptIn,
      gmitraPlusDeliverySave,
      checkoutPlan,
      defaultPrice,
      subscriptionPlanName,
    ]
  );

  const gstAndOtherBreakdown = useMemo(() => {
    if (!serverBill) return null;
    const comp = serverBill.components;

    // Subscription row the bill renders outside (deduped checkout charge).
    const displayedMiscTotal = subscriptionDisplayMiscTotal;

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
  }, [serverBill, subscriptionDisplayMiscTotal]);

  const missedOfferUnlockDiscount = useMemo(() => {
    if (!missedOfferWalletPending || !displayMissedOfferWalletComp) return 0;
    return displayMissedOfferWalletComp.offerSavingsInr;
  }, [missedOfferWalletPending, displayMissedOfferWalletComp]);

  const gatiCashMaxApply = useMemo(() => {
    if (!serverBill || gatiCashAvailable <= 0.005) return 0;
    const base = roundBillAmount(serverBill.finalAmount - missedOfferUnlockDiscount);
    return Math.min(gatiCashAvailable, Math.max(0, base));
  }, [serverBill, gatiCashAvailable, missedOfferUnlockDiscount]);

  const gatiCashApplyAmount = useMemo(() => {
    if (!useGatiCashWallet || gatiCashMaxApply <= 0.005) return 0;
    return gatiCashMaxApply;
  }, [useGatiCashWallet, gatiCashMaxApply]);

  const showGatiCashWalletBar =
    gatiCashAvailable > 0.005 ||
    (gatiCashBalanceQ.isLoading && authHydrated && !!authSession);

  const checkoutScrollBottomInset = useMemo(
    () =>
      footerBottomInset +
      CHECKOUT_SCROLL_FOOTER_BASE +
      CHECKOUT_SCROLL_BRANDING_CLEARANCE +
      (showGatiCashWalletBar ? CHECKOUT_SCROLL_GATICASH_BAR_EXTRA : 0),
    [footerBottomInset, showGatiCashWalletBar]
  );

  const toPayAmount = useMemo(() => {
    if (serverBill == null) return undefined;
    const walletAdd =
      missedOfferWalletPending && missedOfferWalletPendingAmount > 0.005
        ? missedOfferWalletPendingAmount
        : 0;
    return Math.max(
      0,
      roundBillAmount(
        serverBill.finalAmount -
          gatiCashApplyAmount -
          missedOfferUnlockDiscount +
          walletAdd
      )
    );
  }, [
    serverBill,
    gatiCashApplyAmount,
    missedOfferUnlockDiscount,
    missedOfferWalletPending,
    missedOfferWalletPendingAmount,
  ]);
  /** GatiMitra-style strikethrough total when discounts apply (list ≈ payable + discounts). */
  const gmStrikethroughTotal = useMemo(() => {
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
      ...(showSubscriptionPromo &&
        subscriptionOptIn &&
        checkoutPlan && {
          subscriptionOptIn: true,
          subscriptionPlanId: checkoutPlan.id,
          subscriptionBillingCycle,
        }),
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
        ...(gatiCashApplyAmount > 0.005 ? { gatiCashAmount: gatiCashApplyAmount } : {}),
        ...(missedOfferWalletPending && displayMissedOfferWalletComp
          ? {
              missedOfferCompensation: {
                amountInr: displayMissedOfferWalletComp.amountInr,
                offerKey: displayMissedOfferWalletComp.key,
                offerId: displayMissedOfferWalletComp.offerId,
                offerSource: displayMissedOfferWalletComp.offerSource,
                offerKind: displayMissedOfferWalletComp.offerKind,
                offerTitle: displayMissedOfferWalletComp.offerTitle,
                discountInr: displayMissedOfferWalletComp.offerSavingsInr,
              },
            }
          : {}),
      },
      ...(gatiCashApplyAmount > 0.005 ? { gatiCashAmount: gatiCashApplyAmount } : {}),
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
    subscriptionBillingCycle,
    checkoutPlan,
    showSubscriptionPromo,
    leaveAtDoor,
    deliveryPartnerNote,
    instrLeaveWithGuard,
    instrAvoidCalling,
    instrDontRingBell,
    instrPetAtHome,
    scheduledDeliverySummary,
    restaurantNote,
    skipCutlery,
    gatiCashApplyAmount,
    missedOfferWalletPending,
    displayMissedOfferWalletComp,
    merchant,
    storeFullAddress,
    merchantName,
  ]);

  const seedTrackingOrderCache = useCallback(
    (orderId: string, status: string) => {
      if (!selectedAddress) return;
      seedOrderDetailCache(queryClient, orderId, {
        orderId,
        status,
        createdAt: new Date().toISOString(),
        deliveryInstructionsList: buildDeliveryInstructionsList({
          note: deliveryPartnerNote,
          leaveAtDoor,
          leaveWithGuard: instrLeaveWithGuard,
          avoidCalling: instrAvoidCalling,
          dontRingBell: instrDontRingBell,
          petAtHome: instrPetAtHome,
        }),
        merchantInstructionsList: restaurantNote.trim() ? [restaurantNote.trim()] : [],
        deliveryAddress: selectedAddress.fullAddress,
        deliveryAddressLabel: selectedAddress.label,
        deliveryContactName: selectedAddress.contactName ?? null,
        deliveryContactPhone: selectedAddress.contactMobile ?? null,
        merchantName: merchantName ?? undefined,
        merchantPublicName: merchantName ?? null,
        merchantPublicStoreId: merchantId ?? null,
        deliveryLat: selectedAddress.latitude,
        deliveryLng: selectedAddress.longitude,
      });
    },
    [
      queryClient,
      selectedAddress,
      deliveryPartnerNote,
      leaveAtDoor,
      instrLeaveWithGuard,
      instrAvoidCalling,
      instrDontRingBell,
      instrPetAtHome,
      restaurantNote,
      merchantName,
      merchantId,
    ]
  );

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
    onSuccess: async (order) => {
      await fulfillPendingMissedOfferWallet();
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const { label: etaLabel, etaMaxMinutes } = checkoutDeliveryEtaRef.current;
      seedTrackingOrderCache(order.orderId, "ORDER_PLACED");
      setActiveOrder({
        orderId: order.orderId,
        status: "ORDER_PLACED",
        etaMinutes: etaMaxMinutes,
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
          ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
          ...(etaMaxMinutes > 0 ? { etaMinutes: String(etaMaxMinutes) } : {}),
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
    onSuccess: async (order) => {
      await fulfillPendingMissedOfferWallet();
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
        const { label: etaLabel } = checkoutDeliveryEtaRef.current;
        router.replace({
          pathname: "/orders/payment-confirming",
          params: {
            pendingId: recoveryPendingId,
            merchantName: merchantName ?? "",
            message: "Payment was received. We are confirming your order now.",
            ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
          },
        });
        return;
      }
      const { label: etaLabel, etaMaxMinutes } = checkoutDeliveryEtaRef.current;
      const placedStatus =
        order.status === "PLACED" ? "ORDER_PLACED" : (order.status as import("@/store/orderStore").OrderStatus);
      seedTrackingOrderCache(orderId, placedStatus);
      setActiveOrder({
        orderId,
        status: placedStatus,
        etaMinutes: etaMaxMinutes,
        storeId: merchantId ?? null,
        storeName: merchantName ?? null,
        placedAt: Date.now(),
      });
      if (isCheckoutSheet) {
        useCheckoutSheetStore.getState().hide();
      }
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
          ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
          ...(etaMaxMinutes > 0 ? { etaMinutes: String(etaMaxMinutes) } : {}),
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
        const { label: etaLabel } = checkoutDeliveryEtaRef.current;
        router.replace({
          pathname: "/orders/payment-confirming",
          params: {
            pendingId: finalizeArgsRef.current.pendingId,
            merchantName: merchantName ?? "",
            message: "Payment received. We are confirming your order in the background.",
            ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
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
    if (deliveryType === "self_pickup") return;
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
        const pending = await orderService.createPendingOrderWithRetry({
          ...payload,
          idempotencyKey: idempotencyKeyRef.current,
        });
        const razorpayOrder = await paymentService.createRazorpayOrderWithRetry({
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
  }, [deliveryType, canPlaceOrder, baseOrderPayload, placeOrder, finalizeOrder.isPending, razorpayCreating, hasValidPayment, merchantId]);

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

  const handleShareCheckout = useCallback(async () => {
    if (!merchantId) return;
    const storeName = merchant?.name ?? merchantName ?? "Restaurant";
    const url = buildMerchantShareUrl(merchantId);
    const itemNames = items.map((line) => line.name).filter(Boolean);
    const message = buildCheckoutShareMessage(storeName, url, itemNames);
    try {
      await Share.share({
        message,
        url,
        title: storeName,
      });
    } catch {
      // User dismissed share sheet.
    }
  }, [merchantId, merchant?.name, merchantName, items]);

  const itemsWithImage = useMemo(() => {
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
        checkoutSubtext: cartItemSubline(cartItem) || null,
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
  const checkoutDeliveryEta = useMemo(() => {
    const base = previewEtaRange({
      distanceKm: serverBill?.distanceKm ?? merchant?.distanceKm ?? null,
      prepMinutes: merchant?.avgPreparationTimeMinutes ?? null,
    });
    const adjusted = applyWeatherToEtaRange(
      base.etaMinMinutes,
      base.etaMaxMinutes,
      checkoutWeather?.etaDelayMinutes ?? 0
    );
    return {
      label: formatEtaRange(adjusted),
      etaMaxMinutes: adjusted.etaMaxMinutes,
    };
  }, [
    merchant?.avgPreparationTimeMinutes,
    merchant?.distanceKm,
    serverBill?.distanceKm,
    checkoutWeather?.etaDelayMinutes,
  ]);
  checkoutDeliveryEtaRef.current = checkoutDeliveryEta;
  const deliveryEta = checkoutDeliveryEta.label;
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
    const scrollHPad = CHECKOUT_PAGE_H_MARGIN * 2;
    const sectionHPad = 16 * 2;
    const track = Math.max(220, windowWidth - scrollHPad - sectionHPad);
    const gap = 10;
    const chipW = Math.max(72, Math.floor((track - 3 * gap) / 3.5));
    const radius = 10;
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
        <CheckoutText style={styles.emptyText}>Cart is empty</CheckoutText>
        <TouchableOpacity onPress={handleCheckoutBack} style={styles.ctaSecondary}>
          <CheckoutText style={styles.ctaSecondaryText}>Back to cart</CheckoutText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* GatiMitra-style header: back · merchant name (top, small) + eta + address (with chevron) · share icon */}
      <View
        style={[
          styles.header,
          { paddingTop: checkoutHeaderTopPadding },
        ]}
      >
        <View style={styles.headerRow}>
          {isCheckoutSheet ? (
            <View style={styles.headerBack} />
          ) : (
            <TouchableOpacity onPress={handleCheckoutBack} style={styles.headerBack} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
            </TouchableOpacity>
          )}
          <View style={styles.headerCenter}>
            <CheckoutText style={styles.headerStoreName} numberOfLines={1}>
              {merchantName ?? storeFullAddress}
            </CheckoutText>
            <TouchableOpacity
              style={styles.headerAddressRow}
              onPress={openCheckoutAddressSheet}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <CheckoutText style={styles.headerEtaText} numberOfLines={1}>
                <CheckoutText style={styles.headerEtaStrong}>{deliveryEta}</CheckoutText>
                <CheckoutText style={styles.headerEtaSecondary}>
                  {" "}to {selectedAddress?.label?.toLowerCase() ?? "address"}
                </CheckoutText>
                <CheckoutText style={styles.headerAddressSep}>{"  |  "}</CheckoutText>
                <CheckoutText style={styles.headerFullAddressInline} numberOfLines={1}>
                  {selectedAddress?.fullAddress ?? "Tap to choose address"}
                </CheckoutText>
              </CheckoutText>
              <Ionicons
                name="chevron-down"
                size={14}
                color="#888888"
                style={styles.headerChevron}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => void handleShareCheckout()}
            style={styles.headerShareIconBtn}
            hitSlop={10}
            accessibilityLabel="Share restaurant"
          >
            <Ionicons name="share-social-outline" size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* One-line distance banner — GatiMitra style ("Selected address is N km away from your location") */}
      {showDistanceBanner && (
        <Animated.View entering={FadeIn.duration(ANIM_DURATION)} style={styles.distanceBannerOuter}>
          <View style={styles.distanceBannerNotch} />
          <View style={styles.distanceBannerCompact}>
            <CheckoutText style={styles.distanceBannerCompactText} numberOfLines={2}>
              Selected address is{" "}
              {(isDeliveryOutOfRange ? uiDistanceKm : currentVsSelectedDistanceKm)?.toFixed(
                (isDeliveryOutOfRange ? uiDistanceKm ?? 0 : currentVsSelectedDistanceKm ?? 0) >= 10 ? 0 : 1
              )}{" "}
              km away from your location
            </CheckoutText>
          </View>
        </Animated.View>
      )}

      {checkoutSavingsTotal > 0 ? (
        <View style={styles.checkoutSavingsTag}>
          <CheckoutText style={styles.checkoutSavingsTagText}>
            🥳 You saved ₹{checkoutSavingsTotal.toFixed(0)} on this order
          </CheckoutText>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: showDistanceBanner ? 16 : 12,
            paddingBottom: checkoutScrollBottomInset,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Order summary card — diet icon + lines + mint stepper, utility pills */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION)} style={styles.section}>
          <View style={styles.checkoutFullBleedSection}>
            <View style={styles.orderItemsPreview}>
              {itemsWithImage.map((item) => {
                const sub = item.checkoutSubtext;
                const lineTotal = item.price * item.quantity;
                const priceLabel =
                  Math.abs(lineTotal - Math.round(lineTotal)) < 0.01
                    ? `₹${Math.round(lineTotal)}`
                    : `₹${lineTotal.toFixed(2)}`;
                return (
                  <View key={item.menuItemId} style={styles.orderItemRow}>
                    <View style={styles.orderItemDietWrap}>
                      <DietIndicator isVeg={item.isVeg} />
                    </View>
                    <View style={styles.orderItemMid}>
                      <CheckoutText style={styles.orderItemName} numberOfLines={2}>
                        {item.name}
                      </CheckoutText>
                      {sub ? (
                        <CheckoutText style={styles.orderItemCustom} numberOfLines={2}>
                          {sub}
                        </CheckoutText>
                      ) : null}
                      <TouchableOpacity
                        style={styles.orderItemEditRow}
                        onPress={() => handleEditCartItem(item)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        accessibilityLabel="Edit item"
                      >
                        <CheckoutText style={styles.orderItemEditText}>Edit</CheckoutText>
                        <Ionicons
                          name="chevron-forward"
                          size={11}
                          color={CX.mint}
                          style={styles.orderItemEditChevron}
                        />
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
                          <CheckoutText style={styles.qtyGlyph}>−</CheckoutText>
                        </TouchableOpacity>
                        <CheckoutText style={styles.qtyValueSmall}>{item.quantity}</CheckoutText>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.menuItemId, 1)}
                          style={styles.qtyBtnSmall}
                          hitSlop={6}
                          accessibilityLabel="Increase quantity"
                        >
                          <CheckoutText style={styles.qtyGlyph}>+</CheckoutText>
                        </TouchableOpacity>
                      </View>
                      <CheckoutText style={styles.orderItemLinePrice}>{priceLabel}</CheckoutText>
                    </View>
                  </View>
                );
              })}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.checkoutActionRowScroll}
              contentContainerStyle={styles.checkoutActionRowContent}
            >
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId } })}
                style={styles.checkoutActionPill}
                activeOpacity={0.8}
              >
                <CheckoutText style={styles.checkoutActionPillPlus}>+</CheckoutText>
                <CheckoutText style={styles.checkoutActionPillTextMint}>Add more items</CheckoutText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.checkoutActionPill,
                  restaurantNote.trim().length > 0 && styles.checkoutActionPillActive,
                ]}
                onPress={() => setRestaurantNoteModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={14} color={CX.textSecondary} />
                <CheckoutText style={styles.checkoutActionPillText} numberOfLines={1}>
                  Add a note for the restaurant
                </CheckoutText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkoutActionPill, skipCutlery && styles.checkoutActionPillActive]}
                onPress={() => setSkipCutlery((v) => !v)}
                activeOpacity={0.8}
              >
                <Ionicons name="restaurant-outline" size={14} color={CX.textSecondary} />
                <CheckoutText style={styles.checkoutActionPillText} numberOfLines={1}>
                  {"Don't send cutlery"}
                </CheckoutText>
              </TouchableOpacity>
            </ScrollView>
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
            <View style={styles.checkoutFullBleedSection}>
              <View style={styles.upsellSectionHeader}>
                <View style={styles.upsellSectionIcon}>
                  <Ionicons name="grid-outline" size={14} color="#9CA3AF" />
                  <View style={styles.upsellSectionIconPlus}>
                    <Ionicons name="add" size={8} color="#9CA3AF" />
                  </View>
                </View>
                <CheckoutText style={styles.upsellSectionTitle}>Complete your meal with</CheckoutText>
              </View>
              <View style={styles.upsellScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  clipToPadding={false}
                  contentContainerStyle={[
                    styles.upsellScrollContent,
                    { gap: upsellChipLayout.gap, paddingRight: 16 },
                  ]}
                  style={styles.upsellScrollInner}
                >
                  {completeYourMealItems.map((m) => {
                    const { chipW, radius } = upsellChipLayout;
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => handleUpsellItemPress(m)}
                        style={({ pressed }) => [
                          styles.upsellCard,
                          { width: chipW },
                          pressed && styles.upsellCardPressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.upsellImageWrap,
                            { width: chipW, height: chipW, borderRadius: radius },
                          ]}
                        >
                          {m.imageUrl ? (
                            <Image
                              source={{ uri: m.imageUrl }}
                              style={[styles.upsellImage, { borderRadius: radius }]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.upsellImagePlaceholder,
                                !m.isVeg && styles.nonVegBg,
                                { borderRadius: radius },
                              ]}
                            >
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
                        <CheckoutText style={[styles.upsellName, { width: chipW }]} numberOfLines={2}>
                          {m.name}
                        </CheckoutText>
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
              <CheckoutText style={styles.offersCardBannerTitle}>
                Save extra by applying coupons on every order
              </CheckoutText>
              <View style={styles.offersCardBannerIconGlow}>
                <View style={styles.offersCardBannerIconOuter}>
                  <View style={styles.offersCardBannerIconBox}>
                    <CheckoutText style={styles.offersCardBannerPct}>%</CheckoutText>
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.offersDottedSep} />

            {showSubscriptionPromo ? (
              <>
                <View style={styles.offersBodyRow}>
                  <MaterialCommunityIcons
                    name="crown-outline"
                    size={20}
                    color={subscriptionAccentColor}
                    style={styles.offersSubIcon}
                  />
                  <View style={styles.offersBodyTextCol}>
                    <CheckoutText style={styles.offersSubLineBold}>{gmitraPlusPromoCopy.offersTitle}</CheckoutText>
                    <CheckoutText style={styles.offersSubLineMuted} numberOfLines={2}>
                      {gmitraPlusPromoCopy.offersSub}
                    </CheckoutText>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={8}
                      onPress={() => setGmitraPlusSheetVisible(true)}
                    >
                      <CheckoutText style={[styles.offersLearnMore, { color: subscriptionAccentColor }]}>
                        Learn more {'>'}
                      </CheckoutText>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.offersApplyCol}>
                    {checkoutPlan?.isFeatured ? (
                      <View
                        style={[
                          styles.offersFeaturedBadge,
                          {
                            backgroundColor: subscriptionAttachTheme.softBg,
                            borderColor: subscriptionAttachTheme.border,
                          },
                        ]}
                      >
                        <CheckoutText style={[styles.offersFeaturedBadgeText, { color: subscriptionAccentColor }]}>
                          Featured plan
                        </CheckoutText>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      style={[
                        styles.offersApplyOutline,
                        { borderColor: subscriptionAccentColor },
                        subscriptionOptIn && {
                          backgroundColor: subscriptionAccentColor,
                          borderColor: subscriptionAccentColor,
                        },
                      ]}
                      onPress={() => setSubscriptionOptIn(!subscriptionOptIn)}
                      activeOpacity={0.85}
                    >
                      <CheckoutText
                        style={[
                          styles.offersApplyOutlineText,
                          { color: subscriptionAccentColor },
                          subscriptionOptIn && styles.offersApplyFilledText,
                        ]}
                      >
                        {subscriptionOptIn ? "ADDED" : "APPLY"}
                      </CheckoutText>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.offersDottedSep} />
              </>
            ) : null}

            <View style={styles.offersAppliedRow}>
              {hasAppliedCheckoutPromo || hasMissedOfferUnlocked ? (
                <View style={styles.offersGreenTick}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : (
                <View style={styles.offersCouponIconCircle}>
                  <CheckoutText style={styles.offersCouponIconPct}>%</CheckoutText>
                </View>
              )}
              <View style={styles.offersBodyTextCol}>
                <CheckoutText style={styles.offersAppliedHeadline} numberOfLines={2}>
                  {offersAppliedHeadline}
                </CheckoutText>
                {offersAppliedSubline ? (
                  <CheckoutText style={styles.offersSubLineMuted} numberOfLines={2}>
                    {offersAppliedSubline}
                  </CheckoutText>
                ) : null}
                <TouchableOpacity onPress={() => setCouponSheetVisible(true)} activeOpacity={0.7} hitSlop={6}>
                  <CheckoutText style={styles.offersLearnMore}>View all coupons ›</CheckoutText>
                </TouchableOpacity>
              </View>
              {hasMissedOfferUnlocked ? (
                <TouchableOpacity onPress={handleRemoveMissedOfferWallet} hitSlop={8} activeOpacity={0.7}>
                  <CheckoutText style={styles.offersRemoveRed}>Remove</CheckoutText>
                </TouchableOpacity>
              ) : hasAppliedCheckoutPromo ? (
                <TouchableOpacity onPress={removeAllCheckoutOffers} hitSlop={8} activeOpacity={0.7}>
                  <CheckoutText style={styles.offersRemoveRed}>Remove</CheckoutText>
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
                  <CheckoutText style={styles.offersApplyOutlineText}>APPLY</CheckoutText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>

        {displayMissedOfferWalletComp ? (
          <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(50)} style={styles.section}>
            <CheckoutMissedOfferWalletCard
              offer={displayMissedOfferWalletComp}
              pending={missedOfferWalletPending}
              onPressAdd={openMissedOfferUnlockSheet}
              onPressRemove={handleRemoveMissedOfferWallet}
            />
          </Animated.View>
        ) : null}

        {/* Delivery + bill — GatiMitra-style single card: savings banner, dashed rules, ETA, address, bill, GMitra bubble */}
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(60)} style={styles.section}>
          <View style={styles.gmCheckoutCard}>
            <View style={styles.gmCardPad}>
              <View style={styles.deliveryEtaRow}>
                <Ionicons name="flash" size={18} color={GatiMitraColors.emerald} style={styles.gmEtaFlashIcon} />
                <View style={styles.gmEtaTextCol}>
                  <CheckoutText style={styles.gmEtaLine}>
                    Delivery in <CheckoutText style={styles.gmEtaBold}>{deliveryEta}</CheckoutText>
                  </CheckoutText>
                  {deliveryEtaImpactLabel ? (
                    <CheckoutText style={styles.weatherEtaImpact}>{deliveryEtaImpactLabel}</CheckoutText>
                  ) : null}
                  {scheduledDeliverySummary ? (
                    <CheckoutText style={styles.scheduledSummaryLine} numberOfLines={2}>
                      {scheduledDeliverySummary}
                    </CheckoutText>
                  ) : null}
                  <CheckoutText style={styles.gmScheduleLine} onPress={() => setScheduleSheetVisible(true)}>
                    Want this later? Schedule it
                  </CheckoutText>
                </View>
              </View>
            </View>

            <View style={styles.gmCardDash} />

            <View style={styles.gmAddrBlock}>
              <View style={styles.gmAddrRowInner}>
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
                      <CheckoutText style={styles.deliveryAddrLabel} numberOfLines={1}>
                        <CheckoutText style={styles.deliveryAddrPre}>Delivery at </CheckoutText>
                        <CheckoutText style={styles.deliveryAddrName}>
                          {selectedAddress?.label ?? currentLocationDisplay?.label ?? "—"}
                        </CheckoutText>
                      </CheckoutText>
                    </View>
                  </View>
                  <CheckoutText style={styles.deliveryAddrSub} numberOfLines={2} ellipsizeMode="tail">
                    {selectedAddress
                      ? selectedAddress.fullAddress
                      : currentLocationDisplay?.fullAddress ?? "Tap to choose delivery address"}
                  </CheckoutText>
                  {leaveAtDoor ? (
                    <View style={[styles.leaveAtDoorChip, styles.leaveAtDoorChipBelowAddr]}>
                      <Ionicons name="checkmark-circle" size={14} color={GatiMitraColors.emerald} />
                      <CheckoutText style={styles.leaveAtDoorChipText}>Leave at door</CheckoutText>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  style={styles.gmAddrChevronHit}
                  onPress={openCheckoutAddressSheet}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.gmCardDash} />

            <TouchableOpacity
              style={[styles.gmCardPad, styles.instructionPartnerRow]}
              onPress={() => setInstructionSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons name="chatbox-ellipses-outline" size={20} color={GatiMitraColors.textSecondary} />
              <View style={styles.instructionPartnerTextCol}>
                <CheckoutText style={styles.instructionPartnerTitle}>Add instructions for delivery partner</CheckoutText>
                {partnerInstructionSummary ? (
                  <CheckoutText style={styles.instructionPartnerSummary} numberOfLines={2}>
                    {partnerInstructionSummary}
                  </CheckoutText>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>

            {selectedAddress ? (
              <>
                <View style={styles.gmCardDash} />
                <TouchableOpacity
                  style={[styles.gmCardPad, styles.checkoutReceiverRow]}
                  onPress={openReceiverSheet}
                  activeOpacity={0.75}
                  disabled={!selectedAddress}
                >
                  <Ionicons name="call-outline" size={20} color={GatiMitraColors.textSecondary} />
                  <CheckoutText style={styles.checkoutReceiverText} numberOfLines={1}>
                    {checkoutReceiverSummary}
                  </CheckoutText>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
              </>
            ) : null}

            <View style={styles.gmCardDash} />

            <TouchableOpacity
              style={[styles.gmBillHeader, showGmitraPlusAttachRow && styles.gmBillHeaderWithAttach]}
              onPress={() => setBillSummarySheetVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={22} color={GatiMitraColors.textSecondary} />
              <View style={styles.gmBillHeaderContent}>
                <View style={styles.gmBillTopRow}>
                  <CheckoutText style={styles.gmBillTitle}>Total Bill</CheckoutText>
                  {!showBillSkeleton ? (
                    <>
                      <View style={styles.gmBillPriceCluster}>
                        {gmStrikethroughTotal != null ? (
                          <CheckoutText style={styles.gmBillStrike}>₹{gmStrikethroughTotal.toFixed(2)}</CheckoutText>
                        ) : null}
                        <CheckoutText style={styles.gmBillFinal}>
                          {toPayAmount != null ? `₹${toPayAmount.toFixed(2)}` : "—"}
                        </CheckoutText>
                        {checkoutSavingsTotal > 0.005 ? (
                          <View style={styles.gmSavedPill}>
                            <CheckoutText style={styles.gmSavedPillText}>
                              You saved ₹{Math.round(checkoutSavingsTotal)}
                            </CheckoutText>
                          </View>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={22} color={GatiMitraColors.textSecondary} />
                    </>
                  ) : (
                    <GMSkeleton style={{ width: 72, height: 18, borderRadius: 4 }} />
                  )}
                </View>
                <CheckoutText style={styles.gmBillSub}>Incl. taxes and charges</CheckoutText>
                {missedOfferWalletPending &&
                (missedOfferUnlockDiscount > 0.005 || missedOfferWalletPendingAmount > 0.005) ? (
                  <CheckoutText style={styles.gmBillPendingWallet}>
                    {missedOfferUnlockDiscount > 0.005
                      ? `− ₹${missedOfferUnlockDiscount.toFixed(2)} ${displayMissedOfferWalletComp?.offerTitle ?? "offer"} applied`
                      : ""}
                    {missedOfferUnlockDiscount > 0.005 && missedOfferWalletPendingAmount > 0.005
                      ? " · "
                      : ""}
                    {missedOfferWalletPendingAmount > 0.005
                      ? `+ ₹${missedOfferWalletPendingAmount.toFixed(2)} GatiCash wallet add`
                      : ""}
                  </CheckoutText>
                ) : null}
              </View>
            </TouchableOpacity>

            {showBillSkeleton ? (
              <View style={[styles.billSkeletonWrap, styles.gmCardPadH]}>
                <GMSkeleton style={styles.billSkeletonLine} />
                <GMSkeleton style={styles.billSkeletonLastLine} />
              </View>
            ) : null}

            {showGmitraPlusAttachRow ? (
              <View style={[styles.gmGoldAttach, { backgroundColor: subscriptionAttachTheme.softBg }]}>
                <View style={styles.gmGoldPointerShell}>
                  <View style={[styles.gmGoldPointerBorder, { borderBottomColor: subscriptionAttachTheme.border }]} />
                  <View style={[styles.gmGoldPointerFill, { borderBottomColor: subscriptionAttachTheme.softBg }]} />
                </View>
                <View style={[styles.gmGoldCrownRing, { backgroundColor: subscriptionAttachTheme.accent }]}>
                  <MaterialCommunityIcons name="crown" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.gmGoldTextCol}>
                  <CheckoutText style={[styles.gmGoldTitle, { color: subscriptionAttachTheme.accent }]}>
                    {gmitraPlusPromoCopy.attachTitle}
                  </CheckoutText>
                  <CheckoutText style={styles.gmGoldSub} numberOfLines={2}>
                    {gmitraPlusPromoCopy.attachSub}
                  </CheckoutText>
                </View>
                <TouchableOpacity
                  style={[
                    styles.gmGoldAddBtn,
                    { borderColor: subscriptionAttachTheme.accent },
                    subscriptionOptIn && { borderColor: subscriptionAttachTheme.accent, backgroundColor: subscriptionAttachTheme.accent },
                  ]}
                  onPress={() => setSubscriptionOptIn(!subscriptionOptIn)}
                  onLongPress={() => setGmitraPlusSheetVisible(true)}
                  activeOpacity={0.85}
                >
                  <CheckoutText
                    style={[
                      styles.gmGoldAddBtnText,
                      { color: subscriptionAttachTheme.accent },
                      subscriptionOptIn && styles.gmGoldAddBtnTextApplied,
                    ]}
                  >
                    {subscriptionOptIn ? "Added" : checkoutPlan?.ctaLabel ?? "Add Plus"}
                  </CheckoutText>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(100)} style={styles.sectionContrib}>
          <CheckoutGratitudeSections {...checkoutGratitudeProps} />
        </Animated.View>

        {/* Cancellation policy — above footer */}
        <View style={styles.cancellationBlock}>
          <CheckoutText style={styles.cancellationTitle}>CANCELLATION POLICY</CheckoutText>
          <CheckoutText style={styles.cancellationText}>
            A 100% cancellation fee will be applied if you cancel the order after it is confirmed from your end.{" "}
            See our <LegalLink id="refund-cancellation-policy" />.
          </CheckoutText>
        </View>

        {/* GatiMitra branding — end of content */}
        <BrandingFooter compact />
      </ScrollView>

      <CouponApplyCelebration
        visible={couponCelebrationVisible}
        couponCode={couponCelebrationCode}
        savedAmount={couponDiscountAmount}
        onDismiss={() => setCouponCelebrationVisible(false)}
      />

      <MissedOfferWalletCelebration
        visible={missedOfferCelebration != null}
        offerTitle={missedOfferCelebration?.offerTitle ?? ""}
        offerSavingsInr={missedOfferCelebration?.offerSavingsInr ?? 0}
        walletAddInr={missedOfferCelebration?.amountInr ?? 0}
        onDismiss={() => setMissedOfferCelebration(null)}
      />

      <MissedOfferUnlockSheet
        visible={missedOfferSheetVisible}
        offer={missedOfferWalletComp}
        bottomInset={insets.bottom}
        pending={missedOfferWalletPending}
        onClose={() => setMissedOfferSheetVisible(false)}
        onAddToWallet={handleSelectMissedOfferWallet}
        onRemoveFromWallet={handleRemoveMissedOfferWallet}
        onAddMoreItems={handleMissedOfferAddMoreItems}
      />

      <CouponAvailableBottomSheet
        visible={couponAvailablePrompt.visible}
        prompt={couponAvailablePrompt.prompt}
        bottomInset={insets.bottom}
        onClose={couponAvailablePrompt.dismiss}
        onApply={handleCouponAvailableApply}
      />

      <CheckoutOffersSheet
        visible={couponSheetVisible}
        onClose={() => setCouponSheetVisible(false)}
        bottomInset={insets.bottom}
        loading={checkoutOffersQuery.isLoading}
        error={checkoutOffersQuery.isError}
        data={checkoutOffersQuery.data}
        merchantId={merchantId}
        cartSubtotal={cartSubtotalForOffers}
        pendingMissedOfferKey={
          missedOfferWalletPending && displayMissedOfferWalletComp
            ? displayMissedOfferWalletComp.key
            : selectedMissedOfferKey
        }
        unlockedMissedOffer={
          missedOfferWalletPending && displayMissedOfferWalletComp
            ? {
                key: displayMissedOfferWalletComp.key,
                title: displayMissedOfferWalletComp.offerTitle,
                offerSavingsInr: displayMissedOfferWalletComp.offerSavingsInr,
                walletAddInr: displayMissedOfferWalletComp.amountInr,
              }
            : null
        }
        onUnlockWithGatiCash={handleUnlockMissedOfferFromSheet}
        onRemoveMissedOfferWallet={handleRemoveMissedOfferWallet}
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
        subscriptionBenefits={subscriptionBenefitRows}
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
            <CheckoutText style={styles.paymentSheetTitle}>Pay using</CheckoutText>
            <CheckoutText style={styles.paymentSheetSubtitle}>Razorpay will show your UPI apps, cards & wallets</CheckoutText>
            {PAYMENT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => {
                  setPaymentMethod(opt.id);
                  setPaymentSheetVisible(false);
                }}
                style={[styles.paymentOptionRow, paymentMethod === opt.id && styles.paymentOptionActive]}
              >
                <CheckoutText style={styles.paymentOptionText}>{opt.label}</CheckoutText>
                {paymentMethod === opt.id && <Ionicons name="checkmark-circle" size={24} color={GatiMitraColors.emerald} />}
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      )}

      {/* Footer: fixed-width delivery / takeaway toggle + Place Order CTA (width = screen − padding − gap − toggle; same corner radius as toggle shell). */}
      <View style={[styles.fixedBottom, { paddingBottom: footerBottomInset }]}>
        {showGatiCashWalletBar && (
          <View style={styles.gatiCashWalletBarWrap}>
            <CheckoutGatiCashWalletBar
              balance={gatiCashAvailable}
              maxApplyAmount={gatiCashMaxApply}
              applyAmount={gatiCashApplyAmount}
              checked={useGatiCashWallet}
              onToggle={() => setUseGatiCashWallet((v) => !v)}
              loading={gatiCashBalanceQ.isLoading && authHydrated && !!authSession}
            />
          </View>
        )}
        <View style={styles.footerRow}>
          <View style={styles.footerToggleCol}>
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
                size={18}
                color={deliveryType === "delivery" ? "#FFFFFF" : "#111111"}
              />
              <CheckoutText
                style={[
                  styles.deliveryTypeSegText,
                  deliveryType === "delivery" && styles.deliveryTypeSegTextActive,
                ]}
              >
                Delivery
              </CheckoutText>
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
                size={18}
                color={deliveryType === "self_pickup" ? "#FFFFFF" : "#111111"}
              />
              <CheckoutText
                style={[
                  styles.deliveryTypeSegText,
                  deliveryType === "self_pickup" && styles.deliveryTypeSegTextActive,
                ]}
              >
                Takeaway
              </CheckoutText>
            </TouchableOpacity>
            </View>
          </View>
          <View style={styles.footerCtaCol}>
          {isStoreClosed ? (
            <View style={styles.footerCtaSlotDisabled}>
              <CheckoutText style={styles.ctaDisabledText}>Store closed</CheckoutText>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.footerCtaSlotDisabled}>
              <CheckoutText style={styles.ctaDisabledText}>Add items</CheckoutText>
            </View>
          ) : deliveryType === "self_pickup" ? (
            <View style={styles.footerCtaSlotDisabled}>
              <CheckoutText style={styles.ctaDisabledText}>Coming Soon</CheckoutText>
            </View>
          ) : !canPlaceOrder ? (
            <View style={styles.footerCtaSlotDisabled}>
              <View style={styles.ctaDisabledSplit}>
                <View style={styles.ctaLeftPart}>
                  <CheckoutText style={styles.ctaDisabledAmount} numberOfLines={1}>
                    {toPayAmount != null ? `₹${toPayAmount.toFixed(2)}` : "—"}
                  </CheckoutText>
                  <CheckoutText style={styles.ctaTotalLabel} numberOfLines={1}>TOTAL</CheckoutText>
                </View>
                <View style={styles.ctaRightPartDisabled}>
                  <CheckoutText style={styles.ctaDisabledLabel} numberOfLines={1}>Place Order</CheckoutText>
                  <CheckoutText style={styles.ctaDisabledHint} numberOfLines={1}>
                    {!selectedAddress
                      ? "Check address"
                      : billingQuery.isError
                        ? "Bill error"
                        : billingQuery.isLoading
                          ? "Loading bill…"
                          : billingQuery.isPlaceholderData && billingQuery.isFetching
                            ? "Updating bill…"
                            : !serverBill
                              ? "Waiting for bill"
                              : "Select payment"}
                  </CheckoutText>
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.footerCtaSlot,
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
                <View style={styles.ctaLeftPart}>
                  <CheckoutText style={styles.ctaTotalAmount} numberOfLines={1}>
                    {toPayAmount != null ? `₹${toPayAmount.toFixed(2)}` : "—"}
                  </CheckoutText>
                  <CheckoutText style={styles.ctaTotalLabel} numberOfLines={1}>TOTAL</CheckoutText>
                </View>
                <View style={styles.ctaRightPart}>
                  {placeOrder.isPending || finalizeOrder.isPending || razorpayCreating ? (
                    <View style={styles.ctaRightPartRow}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : (
                    <View style={styles.ctaRightPartRow}>
                      <CheckoutText style={styles.ctaLabel} numberOfLines={1}>Place Order</CheckoutText>
                      <Ionicons name="chevron-forward" size={18} color="#fff" />
                    </View>
                  )}
                </View>
              </LinearGradient>
            </Pressable>
          )}
          </View>
        </View>
        <LegalFooter
          prefix="By placing this order you agree to"
          docIds={["terms-of-service", "shipping-delivery-policy"]}
          style={styles.checkoutLegalFooter}
          compact
        />
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
              <CheckoutText style={styles.noteSheetTitle}>Add a note for the restaurant</CheckoutText>
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
            <CheckoutText style={styles.noteSheetDisclaimer}>
              {`The restaurant will try its best to follow your requests. However, refunds or cancellations in this regard won't be possible.`}
            </CheckoutText>
            <View style={styles.noteSheetFooter}>
              <TouchableOpacity
                onPress={() => setRestaurantNote("")}
                style={styles.noteSheetClearBtn}
                hitSlop={8}
              >
                <CheckoutText style={styles.noteSheetClearText}>Clear</CheckoutText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteSheetSaveBtn}
                onPress={() => setRestaurantNoteModalVisible(false)}
                activeOpacity={0.9}
              >
                <CheckoutText style={styles.noteSheetSaveBtnText}>Save</CheckoutText>
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
            <CheckoutText style={styles.scheduleSheetTitle}>Select your delivery time</CheckoutText>
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
                    <CheckoutText style={[styles.scheduleTabLine1, on && styles.scheduleTabLine1On]}>{tab.line1}</CheckoutText>
                    <CheckoutText style={[styles.scheduleTabLine2, on && styles.scheduleTabLine2On]}>{tab.line2}</CheckoutText>
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
                    <CheckoutText style={[styles.scheduleSlotText, picked && styles.scheduleSlotTextOn]}>{slot}</CheckoutText>
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
                <CheckoutText style={styles.scheduleConfirmBtnText}>Confirm</CheckoutText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DeliveryPartnerInstructionSheet
        visible={instructionSheetVisible}
        onClose={() => setInstructionSheetVisible(false)}
        addressLine={
          selectedAddress
            ? `${selectedAddress.label ? `${selectedAddress.label} — ` : ""}${selectedAddress.fullAddress}`
            : currentLocationDisplay?.fullAddress ?? "Add a delivery address to continue"
        }
        initialInstructions={checkoutDeliveryInstructionSeed}
        onSave={saveDeliveryPartnerInstructions}
      />

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
            <CheckoutText style={styles.addressSelectSheetTitle}>Select an address</CheckoutText>

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
                  <CheckoutText style={styles.addressSelectAddTitle}>Add Address</CheckoutText>
                  <CheckoutText style={styles.addressSelectAddSub} numberOfLines={2}>
                    Search area or drop a pin on the map
                  </CheckoutText>
                </View>
                <View style={styles.addressSelectAddChevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={CX.mint} />
                </View>
              </LinearGradient>
            </Pressable>

            <View style={styles.addressSelectSectionRule} />

            <CheckoutText style={styles.addressSelectSectionLabel}>SAVED ADDRESSES</CheckoutText>

            {addressesLoading ? (
              <View style={styles.addressSelectLoading}>
                <ActivityIndicator size="small" color={CX.mint} />
              </View>
            ) : addresses.length === 0 ? (
              <CheckoutText style={styles.addressSelectEmpty}>
                No saved addresses yet. Tap Add Address to save a delivery location.
              </CheckoutText>
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
                        <CheckoutText style={styles.addressSelectDeliversTo}>DELIVERS TO</CheckoutText>
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
                            <CheckoutText style={styles.addressSelectDist}>{dist}</CheckoutText>
                          </View>
                          <View style={styles.addressSelectBody}>
                            <CheckoutText style={styles.addressSelectCardTitle} numberOfLines={1}>
                              {title}
                            </CheckoutText>
                            {addr.contactName && addr.label ? (
                              <CheckoutText style={styles.addressSelectSub} numberOfLines={1}>
                                {addr.label}
                              </CheckoutText>
                            ) : null}
                            <CheckoutText style={styles.addressSelectAddr} numberOfLines={4}>
                              {addr.fullAddress}
                            </CheckoutText>
                            {addr.contactMobile ? (
                              <CheckoutText style={styles.addressSelectPhone} numberOfLines={1}>
                                Phone number: {addr.contactMobile}
                              </CheckoutText>
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
              <CheckoutText style={styles.noteSheetTitle}>Update receiver details</CheckoutText>
              <TouchableOpacity
                onPress={() => setReceiverSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color="#111827" />
              </TouchableOpacity>
            </View>
            <CheckoutText style={styles.receiverSheetAddr} numberOfLines={3}>
              {selectedAddress
                ? `${selectedAddress.label ? `${selectedAddress.label} — ` : ""}${selectedAddress.fullAddress}`
                : ""}
            </CheckoutText>
            <CheckoutText style={styles.receiverFieldLabel}>Receiver&apos;s name</CheckoutText>
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
            <CheckoutText style={styles.receiverFieldLabel}>Receiver&apos;s mobile number</CheckoutText>
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
                  <CheckoutText style={styles.receiverSubmitBtnText}>Submit</CheckoutText>
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
                    <CheckoutText style={styles.communitySheetTitle}>GatiMitra Community Initiative</CheckoutText>
                    <CheckoutText style={styles.communitySheetSub}>
                      {"We're building a platform that not only delivers orders faster but also aims to create opportunities and support communities in the future."}
                    </CheckoutText>
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
                <CheckoutText style={styles.communityImpactDividerLabel}>OUR JOURNEY</CheckoutText>
                <View style={styles.communityImpactRule} />
              </View>
              <View style={styles.communityImpactRow}>
                <View style={styles.communityImpactCol}>
                  <CheckoutText style={styles.communityImpactEmoji}>🚀</CheckoutText>
                  <CheckoutText style={styles.communityImpactLabel}>Startup Phase</CheckoutText>
                </View>
                <View style={styles.communityImpactCol}>
                  <CheckoutText style={styles.communityImpactEmoji}>🤝</CheckoutText>
                  <CheckoutText style={styles.communityImpactLabel}>Community Driven</CheckoutText>
                </View>
                <View style={styles.communityImpactCol}>
                  <CheckoutText style={styles.communityImpactEmoji}>🌱</CheckoutText>
                  <CheckoutText style={styles.communityImpactLabel}>Growing Together</CheckoutText>
                </View>
              </View>
              <CheckoutText style={styles.communitySheetFinePrint}>
                {
                  "Optional donations at checkout support verified NGO meal programmes. We'll share more community programmes here as GatiMitra grows."
                }
              </CheckoutText>
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
                <CheckoutText style={styles.communitySheetCtaText}>Continue Supporting</CheckoutText>
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
              <CheckoutText style={styles.noteSheetTitle}>{subscriptionPlanName}</CheckoutText>
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
              <CheckoutText style={styles.gmitraSheetLead}>
                {checkoutPlan?.description ??
                  `${subscriptionPlanName} is a membership that helps you save on every order with better delivery pricing and exclusive offers.`}
              </CheckoutText>
              <CheckoutText style={styles.gmitraSheetSectionTitle}>What you get</CheckoutText>
              {(checkoutPlan?.benefits ?? []).map((benefit) => (
                <CheckoutText key={benefit} style={styles.gmitraSheetBullet}>
                  • {benefit}
                </CheckoutText>
              ))}
              {gmitraPlusPromoCopy.freeDeliveryNote ? (
                <CheckoutText style={styles.gmitraSheetBullet}>• {gmitraPlusPromoCopy.freeDeliveryNote}</CheckoutText>
              ) : null}
              {defaultPrice ? (
                <CheckoutText style={styles.gmitraSheetBullet}>
                  • {formatPlanPriceLine(defaultPrice)} (incl. GST)
                </CheckoutText>
              ) : null}
              <CheckoutText style={styles.gmitraSheetDisclaimer}>
                Benefits may vary by city, restaurant, and order value. Add {subscriptionPlanName} to this order with the
                button below, or tap APPLY next to Learn more on checkout.
              </CheckoutText>
            </ScrollView>
            <View style={styles.gmitraSheetFooterRow}>
              <TouchableOpacity
                style={styles.gmitraSheetSecondaryBtn}
                onPress={() => setGmitraPlusSheetVisible(false)}
                activeOpacity={0.85}
              >
                <CheckoutText style={styles.gmitraSheetSecondaryBtnText}>Got it</CheckoutText>
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
                <CheckoutText style={styles.noteSheetSaveBtnText}>
                  {subscriptionOptIn ? "Already added" : checkoutPlan?.ctaLabel ?? `Add ${subscriptionPlanName}`}
                </CheckoutText>
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
              <CheckoutText style={styles.gstModalTitle}>GST & other charges</CheckoutText>
              <Pressable
                onPress={() => setGstBreakdownModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={GatiMitraColors.textSecondary} />
              </Pressable>
            </View>
            <CheckoutText style={styles.gstModalSubtitle}>
              Every GST and platform charge on this order, broken out one by one.
            </CheckoutText>
            <ScrollView style={styles.gstModalScroll} showsVerticalScrollIndicator={false}>
              {gstAndOtherBreakdown?.lines.map((row) => (
                <View key={row.key} style={styles.gstModalLine}>
                  <View style={styles.gstModalLineLeft}>
                    <CheckoutText style={styles.gstModalLineLabel}>{row.label}</CheckoutText>
                    {row.sub ? <CheckoutText style={styles.gstModalLineSub}>{row.sub}</CheckoutText> : null}
                  </View>
                  <CheckoutText style={styles.gstModalLineValue}>₹{row.amount.toFixed(2)}</CheckoutText>
                </View>
              ))}
              <View style={styles.gstModalDivider} />
              <View style={styles.gstModalLine}>
                <CheckoutText style={styles.gstModalTotalLabel}>Total</CheckoutText>
                <CheckoutText style={styles.gstModalTotalValue}>
                  ₹{(gstAndOtherBreakdown?.total ?? 0).toFixed(2)}
                </CheckoutText>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <DonateWithBottomSheet
        visible={donateWithSheetVisible}
        value={donationScope}
        onClose={() => setDonateWithSheetVisible(false)}
        onSave={setDonationScope}
      />

      <BillSummarySheet
        visible={billSummarySheetVisible}
        onClose={() => setBillSummarySheetVisible(false)}
        bottomInset={insets.bottom}
        maxHeight={billSummarySheetMaxHeight}
        serverBill={serverBill}
        billingError={billingQuery.isError}
        billingLoading={billingQuery.isFetching && serverBill == null}
        deliveryType={deliveryType}
        showDeliveryFeeRow={showDeliveryFeeRow}
        deliveryFeeStrikeAmount={deliveryFeeStrikeAmount}
        distanceKm={uiDistanceKm}
        subscriptionPlanName={subscriptionPlanName}
        billSubscriptionCharges={billSubscriptionCharges}
        gstAndOtherBreakdown={gstAndOtherBreakdown}
        onGstInfoPress={() => setGstBreakdownModalVisible(true)}
        visibleDiscounts={visibleDiscounts}
        showItemTotalStrike={showItemTotalStrike}
        gatiCashApplyAmount={gatiCashApplyAmount}
        missedOfferWalletPendingAmount={missedOfferWalletPendingAmount}
        missedOfferUnlockDiscount={missedOfferUnlockDiscount}
        missedOfferUnlockLabel={
          missedOfferWalletComp?.offerTitle
            ? `${missedOfferWalletComp.offerTitle} unlocked`
            : "Offer unlocked"
        }
        {...checkoutGratitudeProps}
      />

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
              <CheckoutText style={styles.simulatedPaymentTitle}>Test payment</CheckoutText>
              <View style={styles.simulatedPaymentDevBadge}>
                <CheckoutText style={styles.simulatedPaymentDevBadgeText}>Dummy mode</CheckoutText>
              </View>
              <CheckoutText style={styles.simulatedPaymentSubtitle}>
                Razorpay is bypassed. Pick an outcome to drive the rest of the order flow end-to-end (merchant, rider, notifications all fire on success).
              </CheckoutText>
              <View style={styles.simulatedAmountRow}>
                <CheckoutText style={styles.simulatedAmountLabel}>Amount to pay</CheckoutText>
                <CheckoutText style={styles.simulatedAmountValue}>₹{(simulatedPaymentOrder.amount / 100).toFixed(2)}</CheckoutText>
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
                    <CheckoutText style={styles.simulatedConfirmBtnText}>Simulate Success</CheckoutText>
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
                <CheckoutText style={styles.simulatedFailBtnText}>Simulate Failure</CheckoutText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.simulatedCancelBtn}
                onPress={handleSimulatedPaymentCancel}
                activeOpacity={0.85}
                disabled={simulatedSubmitting}
              >
                <CheckoutText style={styles.simulatedCancelBtnText}>Cancel</CheckoutText>
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
        <CheckoutText style={styles.billLabel}>{label}</CheckoutText>
        <Pressable
          onPress={onInfoPress}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Show breakdown of GST and other charges"
        >
          <Ionicons name="information-circle-outline" size={19} color={GatiMitraColors.textSecondary} />
        </Pressable>
      </View>
      <CheckoutText style={styles.billValue}>{value}</CheckoutText>
    </View>
  );
}

function BillRow({
  label,
  value,
  bold,
  green,
  strikethrough,
}: {
  label: string;
  value: string;
  bold?: boolean;
  green?: boolean;
  strikethrough?: boolean;
}) {
  return (
    <View style={styles.billRow}>
      <CheckoutText style={[styles.billLabel, strikethrough && styles.billValueStrike]}>{label}</CheckoutText>
      <CheckoutText
        style={[
          styles.billValue,
          bold && styles.billValueBold,
          green && styles.billValueGreen,
          strikethrough && styles.billValueStrike,
        ]}
      >
        {value}
      </CheckoutText>
    </View>
  );
}

/**
 * Bill row that exposes a per-line GST breakdown via an inline "i" affordance.
 * Tapping the info chip toggles a small panel underneath with base/GST/total —
 * matches GatiMitra/Swiggy's transparent fee disclosure.
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
          <CheckoutText style={styles.billLabel}>{label}</CheckoutText>
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
        <CheckoutText
          style={[
            styles.billValue,
            bold && styles.billValueBold,
            green && styles.billValueGreen,
          ]}
        >
          {green && total > 0 ? `-₹${total.toFixed(2)}` : `₹${Math.abs(total).toFixed(2)}`}
        </CheckoutText>
      </View>
      {open && hasBreakdown && breakdown ? (
        <View style={styles.billBreakdownPanel}>
          <View style={styles.billBreakdownRow}>
            <CheckoutText style={styles.billBreakdownLabel}>Base</CheckoutText>
            <CheckoutText style={styles.billBreakdownValue}>₹{breakdown.base.toFixed(2)}</CheckoutText>
          </View>
          <View style={styles.billBreakdownRow}>
            <CheckoutText style={styles.billBreakdownLabel}>
              GST{breakdown.gstRateLabel ? ` (${breakdown.gstRateLabel})` : ""}
            </CheckoutText>
            <CheckoutText style={styles.billBreakdownValue}>₹{breakdown.gst.toFixed(2)}</CheckoutText>
          </View>
          <View style={[styles.billBreakdownRow, styles.billBreakdownTotalRow]}>
            <CheckoutText style={styles.billBreakdownTotalLabel}>Total</CheckoutText>
            <CheckoutText style={styles.billBreakdownTotalValue}>
              ₹{(breakdown.base + breakdown.gst).toFixed(2)}
            </CheckoutText>
          </View>
          {note ? <CheckoutText style={styles.billBreakdownNote}>{note}</CheckoutText> : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F2" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: GatiMitraColors.textSecondary },
  ctaSecondary: { marginTop: SPACING, paddingVertical: 12, paddingHorizontal: 24 },
  ctaSecondaryText: { fontSize: 16, fontWeight: "600", color: CX.mint },
  header: {
    backgroundColor: CHECKOUT_HEADER_BG,
    zIndex: 20,
    paddingHorizontal: CHECKOUT_PAGE_H_MARGIN,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    ...GatiMitraColors.elevationShadow,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
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
    marginBottom: 0,
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
    backgroundColor: "#F2F2F2",
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
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
    marginTop: 6,
  },
  offersApplyCol: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
  },
  offersFeaturedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  offersFeaturedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
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
  scroll: { flex: 1, backgroundColor: "#F2F2F2" },
  scrollContent: { paddingHorizontal: CHECKOUT_PAGE_H_MARGIN },
  section: { marginBottom: 8 },
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
  checkoutFullBleedSection: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: "hidden",
  },
  orderItemsPreview: { gap: 12 },
  orderItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  orderItemDietWrap: {
    paddingTop: 2,
  },
  orderItemMid: { flex: 1, minWidth: 0, paddingRight: 8 },
  orderItemName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1C",
    lineHeight: 20,
  },
  orderItemCustom: {
    fontSize: 12,
    fontWeight: "400",
    color: "#696969",
    marginTop: 2,
    lineHeight: 16,
  },
  orderItemEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  orderItemEditText: { fontSize: 12, fontWeight: "600", color: CX.mint },
  orderItemEditChevron: { marginLeft: -1, marginTop: 1 },
  orderItemRightCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    minWidth: 88,
  },
  orderItemStepperPill: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 88,
    height: 32,
    justifyContent: "space-between",
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CX.mintBorder,
    backgroundColor: CX.mintSoft,
  },
  qtyBtnSmall: {
    minWidth: 24,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyGlyph: {
    fontSize: 16,
    fontWeight: "500",
    color: CX.mint,
    lineHeight: 18,
    textAlign: "center",
  },
  qtyValueSmall: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1C",
    minWidth: 20,
    textAlign: "center",
  },
  orderItemLinePrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1C1C1C",
    marginTop: 8,
    textAlign: "right",
  },
  checkoutActionRowScroll: {
    marginTop: 14,
    marginHorizontal: -16,
  },
  checkoutActionRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  checkoutActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  checkoutActionPillActive: {
    borderColor: CX.mintBorder,
    backgroundColor: CX.mintSoft,
  },
  checkoutActionPillPlus: {
    fontSize: 16,
    fontWeight: "700",
    color: CX.mint,
    lineHeight: 18,
  },
  checkoutActionPillTextMint: {
    fontSize: 13,
    fontWeight: "600",
    color: CX.mint,
  },
  checkoutActionPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#444444",
    flexShrink: 0,
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
  upsellSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  upsellSectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  upsellSectionIconPlus: { position: "absolute", right: 2, bottom: 2 },
  upsellSectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1C",
    letterSpacing: -0.2,
  },
  upsellScrollWrap: {
    marginHorizontal: -16,
  },
  upsellScrollInner: { flex: 1, minHeight: 0, overflow: "visible" },
  upsellScrollContent: {
    paddingVertical: 0,
    paddingHorizontal: 16,
    flexGrow: 0,
    alignItems: "flex-start",
  },
  upsellCard: {
    flexShrink: 0,
    marginRight: 0,
    alignItems: "stretch",
    backgroundColor: "transparent",
    padding: 0,
    paddingBottom: 4,
    overflow: "visible",
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
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: CX.mintBorder,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  upsellName: {
    alignSelf: "stretch",
    fontSize: 12,
    fontWeight: "500",
    color: "#1C1C1C",
    marginTop: 8,
    lineHeight: 16,
    textAlign: "left",
  },
  gmCheckoutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFEFEF",
    ...GatiMitraColors.elevationShadow,
  },
  gmSavingsBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DBEAFE",
  },
  gmSavingsBannerEmoji: { fontSize: 16 },
  gmSavingsBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
    lineHeight: 18,
  },
  gmCardPad: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  gmCardPadH: { paddingHorizontal: 14 },
  gmCardDash: {
    marginHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    borderStyle: Platform.OS === "ios" ? "dotted" : "dashed",
  },
  gmEtaLine: {
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    fontWeight: "500",
    lineHeight: 20,
  },
  gmEtaFlashIcon: { marginTop: 2 },
  gmEtaTextCol: { flex: 1, minWidth: 0 },
  gmEtaBold: { fontWeight: "800", color: GatiMitraColors.emerald },
  scheduledSummaryLine: {
    fontSize: 12,
    fontWeight: "600",
    color: CX.mintDark,
    marginTop: 5,
    lineHeight: 16,
  },
  gmScheduleLine: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginTop: 6,
    lineHeight: 16,
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
    textDecorationColor: "#9CA3AF",
  },
  gmAddrBlock: {
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
  gmAddrChevronHit: {
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    paddingLeft: 4,
  },
  gmAddrRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deliveryAddrPre: { fontWeight: "500", color: GatiMitraColors.textPrimary },
  deliveryAddrName: { fontWeight: "800", color: GatiMitraColors.textPrimary },
  gmContactRow: {
    borderTopWidth: 0,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  gmBillHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  gmBillHeaderWithAttach: {
    paddingBottom: 8,
    borderBottomWidth: 0,
  },
  gmBillHeaderContent: { flex: 1, minWidth: 0 },
  gmBillTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gmBillHeaderMid: { flex: 1, minWidth: 0 },
  gmBillTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary, flex: 1, minWidth: 0 },
  gmBillSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 2 },
  gmBillPendingWallet: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.splashMint,
    marginTop: 3,
  },
  gmBillHeaderRight: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  gmBillPriceCluster: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
    flexShrink: 1,
  },
  gmBillStrike: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  gmBillFinal: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  gmSavedPill: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  gmSavedPillText: { fontSize: 11, fontWeight: "700", color: "#2563EB" },
  gmGoldAttach: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: CX.mintSoft,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gmGoldPointerShell: {
    position: "absolute",
    top: -9,
    left: 16,
    width: 18,
    height: 10,
  },
  gmGoldPointerBorder: {
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
  gmGoldPointerFill: {
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
  gmGoldCrownRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CX.mintDark,
    alignItems: "center",
    justifyContent: "center",
  },
  gmGoldTextCol: { flex: 1, minWidth: 0 },
  gmGoldTitle: { fontSize: 13, fontWeight: "800", color: CX.mintDark, lineHeight: 17 },
  gmGoldSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginTop: 2, lineHeight: 15 },
  gmGoldAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CX.mint,
    backgroundColor: "#FFFFFF",
    minWidth: 72,
    alignItems: "center",
  },
  gmGoldAddBtnApplied: {
    borderColor: CX.mint,
    backgroundColor: CX.mint,
  },
  gmGoldAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: CX.mint,
    textAlign: "center",
  },
  gmGoldAddBtnTextApplied: {
    color: "#FFFFFF",
  },
  deliveryEtaRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
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
  // GatiMitra-style compact donation / tip card (banner + horizontal pill row)
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
  // "Add instructions for delivery partner" - underlined link chip (GatiMitra style)
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
    paddingHorizontal: CHECKOUT_PAGE_H_MARGIN,
    paddingTop: 8,
    backgroundColor: "#F2F2F2",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    zIndex: 50,
    ...GatiMitraColors.elevationShadow,
  },
  gatiCashWalletBarWrap: {
    marginHorizontal: -CHECKOUT_PAGE_H_MARGIN,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
  },
  footerToggleCol: {
    width: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    maxWidth: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: CHECKOUT_FOOTER_TOGGLE_WIDTH,
  },
  footerCtaCol: {
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: CHECKOUT_FOOTER_GAP,
    paddingLeft: CHECKOUT_FOOTER_CTA_LEFT_INSET,
  },
  // Delivery / Takeaway segmented control (reference: white shell, light pink border, magenta active half)
  deliveryTypeToggle: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    borderWidth: 1,
    borderColor: DELIVERY_TOGGLE_BORDER,
    padding: 3,
    overflow: "hidden",
  },
  deliveryTypeSeg: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 1,
    borderRadius: 9,
    gap: 2,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  deliveryTypeSegActive: {
    backgroundColor: DELIVERY_TOGGLE_ACTIVE,
  },
  deliveryTypeSegText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.1,
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
    width: "100%",
    alignSelf: "stretch",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 50,
  },
  footerCtaSlotDisabled: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    backgroundColor: "#9ca3af",
    justifyContent: "center",
    alignItems: "stretch",
    minHeight: 50,
    overflow: "hidden",
  },
  checkoutLegalFooter: { marginTop: 4, lineHeight: 16, fontSize: 11 },
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
  ctaDisabledText: { fontSize: 15, fontWeight: "700", color: "#fff", textAlign: "center" },
  ctaDisabledSplit: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  ctaDisabledAmount: { fontSize: 14, fontWeight: "800", color: "#fff" },
  ctaDisabledLabel: { fontSize: 12, fontWeight: "700", color: "#fff" },
  ctaDisabledHint: { fontSize: 9, color: "rgba(255,255,255,0.9)", marginTop: 1, textAlign: "right" },
  ctaTouch: { borderRadius: CARD_RADIUS, overflow: "hidden", ...GatiMitraColors.cardShadowSoft },
  ctaTouchPressed: { opacity: 0.96 },
  ctaGradient: {
    flex: 1,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 50,
  },
  ctaLeftPart: { flex: 1, minWidth: 0, alignItems: "flex-start", justifyContent: "center" },
  ctaTotalAmount: { fontSize: 14, fontWeight: "800", color: "#fff" },
  ctaTotalLabel: { fontSize: 9, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  ctaRightPart: {
    flexShrink: 0,
    flexGrow: 0,
    marginLeft: 6,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  ctaRightPartDisabled: {
    flexShrink: 0,
    flexGrow: 0,
    marginLeft: 6,
    maxWidth: "48%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  ctaRightPartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaLabel: { fontSize: 12, fontWeight: "700", color: "#fff" },
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
