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
  Pressable,
  Modal,
  BackHandler,
  Platform,
  Alert,
  useWindowDimensions,
  KeyboardAvoidingView,
  Animated as RNAnimated,
  StatusBar as RNStatusBar,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { resolveTabBarBottomInset } from "@/constants/layout";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { keepPreviousData, useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CheckoutDeliveryTypeToggle } from "@/components/checkout/CheckoutDeliveryTypeToggle";
import { CheckoutRiderUnavailableBanner } from "@/components/checkout/CheckoutRiderUnavailableBanner";
import { CheckoutTakeawayConfirmModal } from "@/components/checkout/CheckoutTakeawayConfirmModal";
import { CheckoutAlmostThereModal } from "@/components/checkout/CheckoutAlmostThereModal";
import { CheckoutPayUsingButton } from "@/components/checkout/CheckoutPayUsingButton";
import { CheckoutPaymentReturnOverlay } from "@/components/checkout/CheckoutPaymentFailedSheet";
import { useCheckoutPaymentFailureStore, presentCheckoutPaymentFailure } from "@/store/checkoutPaymentFailureStore";
import { DietIndicator } from "@/components/store/DietIndicator";
import { resolveItemDiet } from "@/lib/itemDiet";
import { merchantService, type MerchantSummary, type MenuItem } from "@/services/merchant.service";
import { ItemCustomizationSheet } from "@/components/ItemCustomizationSheet";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DEFAULT_STATUS_BAR_HEIGHT, STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { haversineKm, SERVICE_RADIUS_KM } from "@/lib/billSummary";
import { formatMerchantDistanceKm } from "@/lib/merchantDistance";
import { matchSavedAddressIdNearCoords } from "@/lib/deliveryDropResolution";
import {
  buildDeliveryInstructionsList,
  parseDeliveryInstructionsList,
} from "@/lib/delivery-instructions";
import { seedOrderDetailCache } from "@/lib/orderDetailCache";
import {
  persistPendingCheckoutPayment,
  peekPendingCheckoutPayment,
  clearPendingCheckoutPayment,
} from "@/lib/pendingCheckoutPayment";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { reverseGeocode } from "@/services/location.service";
import { checkDispatchServiceability } from "@/services/geoServices.service";
import { subscribeRiderOnlineCheckSignal } from "@/hooks/useRiderOnlineCheckRealtime";
import { getStoreDeliveryQuote, type StoreDeliveryQuote } from "@/services/distance.service";
import { checkoutRouterBack } from "@/lib/safeRouterBack";
import { evaluateCartCheckoutEligibility } from "@/lib/cartCheckoutGate";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";
import { useCheckoutPresentation } from "@/lib/checkoutPresentation";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { isNetworkError, getNetworkErrorMessage } from "@/utils/networkError";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAnimatedCount } from "@/hooks/useAnimatedCount";
import { CouponApplyCelebration } from "@/components/checkout/CouponApplyCelebration";
import { CouponAvailableBottomSheet } from "@/components/checkout/CouponAvailableBottomSheet";
import { BillSummarySheet } from "@/components/checkout/BillSummarySheet";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { AnimatedRupeeAmount } from "@/components/checkout/AnimatedRupeeAmount";
import { CheckoutGatiCashWalletBar } from "@/components/checkout/CheckoutGatiCashWalletBar";
import { CheckoutMissedOfferWalletCard } from "@/components/checkout/CheckoutMissedOfferWalletCard";
import { MissedOfferUnlockSheet } from "@/components/checkout/MissedOfferUnlockSheet";
import { MissedOfferWalletCelebration } from "@/components/checkout/MissedOfferWalletCelebration";
import {
  resolveMissedOfferWalletCompensation,
  missedOfferKeyForCandidate,
  listMissedOfferWalletCandidates,
  isMerchantPrecisionOfferBlockedFromGatiCash,
  liveUnlockGapInr,
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
import { OutOfDeliveryZoneSheet } from "@/components/checkout/OutOfDeliveryZoneSheet";
import {
  useCouponAvailablePrompt,
  type CouponAvailablePrompt,
} from "@/hooks/useCouponAvailablePrompt";
import {
  friendlyCheckoutDiscountLabel,
  isSubscriptionBenefitDiscount,
  splitCheckoutDiscounts,
} from "@/lib/checkout-discount-display";
import {
  computeAppliedCheckoutSavings,
  formatCheckoutSavingsRupees,
  hasAppliedMembershipFreeDelivery,
} from "@/lib/checkoutAppliedSavings";
import { resolveMembershipDeliverySavingsDisplay } from "@/lib/gmitraPlusDeliverySave";
import {
  buildBillingCalculateParams,
  buildBillingCalculateQueryKey,
  type BillingCalculateKeyParams,
} from "@/lib/billingCalculateQuery";
import { DeliveryAddressText } from "@/components/address/DeliveryAddressText";
import {
  computeCheckoutStrikethroughTotal,
  computeCheckoutToPayAmount,
} from "@/lib/checkoutToPayAmount";
import { CURRENT_SUBSCRIPTION_QUERY_KEY } from "@/lib/subscriptionCache";
import { useCheckoutOfferStore } from "@/store/checkoutOfferStore";
import { useCheckoutAddressHandoffStore } from "@/store/checkoutAddressHandoffStore";
import { useAuthStore } from "@/store/authStore";
import { walletService } from "@/services/wallet.service";
import { DeliveryPartnerInstructionSheet } from "@/components/address/DeliveryPartnerInstructionSheet";
import { StoreScheduleSheet } from "@/components/store/StoreScheduleSheet";
import { cartAddonTotalPerUnit, cartLineBaseUnitPrice } from "@/lib/cart-line-pricing";
import { cartItemBaseId } from "@/lib/cart-line-identity";
import {
  normalizeOrderItemSpecialInstructions,
  specialInstructionsIntoSnapshot,
} from "@/lib/order-item-special-instructions";
import { openCheckoutAddAddress } from "@/lib/openCheckoutAddAddress";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import {
  buildItemOfferDisplayMap,
  estimateBoostUnitPrice,
  formatOfferRupee,
  type ItemOfferDisplay,
} from "@/lib/itemOfferDisplay";
import { computeIsDiscountEligible } from "@/lib/cartDiscountEligibility";
import {
  buildStoreOffersQueryKey,
  STORE_OFFERS_STALE_MS,
} from "@/lib/prefetchStoreOffers";
import { offersService } from "@/services/offers.service";
import {
  prefetchMenuItemFullConfig,
  prefetchMenuItemFullConfigsForMenu,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { MerchantUiThemeProvider, useMerchantUiDark, MerchantDarkPalette } from "@/features/merchant-detail/merchantUiTheme";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
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
/**
 * Wait before re-hitting billing-calculate / checkout-offers after a quantity +/- tap —
 * coalesces rapid taps into one network round trip instead of one per tap. The displayed
 * total does NOT wait on this: see the optimistic `toPayAmount` overlay below, which
 * updates instantly from the last confirmed server bill + the client-known price delta.
 */
const CART_QTY_BILLING_DEBOUNCE_MS = 250;
/** Hold-to-repeat stepper timing — pause before repeat starts, then repeat interval. */
const STEPPER_HOLD_DELAY_MS = 400;
const STEPPER_REPEAT_MS = 120;

function roundBillAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable empty-array reference — `data: addresses = []` would otherwise allocate a new
 * array every render while the query hasn't resolved, invalidating any memo keyed on it. */
const EMPTY_ADDRESSES: Address[] = [];

/**
 * Catalog / strike / net line totals — same rules as `CheckoutCartLineRow`
 * (Boost "Get for", then MRP strike when no Boost).
 */
function cartLineStrikeNetTotals(
  item: CartItem & { catalogMrp?: number | null },
  itemOfferById: Map<string, ItemOfferDisplay>
): { strike: number | null; net: number; catalog: number } {
  const baseId = cartItemBaseId(item.menuItemId);
  const itemOffer = itemOfferById.get(item.menuItemId) ?? itemOfferById.get(baseId) ?? null;
  const catalogBase =
    item.basePrice != null && item.basePrice > 0 ? item.basePrice : cartLineBaseUnitPrice(item);
  const addonPerUnit = cartAddonTotalPerUnit(item);
  const boostBase = estimateBoostUnitPrice(catalogBase, itemOffer);
  const showOfferPrice = boostBase != null && boostBase < catalogBase - 0.001;
  const catalogAllIn = Math.round(catalogBase + addonPerUnit);
  const offerAllIn = showOfferPrice ? Math.round(boostBase! + addonPerUnit) : catalogAllIn;
  const catalog = catalogAllIn * item.quantity;
  const mrpLineTotal =
    item.catalogMrp != null && item.catalogMrp > catalogBase
      ? Math.round(item.catalogMrp + addonPerUnit) * item.quantity
      : null;
  const showMrpStrike = !showOfferPrice && mrpLineTotal != null;
  const strike = showOfferPrice ? catalog : showMrpStrike ? mrpLineTotal! : null;
  const net = showOfferPrice ? offerAllIn * item.quantity : catalog;
  return {
    strike: strike != null && strike > net ? strike : null,
    net,
    catalog,
  };
}

/** Effective per-unit price (post Boost/BOGO override + addons) — same math used for
 * each row's own "Get for" price, kept here so the optimistic total delta never diverges
 * from what each line already displays. */
function effectiveCartLineUnitPrice(
  item: CartItem,
  itemOfferById: Map<string, ItemOfferDisplay>
): number {
  const { net } = cartLineStrikeNetTotals(item, itemOfferById);
  return item.quantity > 0 ? Math.round(net / item.quantity) : net;
}

/** Sum of effectiveCartLineUnitPrice × quantity across a cart snapshot. */
function effectiveCartValue(
  cartItems: CartItem[],
  itemOfferById: Map<string, ItemOfferDisplay>
): number {
  return cartItems.reduce(
    (sum, item) => sum + effectiveCartLineUnitPrice(item, itemOfferById) * item.quantity,
    0
  );
}

/** Full item+addon cart value — shared by the instant (live) and debounced (network) views. */
function computeFullCartSubtotal(cartItems: CartItem[]): number {
  return cartItems.reduce((s, i) => {
    const base = cartLineBaseUnitPrice(i);
    const line = base * i.quantity;
    const addonLine = (i.addons ?? []).reduce(
      (a, ad) => a + ad.addonPrice * ad.quantity * i.quantity,
      0
    );
    return s + line + addonLine;
  }, 0);
}

/** Checkout-offer-eligible base (lines without item Boost/BOGO) — shared live/debounced. */
function computeEligibleCheckoutSubtotal(
  cartItems: CartItem[],
  itemOfferById: Map<string, ItemOfferDisplay>
): number {
  let sum = 0;
  for (const item of cartItems) {
    const baseId = cartItemBaseId(item.menuItemId);
    const itemOffer = itemOfferById.get(item.menuItemId) ?? itemOfferById.get(baseId) ?? null;
    if (itemOffer != null) continue;
    if (item.isDiscountEligible === false) continue;
    const unit = cartLineBaseUnitPrice(item) + cartAddonTotalPerUnit(item);
    sum += unit * item.quantity;
  }
  return Math.max(0, Math.round(sum * 100) / 100);
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

/** Place Order CTA — solid forest green (never LinearGradient; paints reliably on Android). */
const CHECKOUT_CTA_GREEN = "#137243";
const CHECKOUT_CTA_GREEN_WAIT = "#0F5132";
const CHECKOUT_CTA_GREEN_MUTED = "#6B7280";

/** Matches checkout header strip — synced with root status bar via screenChromeStore. */
const CHECKOUT_HEADER_BG = "#F8F8F8";

/** Shared size for address / instructions / contact / bill trailing chevrons. */
const CHECKOUT_META_CHEVRON_SIZE = 14;

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

function formatCanonicalQuoteDistance(quote: StoreDeliveryQuote | undefined): string {
  const km = quote?.distance_km;
  if (km == null || !Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function isCheckoutSheetAddressOutOfZone(
  quote: StoreDeliveryQuote | undefined,
  _storeLat: number | null | undefined,
  _storeLng: number | null | undefined,
  _addr: Address
): boolean {
  if (quote == null) return false;
  if (quote.unserviceable_reason === "out_of_range") return true;
  return quote.serviceable === false;
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

function findMenuItemByCartBaseId(
  menu: import("@/services/merchant.service").MenuItem[] | undefined,
  baseId: string
): import("@/services/merchant.service").MenuItem | undefined {
  if (!menu?.length || !baseId) return undefined;
  return menu.find(
    (m) => m.id === baseId || (m.menuItemId != null && String(m.menuItemId) === baseId)
  );
}

/** Shared by the live (order-payload) and debounced (billing-preview) snapshots below —
 * keeping one function means the two can never silently diverge in shape. */
function buildItemsWithSnapshots(
  cartItems: CartItem[],
  merchantMenu: import("@/services/merchant.service").MenuItem[] | undefined
) {
  return cartItems.map((i) => {
    const bid = cartItemBaseId(i.menuItemId);
    const menuItem = findMenuItemByCartBaseId(merchantMenu, bid);
    const categoryName =
      (menuItem as { categoryName?: string } | undefined)?.categoryName ??
      (menuItem as { category_name?: string } | undefined)?.category_name;
    const rawPack =
      (menuItem as { packaging_charges?: number; packagingCharges?: number } | undefined)
        ?.packaging_charges ??
      (menuItem as { packagingCharges?: number } | undefined)?.packagingCharges;
    const packNum = rawPack != null ? Number(rawPack) : NaN;
    const note = normalizeOrderItemSpecialInstructions(i.specialInstructions);
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
      specialInstructions: note,
      isDiscountEligible: i.isDiscountEligible,
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
      itemSnapshot: specialInstructionsIntoSnapshot(snap, note),
    };
  });
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

/** Shown in "Order failed" alert when payment may have been charged. */
const ORDER_FAILED_REFUND_NOTE =
  " If you were charged, the amount will be reverted within 24–48 working hours. In some cases, refunds may be instant. For any issues, contact support with your payment details.";

/** Max tip amount (₹) for custom "Other" — was 60 and silently capped every larger tip to ₹60. */
const TIP_CUSTOM_MAX = 10_000;

/** Horizontal marquee for restaurant note below utility pills. */
function RestaurantNoteMarquee({ note }: { note: string }) {
  const dark = useMerchantUiDark();
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
      style={[restaurantNoteMarqueeStyles.wrap, dark && restaurantNoteMarqueeStyles.wrapDark]}
      onLayout={(e) => {
        viewW.current = e.nativeEvent.layout.width;
      }}
    >
      <RNAnimated.View style={{ flexDirection: "row", transform: [{ translateX }] }}>
        <CheckoutText
          style={[restaurantNoteMarqueeStyles.text, dark && restaurantNoteMarqueeStyles.textDark]}
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
  wrapDark: {
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    borderColor: "rgba(45, 212, 191, 0.35)",
  },
  textDark: { color: DiscoveryColors.teal },
});

/** Footer delivery / takeaway — active segment matches Place Order CTA green. */
const DELIVERY_TOGGLE_ACTIVE = CHECKOUT_CTA_GREEN;
const DELIVERY_TOGGLE_BORDER = "rgba(19, 114, 67, 0.38)";

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
const CHECKOUT_SCROLL_FOOTER_BASE = 110;
/** Extra scroll inset when GatiCash wallet bar is visible above the place-order row. */
const CHECKOUT_SCROLL_GATICASH_BAR_EXTRA = 92;
/** Breathing room so `BrandingFooter` tagline + watermark sit fully above the fixed footer. */
const CHECKOUT_SCROLL_BRANDING_CLEARANCE = 20;

type CheckoutCartLineItem = CartItem & {
  imageUrl: string | null;
  checkoutSubtext: string | null;
  catalogMrp: number | null;
};

type CheckoutCartLineRowProps = {
  item: CheckoutCartLineItem;
  itemOfferById: Map<string, ItemOfferDisplay>;
  serverLineEligibilityById: Map<
    string,
    { isDiscountEligible: boolean; ineligibilityReason: "ITEM_PROMO" | "MRP" | null }
  >;
  foodType?: string | null;
  onEdit: (item: CartItem) => void;
  onIncrement: (lineId: string) => void;
  onDecrement: (lineId: string) => void;
};

/**
 * One cart line in the checkout order summary — quantity stepper + price. Memoized so a
 * quantity tap on ONE line only re-renders that line, not the other ~10-20 lines in the
 * cart or anything else on this 8000-line screen. `onIncrement`/`onDecrement` must be
 * stable (menuItemId-parameterized dispatchers, not fresh per-row closures) for this to
 * actually bail out — see `handleIncrementCartLine`/`handleDecrementCartLine` below.
 */
const CheckoutCartLineRow = React.memo(function CheckoutCartLineRow({
  item,
  itemOfferById,
  serverLineEligibilityById,
  foodType,
  onEdit,
  onIncrement,
  onDecrement,
}: CheckoutCartLineRowProps) {
  const dark = useMerchantUiDark();
  const sub = item.checkoutSubtext;
  const baseId = cartItemBaseId(item.menuItemId);
  const itemOffer = itemOfferById.get(item.menuItemId) ?? itemOfferById.get(baseId) ?? null;
  const catalogBase =
    item.basePrice != null && item.basePrice > 0 ? item.basePrice : cartLineBaseUnitPrice(item);
  const boostBase = estimateBoostUnitPrice(catalogBase, itemOffer);
  const showOfferPrice = boostBase != null && boostBase < catalogBase - 0.001;
  const { strike: strikeLineTotal, net: netLineTotal, catalog: catalogLineTotalRounded } =
    cartLineStrikeNetTotals(item, itemOfferById);
  const showStrikeRow = strikeLineTotal != null && strikeLineTotal > netLineTotal;
  const serverElig =
    serverLineEligibilityById.get(baseId) ?? serverLineEligibilityById.get(item.menuItemId);
  // Boost/BOGO on the line → always show; server ITEM_PROMO reinforces.
  const showCheckoutOfferIneligible =
    itemOffer?.kind === "bogo" || showOfferPrice || serverElig?.ineligibilityReason === "ITEM_PROMO";
  const fmtLine = formatOfferRupee;

  const handleEditPress = useCallback(() => onEdit(item), [onEdit, item]);

  /** Blocks double-fire if pressIn fires twice for one gesture (no recycling risk here —
   * this row is a stable instance per item.menuItemId, not reused across items). */
  const stepperHandledRef = useRef(false);
  const runStepperOnce = useCallback((fn: () => void) => {
    if (stepperHandledRef.current) return;
    stepperHandledRef.current = true;
    fn();
    setTimeout(() => {
      stepperHandledRef.current = false;
    }, 90);
  }, []);
  const handleDecPress = useCallback(
    () => runStepperOnce(() => onDecrement(item.lineId)),
    [runStepperOnce, onDecrement, item.lineId]
  );
  const handleIncPress = useCallback(
    () => runStepperOnce(() => onIncrement(item.lineId)),
    [runStepperOnce, onIncrement, item.lineId]
  );

  /** Hold-to-repeat: first tap fires immediately (above), then holding auto-repeats
   * every STEPPER_REPEAT_MS after an initial STEPPER_HOLD_DELAY_MS pause. */
  const repeatTimersRef = useRef<{
    timeout: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
  }>({ timeout: null, interval: null });
  const clearRepeatTimers = useCallback(() => {
    const t = repeatTimersRef.current;
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
    t.timeout = null;
    t.interval = null;
  }, []);
  useEffect(() => clearRepeatTimers, [clearRepeatTimers]);
  const startHoldRepeat = useCallback(
    (step: () => void) => {
      clearRepeatTimers();
      repeatTimersRef.current.timeout = setTimeout(() => {
        repeatTimersRef.current.interval = setInterval(step, STEPPER_REPEAT_MS);
      }, STEPPER_HOLD_DELAY_MS);
    },
    [clearRepeatTimers]
  );
  const handleDecPressIn = useCallback(() => {
    handleDecPress();
    startHoldRepeat(() => onDecrement(item.lineId));
  }, [handleDecPress, startHoldRepeat, onDecrement, item.lineId]);
  const handleIncPressIn = useCallback(() => {
    handleIncPress();
    startHoldRepeat(() => onIncrement(item.lineId));
  }, [handleIncPress, startHoldRepeat, onIncrement, item.lineId]);

  const animatedQuantity = Math.round(useAnimatedCount(item.quantity));
  const animatedNetLineTotal = useAnimatedCount(netLineTotal);
  const animatedStrikeLineTotal = useAnimatedCount(strikeLineTotal ?? netLineTotal);
  const animatedCatalogLineTotal = useAnimatedCount(catalogLineTotalRounded);

  return (
    <View style={styles.orderItemRow}>
      <View style={styles.orderItemDietWrap}>
        <DietIndicator type={resolveItemDiet({ foodType, isVeg: item.isVeg })} />
      </View>
      <View style={styles.orderItemMid}>
        <View style={styles.orderItemNameRow}>
          <View style={[styles.orderItemNameDashWrap, dark && styles.orderItemNameDashWrapDark]}>
            <CheckoutText style={[styles.orderItemName, dark && styles.darkText]} numberOfLines={2}>
              {item.name}
            </CheckoutText>
          </View>
          {itemOffer?.kind === "bogo" ? (
            <View style={[styles.orderItemBogoPill, dark && styles.darkBogoPill]} accessibilityLabel={itemOffer.label}>
              <CheckoutText style={[styles.orderItemBogoPillText, dark && styles.darkTealText]} numberOfLines={1}>
                {itemOffer.label}
              </CheckoutText>
            </View>
          ) : null}
        </View>
        {sub ? (
          <CheckoutText style={[styles.orderItemCustom, dark && styles.darkMuted]} numberOfLines={2}>
            {sub}
          </CheckoutText>
        ) : null}
        {item.specialInstructions?.trim() ? (
          <CheckoutText style={styles.orderItemCooking} numberOfLines={2}>
            Cooking: {item.specialInstructions.trim()}
          </CheckoutText>
        ) : null}
        <TouchableOpacity
          style={styles.orderItemEditHit}
          onPress={handleEditPress}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityLabel="Edit item"
        >
          <View style={styles.orderItemEditRow}>
          <CheckoutText style={styles.orderItemEditText}>Edit</CheckoutText>
          <Ionicons
            name="chevron-forward"
            size={11}
            color={CX.mint}
            style={styles.orderItemEditChevron}
          />
          </View>
        </TouchableOpacity>
        {showCheckoutOfferIneligible ? (
          <CheckoutText style={styles.orderItemIneligible}>
            NOT ELIGIBLE FOR CHECKOUT OFFERS
          </CheckoutText>
        ) : null}
      </View>
      <View style={styles.orderItemRightCol}>
        <View style={[styles.orderItemStepperPill, dark && styles.darkStepper]}>
          <Pressable
            onPressIn={handleDecPressIn}
            onPressOut={clearRepeatTimers}
            delayPressIn={0}
            unstable_pressDelay={0}
            style={styles.qtyBtnSmall}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
          >
            <CheckoutText style={styles.qtyGlyph}>−</CheckoutText>
          </Pressable>
          <CheckoutText style={[styles.qtyValueSmall, dark && styles.darkText]}>{animatedQuantity}</CheckoutText>
          <Pressable
            onPressIn={handleIncPressIn}
            onPressOut={clearRepeatTimers}
            delayPressIn={0}
            unstable_pressDelay={0}
            style={styles.qtyBtnSmall}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
          >
            <CheckoutText style={styles.qtyGlyph}>+</CheckoutText>
          </Pressable>
        </View>
        {showStrikeRow ? (
          <View style={styles.orderItemPriceCol}>
            <CheckoutText style={styles.orderItemLinePriceStrike}>
              {fmtLine(animatedStrikeLineTotal)}
            </CheckoutText>
            <CheckoutText style={styles.orderItemLinePriceOffer}>
              {fmtLine(animatedNetLineTotal)}
            </CheckoutText>
          </View>
        ) : (
            <CheckoutText style={[styles.orderItemLinePrice, dark && styles.darkText]}>
              {fmtLine(animatedCatalogLineTotal)}
            </CheckoutText>
        )}
      </View>
    </View>
  );
});

/**
 * Dev-only checkout perf tracing (Phase 13). The `__DEV__` guard compiles this out
 * of release builds — it emits nothing in production. Pair it with the adb
 * `top -H` / gfxinfo capture to correlate JS timings against the on-device freeze.
 */
const perfNow = (): number =>
  (globalThis as { performance?: { now?: () => number } }).performance?.now?.() ??
  Date.now();
function checkoutPerfLog(evt: string, ms?: number): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(
    ms == null
      ? `[PERF][CHECKOUT] ${evt}`
      : `[PERF][CHECKOUT] ${evt} ${ms.toFixed(0)}ms`
  );
}

export default function CheckoutRoute() {
  return (
    <AppErrorBoundary source="checkout" resetKey="checkout">
      <CheckoutScreen />
    </AppErrorBoundary>
  );
}

function CheckoutScreen() {
  const router = useRouter();
  const { variant: checkoutVariant, onSheetClose } = useCheckoutPresentation();
  const isCheckoutSheet = checkoutVariant === "sheet";
  const isDiscoveryDark = useDiscoveryLayout();
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

  // [PERF][CHECKOUT] mount timing — first render → committed mount (dev only).
  const perfMountStartRef = useRef(perfNow());
  const perfMountLoggedRef = useRef(false);
  useEffect(() => {
    if (perfMountLoggedRef.current) return;
    perfMountLoggedRef.current = true;
    checkoutPerfLog("mount", perfNow() - perfMountStartRef.current);
  }, []);

  useLayoutEffect(() => {
    void hydrateSubscriptionPlansCache(queryClient);
  }, [queryClient]);

  useEffect(() => {
    void prefetchSubscriptionPlans(queryClient);
  }, [queryClient]);

  /**
   * Narrow selectors — the un-selected `useCartStore()` used to subscribe this whole
   * ~8000-line screen to every store field (stashedCarts, hydrated, merchantBannerUrl,
   * etc.), not just the ones actually used here, so unrelated store writes re-rendered
   * the entire page.
   */
  const items = useCartStore((s) => s.items);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const syncPricesFromMap = useCartStore((s) => s.syncPricesFromMap);
  const syncDiscountEligibility = useCartStore((s) => s.syncDiscountEligibility);

  const { data: merchantAbout } = useQuery({
    queryKey: ["merchant-about", merchantId],
    queryFn: () => merchantService.getMerchantAbout(merchantId!),
    enabled: !!merchantId,
  });

  /** Grocery checkouts must not receive FOOD-scoped platform offers. */
  const billingServiceType = useMemo(() => {
    const st = String(merchantAbout?.store_type ?? "").trim().toUpperCase();
    return st === "GROCERY" ? "GROCERY" : "FOOD";
  }, [merchantAbout?.store_type]);

  useEffect(() => {
    if (items.length === 0) return;
    void evaluateCartCheckoutEligibility(queryClient).then((eligibility) => {
      if (eligibility.allowed) return;
      if (isCheckoutSheet) {
        useCheckoutSheetStore.getState().hide();
      } else {
        checkoutRouterBack(router, merchantId);
      }
      useCartCheckoutGateStore.getState().show();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- gate only on first checkout entry
  /** Stable per-line dispatchers — required for CheckoutCartLineRow's React.memo to bail
   * on rows other than the one actually tapped (see component definition above). */
  const handleIncrementCartLine = useCallback(
    (lineId: string) => updateQuantity(lineId, 1),
    [updateQuantity]
  );
  const handleDecrementCartLine = useCallback(
    (lineId: string) => updateQuantity(lineId, -1),
    [updateQuantity]
  );
  const replaceLine = useCartStore((s) => s.replaceLine);
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
  const { data: currentSubscription, refetch: refetchCurrentSubscription } =
    useCurrentSubscription(true);
  /** Live membership from GET /subscription/current (DB: active + not expired). */
  const subscriptionActiveFromApi = currentSubscription?.active === true;
  const alreadySubscribed = subscriptionActiveFromApi;
  /** Upsell / opt-in — never for users the API already marks as active members. */
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
  const [instructionSheetVisible, setInstructionSheetVisible] = useState(false);
  const [addressSheetVisible, setAddressSheetVisible] = useState(false);
  const [addressSheetBusyId, setAddressSheetBusyId] = useState<number | null>(null);
  const [outOfZoneMessageVisible, setOutOfZoneMessageVisible] = useState(false);
  const [deliveryUnavailableAlert, setDeliveryUnavailableAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [riderAvailabilityRefreshing, setRiderAvailabilityRefreshing] = useState(false);
  const [takeawayConfirmVisible, setTakeawayConfirmVisible] = useState(false);
  const [almostThereModal, setAlmostThereModal] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const recheckDeliveryUnavailableGateRef = useRef<(forceShow: boolean) => Promise<boolean>>(
    async () => true
  );
  useEffect(
    () =>
      subscribeRiderOnlineCheckSignal((payload) => {
        if (payload.require_rider_online_check === false) {
          setDeliveryUnavailableAlert(null);
        }
        void recheckDeliveryUnavailableGateRef.current(payload.require_rider_online_check === true);
      }),
    []
  );
  const [receiverSheetVisible, setReceiverSheetVisible] = useState(false);
  const [communityInitiativeSheetVisible, setCommunityInitiativeSheetVisible] = useState(false);
  const [donateWithSheetVisible, setDonateWithSheetVisible] = useState(false);
  const [donationScope, setDonationScope] = useState<DonationScope>("every_order");
  const [receiverDraftName, setReceiverDraftName] = useState("");
  const [receiverDraftMobile, setReceiverDraftMobile] = useState("");
  /** Order contact — defaults to logged-in profile; override only if user edits this checkout. */
  const [checkoutReceiverName, setCheckoutReceiverName] = useState("");
  const [checkoutReceiverMobile, setCheckoutReceiverMobile] = useState("");
  /** Once true, do not re-seed from profile for this checkout session. */
  const receiverManuallyEditedRef = useRef(false);
  const [deliveryPartnerNote, setDeliveryPartnerNote] = useState("");
  const [instrLeaveWithGuard, setInstrLeaveWithGuard] = useState(false);
  const [instrAvoidCalling, setInstrAvoidCalling] = useState(false);
  const [instrDontRingBell, setInstrDontRingBell] = useState(false);
  const [instrPetAtHome, setInstrPetAtHome] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [pendingCustomizationItem, setPendingCustomizationItem] = useState<MenuItem | null>(null);
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
  /** True only after user taps Apply / enters coupon — keeps that pick until they remove it. */
  const [checkoutOfferUserPinned, setCheckoutOfferUserPinned] = useState(false);
  const [currentLocationDisplay, setCurrentLocationDisplay] = useState<{ label: string; fullAddress: string } | null>(null);
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [donationPreset, setDonationPreset] = useState<5 | 10 | 15 | 20 | "custom" | null>(null);
  const [razorpayOrderParams, setRazorpayOrderParams] = useState<(RazorpayOrderParams & { pendingId?: string }) | null>(null);
  const [razorpayModalVisible, setRazorpayModalVisible] = useState(false);
  const [razorpayCreating, setRazorpayCreating] = useState(false);
  const [paymentReturnBusy, setPaymentReturnBusy] = useState(false);
  const paymentFailureRetryNonce = useCheckoutPaymentFailureStore((s) => s.retryNonce);
  const paymentFailureChooseNonce = useCheckoutPaymentFailureStore((s) => s.chooseMethodNonce);
  const [simulatedPaymentOrder, setSimulatedPaymentOrder] = useState<{ orderId: string; amount: number; pendingId?: string } | null>(null);

  const paymentInProgress =
    razorpayModalVisible ||
    paymentReturnBusy ||
    razorpayCreating ||
    simulatedPaymentOrder != null;

  useFocusEffect(
    useCallback(() => {
      if (paymentInProgress) return;
      void refetchCurrentSubscription();
      void queryClient.invalidateQueries({ queryKey: CURRENT_SUBSCRIPTION_QUERY_KEY });
    }, [queryClient, refetchCurrentSubscription, paymentInProgress])
  );

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

  useEffect(() => {
    void peekPendingCheckoutPayment().then((pending) => {
      if (pending?.idempotencyKey && !idempotencyKeyRef.current) {
        idempotencyKeyRef.current = pending.idempotencyKey;
      }
    });
  }, []);

  const { data: addresses = EMPTY_ADDRESSES, isLoading: addressesLoading } = useQuery({
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
    // Address changes are explicitly invalidated elsewhere (address picker,
    // handoff flow below) — staleTime: 0 forced a network round trip on
    // every checkout open, adding latency before pricing/quote can settle.
    staleTime: 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      const handoff = useCheckoutAddressHandoffStore.getState().consumePending();
      if (
        handoff?.addressId != null &&
        Number.isFinite(handoff.addressId) &&
        merchantId
      ) {
        if (handoff.serviceable === false) {
          setSelectedAddressId(null);
          setAddressSheetVisible(true);
          setOutOfZoneMessageVisible(true);
        } else if (handoff.serviceable === true) {
          // Address cache was optimistically populated before navigation, so
          // delivery row + Place Order footer render on the first checkout frame.
          idempotencyKeyRef.current = null;
          setSelectedAddressId(handoff.addressId);
          setAddressSheetVisible(false);
          instructionsHydratedForAddressRef.current = null;
        } else {
        // A newly-created address is only handed into checkout after the
        // canonical store quote confirms it is deliverable.
        void getStoreDeliveryQuote({
          storeId: merchantId,
          addressId: handoff.addressId,
          serviceType: "FOOD",
          skipCache: true,
        })
          .then((quote) => {
            if (!quote.serviceable) {
              setSelectedAddressId(null);
              setAddressSheetVisible(true);
              setOutOfZoneMessageVisible(true);
              return;
            }
            idempotencyKeyRef.current = null;
            setSelectedAddressId(handoff.addressId);
            setAddressSheetVisible(false);
            instructionsHydratedForAddressRef.current = null;
          })
          .catch(() => {
            setSelectedAddressId(null);
            setAddressSheetVisible(true);
            Alert.alert(
              "Could not verify address",
              "Please check your connection and select the address again."
            );
          });
        }
      }
    }, [merchantId, queryClient])
  );

  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);

  useFocusEffect(
    useCallback(() => {
      if (isCheckoutSheet) return;
      const headerBg = isDiscoveryDark ? DiscoveryColors.bg : CHECKOUT_HEADER_BG;
      useScreenChromeStore.setState({
        statusBarBackground: headerBg,
        statusBarStyle: isDiscoveryDark ? "light" : "dark",
        // Checkout stack already owns top inset. Keep spacer off-guard: `true` here
        // gets overwritten to a white bar by StatusBarRouteChromeGuard.
        hideStatusBarSpacer: false,
      });
      RNStatusBar.setHidden(false, "none");
      RNStatusBar.setBarStyle(isDiscoveryDark ? "light-content" : "dark-content", true);
      if (Platform.OS === "android") {
        RNStatusBar.setTranslucent(false);
        RNStatusBar.setBackgroundColor(headerBg, true);
      }
      return () => resetStatusBarBackground();
    }, [isCheckoutSheet, isDiscoveryDark, resetStatusBarBackground])
  );

  // Only a serviceability-validated id can become the checkout address.
  // Candidate resolution (nearby/default/handoff) happens below and must pass
  // the canonical store quote before writing selectedAddressId.
  const selectedAddress = useMemo(() => {
    if (selectedAddressId == null) return undefined;
    return addresses.find((a) => a.id === selectedAddressId) ?? undefined;
  }, [addresses, selectedAddressId]);

  const hasDeliveryAddress = selectedAddress != null;
  const needsDeliveryAddress =
    deliveryType === "delivery" && !hasDeliveryAddress;
  const deliveryFeePending = needsDeliveryAddress;

  const checkoutAddressServiceability = useQueries({
    queries: addresses.map((addr) => ({
      queryKey: ["store-delivery-quote", merchantId, addr.id, "checkout-address-sheet"],
      queryFn: () =>
        getStoreDeliveryQuote({
          storeId: merchantId!,
          addressId: addr.id,
          serviceType: "FOOD",
        }),
      enabled: addressSheetVisible && !!merchantId,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
    })),
  });

  const checkoutReceiverSummary = useMemo(() => {
    return formatCheckoutReceiverLine(checkoutReceiverName, checkoutReceiverMobile);
  }, [checkoutReceiverName, checkoutReceiverMobile]);

  const hasCheckoutReceiverDetails =
    checkoutReceiverName.trim().length > 0 && checkoutReceiverMobile.trim().length > 0;

  const profileContactName = userProfile?.full_name?.trim() || "";
  const profileContactMobile = userProfile?.mobile_number?.trim() || "";

  // Every checkout visit: use logged-in profile name + number until the user
  // manually edits contact for this order. Never prefer address.contact* —
  // that stores past one-off receivers and caused stale wrong names.
  useEffect(() => {
    if (receiverManuallyEditedRef.current) return;
    if (profileContactName) setCheckoutReceiverName(profileContactName);
    if (profileContactMobile) setCheckoutReceiverMobile(profileContactMobile);
  }, [profileContactName, profileContactMobile]);

  /** Clear then rehydrate rider instructions whenever the delivery address changes. */
  useEffect(() => {
    if (!selectedAddress) {
      instructionsHydratedForAddressRef.current = null;
      setDeliveryPartnerNote("");
      setLeaveAtDoor(false);
      setInstrLeaveWithGuard(false);
      setInstrAvoidCalling(false);
      setInstrDontRingBell(false);
      setInstrPetAtHome(false);
      return;
    }
    if (instructionsHydratedForAddressRef.current === selectedAddress.id) return;
    instructionsHydratedForAddressRef.current = selectedAddress.id;
    if (!selectedAddress.deliveryInstructionsList?.length) {
      setDeliveryPartnerNote("");
      // New addresses start with the checkout's default safe instruction.
      setLeaveAtDoor(true);
      setInstrLeaveWithGuard(false);
      setInstrAvoidCalling(false);
      setInstrDontRingBell(false);
      setInstrPetAtHome(false);
      return;
    }
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
  // Only promote to locationSource "selected" when the user is already on a selected pin
  // or explicitly chose an address in this checkout — never when browsing on live GPS
  // with a far-away default address auto-filled.
  useEffect(() => {
    if (!selectedAddress) return;

    const lat = selectedAddress.latitude;
    const lng = selectedAddress.longitude;

    const sameAsSession =
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

    if (locationSource === "current") {
      // Live GPS: sync pin coords only when checkout snapped to a nearby saved row.
      // Omit addressId so we never clear a concurrent Saved Address binding.
      const nearGps =
        sessionCoords != null &&
        matchSavedAddressIdNearCoords(addresses, sessionCoords.latitude, sessionCoords.longitude, 0.25) ===
          selectedAddress.id;
      if (nearGps && !sameAsActive) {
        addressService
          .setActiveLocation({
            latitude: lat,
            longitude: lng,
            address: selectedAddress.fullAddress,
          })
          .catch(() => {});
      }
      return;
    }

    if (
      sameAsSession &&
      sameAsActive &&
      locationSource === "selected" &&
      activeLocation?.addressId === selectedAddress.id
    ) {
      return;
    }

    // Update local app "selected" location (used by merchants list + merchant detail).
    if (!sameAsSession || locationSource !== "selected") {
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
    if (!sameAsActive || activeLocation?.addressId !== selectedAddress.id) {
      addressService
        .setActiveLocation({
          latitude: lat,
          longitude: lng,
          address: selectedAddress.fullAddress,
          addressId: selectedAddress.id,
        })
        .catch(() => {});
    }
  }, [
    activeLocation?.latitude,
    activeLocation?.longitude,
    activeLocation?.addressId,
    addresses,
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
   * 1) Backend-bound activeLocation.addressId (Saved / Add New)
   * 2) In-memory map pin when user chose a saved address or map (locationSource === "selected")
   * 3) Nearby saved address to live GPS (when source === "current")
   * 4) Server active-location coords only when source is selected
   * Never auto-pick a far default/home while on live GPS.
   */
  useEffect(() => {
    if (addresses.length === 0 || selectedAddressId != null || !merchantId) return;

    let resolved: number | null = null;
    if (
      locationSource !== "current" &&
      activeLocation?.addressId != null &&
      addresses.some((a) => a.id === activeLocation.addressId)
    ) {
      resolved = activeLocation.addressId;
    }
    if (resolved == null && sessionCoords && locationSource === "selected") {
      resolved = matchSavedAddressIdNearCoords(
        addresses,
        sessionCoords.latitude,
        sessionCoords.longitude,
        0.25
      );
    }
    if (resolved == null && sessionCoords && locationSource === "current") {
      resolved = matchSavedAddressIdNearCoords(
        addresses,
        sessionCoords.latitude,
        sessionCoords.longitude,
        0.25
      );
    }
    if (
      resolved == null &&
      locationSource === "selected" &&
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

    // Never invent a far default/home — prompt Select Address instead.
    if (resolved == null) return;
    const candidateId = resolved;
    const fromBackendBinding =
      locationSource !== "current" && activeLocation?.addressId === candidateId;

    // Backend already recorded this saved address as active — bind immediately so
    // checkout never asks the user to re-select. Still re-check serviceability.
    if (fromBackendBinding) {
      setSelectedAddressId((prev) => prev ?? candidateId);
    }

    let cancelled = false;
    void getStoreDeliveryQuote({
      storeId: merchantId,
      addressId: candidateId,
      serviceType: "FOOD",
    })
      .then((quote) => {
        if (cancelled) return;
        if (quote.serviceable) {
          setSelectedAddressId((prev) => prev ?? candidateId);
          return;
        }
        if (fromBackendBinding) {
          setSelectedAddressId((prev) => (prev === candidateId ? null : prev));
          setOutOfZoneMessageVisible(true);
        }
      })
      .catch(() => {
        // Strict fail-closed for proximity/default candidates only.
        // Backend-bound id stays until quote proves unserviceable.
      });
    return () => {
      cancelled = true;
    };
  }, [
    addresses,
    selectedAddressId,
    merchantId,
    sessionCoords?.latitude,
    sessionCoords?.longitude,
    locationSource,
    activeLocation?.latitude,
    activeLocation?.longitude,
    activeLocation?.addressId,
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

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId!),
    enabled: !!merchantId,
    // Fresh menu prices within 30s; realtime invalidation handles merchant edits.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 30_000,
  });

  const storeOffersGeo = useMemo(
    () => ({
      // Prefer checkout delivery address geo while checkout is open.
      pincode: selectedAddress?.pincode ?? liveLocationAddress?.pincode ?? null,
      state: selectedAddress?.state ?? liveLocationAddress?.state ?? null,
      city: selectedAddress?.city ?? liveLocationAddress?.city ?? null,
      lat: selectedAddress?.latitude ?? sessionCoords?.latitude ?? null,
      lng: selectedAddress?.longitude ?? sessionCoords?.longitude ?? null,
    }),
    [
      selectedAddress?.pincode,
      selectedAddress?.state,
      selectedAddress?.city,
      selectedAddress?.latitude,
      selectedAddress?.longitude,
      liveLocationAddress?.pincode,
      liveLocationAddress?.state,
      liveLocationAddress?.city,
      sessionCoords?.latitude,
      sessionCoords?.longitude,
    ]
  );

  const { data: storeOffersData } = useQuery({
    queryKey: buildStoreOffersQueryKey(merchantId ?? "", storeOffersGeo),
    queryFn: () =>
      offersService.getStoreOffers({
        storeId: merchantId!,
        pincode: storeOffersGeo.pincode?.trim() || undefined,
        state: storeOffersGeo.state?.trim() || undefined,
        city: storeOffersGeo.city?.trim() || undefined,
        lat: storeOffersGeo.lat ?? undefined,
        lng: storeOffersGeo.lng ?? undefined,
        serviceType: billingServiceType,
      }),
    enabled: !!merchantId,
    staleTime: STORE_OFFERS_STALE_MS,
  });

  const itemOfferById = useMemo(() => {
    const offers = storeOffersData?.merchant_offers ?? [];
    if (offers.length === 0 || !merchant?.menu?.length) return new Map();
    const catalog = merchant.menu.map((m) => ({
      id: m.id,
      menuItemId: m.menuItemId ?? null,
      price: m.price,
      customerStrikePrice: m.basePrice != null && m.basePrice > m.price ? m.basePrice : null,
    }));
    return buildItemOfferDisplayMap(offers, catalog);
  }, [storeOffersData?.merchant_offers, merchant?.menu]);

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

  useEffect(() => {
    if (!merchant?.menu || items.length === 0) return;
    const eligibleById: Record<string, boolean> = {};
    for (const line of items) {
      const baseId = cartItemBaseId(line.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant.menu, baseId);
      const offer =
        itemOfferById.get(line.menuItemId) ?? itemOfferById.get(baseId) ?? null;
      const eligible = computeIsDiscountEligible(menuItem, offer);
      eligibleById[line.menuItemId] = eligible;
      eligibleById[baseId] = eligible;
    }
    syncDiscountEligibility(eligibleById);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant?.menu, itemOfferById, syncDiscountEligibility, items.length]);

  const checkoutCartBannerUrl = useMemo(() => {
    if (!merchant) return null;
    const m = merchant as MerchantSummary & { imageUrl?: string | null };
    const raw = m.displayImage ?? m.banner_url ?? m.imageUrl ?? null;
    return raw ? toAbsoluteImageUrl(raw) ?? raw : null;
  }, [merchant]);

  const storeFullAddress = merchantAbout?.full_address ?? merchant?.address ?? merchant?.city ?? merchantName;

  const recheckDeliveryUnavailableGate = useCallback(
    async (_forceShow: boolean): Promise<boolean> => {
      if (deliveryType === "self_pickup") {
        setDeliveryUnavailableAlert(null);
        return true;
      }
      if (merchant?.latitude == null || merchant?.longitude == null) return true;
      const svc = await checkDispatchServiceability({
        service: "food",
        fulfillment: "delivery",
        lat: Number(merchant.latitude),
        lng: Number(merchant.longitude),
        ...(merchantAbout?.postal_code ? { pincode: String(merchantAbout.postal_code) } : {}),
        ...(merchantAbout?.state ? { state: String(merchantAbout.state) } : {}),
        ...(merchantId ? { merchantStoreId: String(merchantId) } : {}),
      });
      if (!svc.ok) return true;
      if (svc.result.serviceable || svc.result.riderOnlineCheckRequired === false) {
        setDeliveryUnavailableAlert(null);
        return true;
      }
      const isNoRider = svc.result.reason === "no_rider_available";
      // Trust the backend's accurate copy (it distinguishes "all busy" from "none
      // online in your area"); only fall back if it didn't send one.
      const alert = {
        title: isNoRider ? "No delivery partner available" : "Delivery unavailable",
        message:
          svc.result.message ||
          "We couldn't find a delivery partner for your area right now. Please try again shortly.",
      };
      // Always surface the footer banner while riders are unavailable (Magicpin-style).
      setDeliveryUnavailableAlert(alert);
      return false;
    },
    [
      deliveryType,
      merchant?.latitude,
      merchant?.longitude,
      merchantAbout?.postal_code,
      merchantAbout?.state,
      merchantId,
    ]
  );

  useEffect(() => {
    recheckDeliveryUnavailableGateRef.current = recheckDeliveryUnavailableGate;
  }, [recheckDeliveryUnavailableGate]);

  // Re-check rider availability once on delivery select; poll only while the gate is blocking checkout.
  useEffect(() => {
    if (deliveryType !== "delivery") return;
    if (merchant?.latitude == null || merchant?.longitude == null) return;
    void recheckDeliveryUnavailableGate(true);
    if (deliveryUnavailableAlert == null) return;
    const id = setInterval(() => {
      void recheckDeliveryUnavailableGate(false);
    }, 15_000);
    return () => clearInterval(id);
  }, [
    deliveryType,
    deliveryUnavailableAlert,
    merchant?.latitude,
    merchant?.longitude,
    merchantId,
    recheckDeliveryUnavailableGate,
  ]);

  const refreshRiderAvailability = useCallback(async () => {
    setRiderAvailabilityRefreshing(true);
    try {
      await recheckDeliveryUnavailableGate(true);
    } finally {
      setRiderAvailabilityRefreshing(false);
    }
  }, [recheckDeliveryUnavailableGate]);

  const openCheckoutAddressSheet = useCallback(() => {
    setAddressSheetVisible(true);
  }, []);

  const deleteCheckoutAddressMutation = useMutation({
    mutationFn: (id: number) => addressService.deleteAddress(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      await queryClient.invalidateQueries({ queryKey: ["active-location"] });
      const { applyActiveLocationFromBackend } = await import(
        "@/lib/applyActiveLocationFromBackend"
      );
      await applyActiveLocationFromBackend(queryClient);
      const { promptCartIfLocationBrokeServiceability } = await import(
        "@/lib/promptCartIfLocationBrokeServiceability"
      );
      void promptCartIfLocationBrokeServiceability(queryClient);
      setSelectedAddressId((prev) => {
        const active = queryClient.getQueryData<{ addressId?: number | null }>([
          "active-location",
        ]);
        if (prev != null && active?.addressId != null && prev !== active.addressId) {
          return active.addressId;
        }
        if (prev != null && active?.addressId == null) return null;
        return prev;
      });
    },
  });

  const selectAddressFromCheckoutSheet = useCallback(
    async (addr: Address) => {
      if (addressSheetBusyId != null) return;
      if (!merchantId) return;
      setAddressSheetBusyId(addr.id);
      try {
        // Revalidate immediately before mutation so a stale row quote can
        // never promote an out-of-zone address to active/default.
        const quote = await getStoreDeliveryQuote({
          storeId: merchantId,
          addressId: addr.id,
          serviceType: "FOOD",
          skipCache: true,
        });
        if (!quote.serviceable) {
          setOutOfZoneMessageVisible(true);
          return;
        }
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
            addressId: addr.id,
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
        await queryClient.invalidateQueries({ queryKey: ["store-delivery-quote"] });
        await queryClient.invalidateQueries({ queryKey: ["billing-calculate"] });
        await queryClient.invalidateQueries({ queryKey: ["billing-checkout-offers"] });
        void invalidateFoodHomeLocationQueries(queryClient);
        setAddressSheetVisible(false);
      } catch {
        Alert.alert("Could not update address", "Please try again.");
      } finally {
        setAddressSheetBusyId(null);
      }
    },
    [addressSheetBusyId, merchantId, queryClient, setAddressAndCoords]
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

  const openReceiverSheet = useCallback(() => {
    if (!selectedAddress) return;
    setReceiverDraftName(
      checkoutReceiverName.trim() || profileContactName || ""
    );
    setReceiverDraftMobile(
      checkoutReceiverMobile.trim() || profileContactMobile || ""
    );
    setReceiverSheetVisible(true);
  }, [
    selectedAddress,
    checkoutReceiverName,
    checkoutReceiverMobile,
    profileContactName,
    profileContactMobile,
  ]);

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
    if (!contactName || !contactMobile) {
      Alert.alert("Receiver details", "Please enter both name and mobile number.");
      return;
    }
    // This-order override only — next checkout still seeds from logged-in profile.
    receiverManuallyEditedRef.current = true;
    setCheckoutReceiverName(contactName);
    setCheckoutReceiverMobile(contactMobile);
    setReceiverSheetVisible(false);
  }, [selectedAddress, receiverDraftName, receiverDraftMobile]);

  const currentVsSelectedDistanceKm = useMemo(() => {
    if (!selectedAddress || !currentLocationCoords) return null;
    return haversineKm(
      selectedAddress.latitude,
      selectedAddress.longitude,
      currentLocationCoords.latitude,
      currentLocationCoords.longitude
    );
  }, [selectedAddress, currentLocationCoords]);

  /** Full item+addon cart — listing API scales eligible share from this. */
  const clientFullCartSubtotal = useMemo(() => computeFullCartSubtotal(items), [items]);

  /**
   * Optimistic checkout-offer base — only lines without item Boost/BOGO.
   * Never fall back to full cart when every line already has an item promo
   * (that incorrectly unlocked coupons / missed-offer sheets).
   */
  const clientEligibleCheckoutSubtotal = useMemo(
    () => computeEligibleCheckoutSubtotal(items, itemOfferById),
    [items, itemOfferById]
  );

  /**
   * Debounced cart snapshot — only this (not live `items`) feeds the network-bound
   * billing/offers queries below, so rapid +/- taps coalesce into one request instead
   * of one per tap. Everything the user actually SEES (quantity, per-line price, the
   * optimistic grand total further down) still reacts to live `items` instantly.
   */
  const debouncedItems = useDebouncedValue(items, CART_QTY_BILLING_DEBOUNCE_MS);
  const debouncedClientFullCartSubtotal = useMemo(
    () => roundBillAmount(computeFullCartSubtotal(debouncedItems)),
    [debouncedItems]
  );
  const debouncedClientEligibleCheckoutSubtotal = useMemo(
    () => roundBillAmount(computeEligibleCheckoutSubtotal(debouncedItems, itemOfferById)),
    [debouncedItems, itemOfferById]
  );

  const tipValue = useMemo(
    () => Math.max(0, Math.min(TIP_CUSTOM_MAX, tipSliderValue)),
    [tipSliderValue]
  );

  /** Reset tip when opening checkout for a store — never carry over from scroll glitches. */
  useEffect(() => {
    setTipSliderValue(0);
    setTipCustomMode(false);
    setTipCustomInput("");
  }, [merchantId]);

  const donationValue = donationEnabled
    ? donationPreset !== "custom" && donationPreset != null
      ? Number(donationPreset)
      : (() => {
          const n = parseFloat(String(donationAmount).replace(/[^\d.]/g, ""));
          return Number.isFinite(n) ? Math.max(0, n) : 0;
        })()
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
    const n = parseFloat(String(tipCustomInput).replace(/[^\d.]/g, ""));
    setTipSliderValue(Number.isFinite(n) ? Math.min(TIP_CUSTOM_MAX, Math.max(0, Math.round(n))) : 0);
  }, [tipCustomInput]);

  const handleBillTipCustomInputChange = useCallback((v: string) => {
    const cleaned = v.replace(/[^\d.]/g, "");
    setTipCustomInput(cleaned);
    const n = parseFloat(cleaned);
    setTipSliderValue(Number.isFinite(n) ? Math.min(TIP_CUSTOM_MAX, Math.max(0, Math.round(n))) : 0);
  }, []);

  const handleDonationAmountChange = useCallback((v: string) => {
    setDonationAmount(v.replace(/[^\d.]/g, ""));
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
      onDonationAmountChange: handleDonationAmountChange,
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
      handleDonationAmountChange,
      donationScope,
    ]
  );

  const billSummarySheetMaxHeight = useMemo(
    () => Math.min(640, Math.round(windowHeight * BILL_SUMMARY_SHEET_HEIGHT_RATIO)),
    [windowHeight]
  );

  /**
   * Order-payload snapshot — ALWAYS built from the live cart, never the debounced one.
   * This is what actually gets submitted to the server on "Place Order"; it must never
   * lag behind a quantity tap the user just made.
   */
  const itemsWithSnapshots = useMemo(
    () => buildItemsWithSnapshots(items, merchant?.menu),
    [items, merchant?.menu]
  );

  /**
   * Same snapshot shape, but built from the debounced cart — used ONLY to feed the
   * billing-preview network call's key/body, so rapid +/- taps coalesce into one
   * request instead of firing on every tap. Never used for order submission.
   */
  const debouncedItemsWithSnapshots = useMemo(
    () => buildItemsWithSnapshots(debouncedItems, merchant?.menu),
    [debouncedItems, merchant?.menu]
  );

  const billingCartKey = useMemo(
    () =>
      JSON.stringify(
        debouncedItemsWithSnapshots.map((i) => ({
          id: i.menuItemId,
          q: i.quantity,
          p: i.basePrice,
          v: i.variantId ?? null,
          n: i.specialInstructions ?? null,
          e: i.isDiscountEligible !== false,
          a: (i.addons ?? []).map((ad) => [ad.addonId, ad.quantity, ad.addonPrice]),
        }))
      ),
    [debouncedItemsWithSnapshots]
  );

  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [billingCartKey]);

  const provisionalDropLat = useMemo(() => {
    const lat = sessionCoords?.latitude ?? currentLocationCoords?.latitude;
    if (lat == null || !Number.isFinite(lat)) return null;
    return Math.round(lat * 1e5) / 1e5;
  }, [sessionCoords?.latitude, currentLocationCoords?.latitude]);

  const provisionalDropLon = useMemo(() => {
    const lon = sessionCoords?.longitude ?? currentLocationCoords?.longitude;
    if (lon == null || !Number.isFinite(lon)) return null;
    return Math.round(lon * 1e5) / 1e5;
  }, [sessionCoords?.longitude, currentLocationCoords?.longitude]);

  const pickupLat =
    merchant?.latitude != null && Number.isFinite(Number(merchant.latitude))
      ? Number(merchant.latitude)
      : null;
  const pickupLon =
    merchant?.longitude != null && Number.isFinite(Number(merchant.longitude))
      ? Number(merchant.longitude)
      : null;
  const hasPickupCoords = pickupLat != null && pickupLon != null;

  const billingCalculateKeyParams: BillingCalculateKeyParams = {
    merchantId,
    addressId: selectedAddress?.id != null ? String(selectedAddress.id) : null,
    dropLat: selectedAddress == null ? provisionalDropLat : null,
    dropLon: selectedAddress == null ? provisionalDropLon : null,
    billingCartKey,
    tipAmount: debouncedTipForBilling,
    donationAmount: debouncedDonationForBilling,
    // Platform offers apply by id — omit their display code from the billing coupon slot.
    couponCode: selectedPlatformOfferId != null ? null : appliedCouponCode,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    forceNoAutoOffer,
    subscriptionOptIn,
    subscriptionBillingCycle,
    subscriptionPlanId: checkoutPlan?.id,
    deliveryType,
    pickupLat,
    pickupLon,
    serviceType: billingServiceType,
  };

  const canRequestBilling =
    !!merchantId &&
    items.length > 0 &&
    hasPickupCoords &&
    !paymentInProgress &&
    (deliveryType === "self_pickup" ||
      selectedAddress != null ||
      (provisionalDropLat != null && provisionalDropLon != null));

  const billingQuery = useQuery({
    queryKey: buildBillingCalculateQueryKey(billingCalculateKeyParams),
    queryFn: ({ signal }) =>
      billingService.calculateBill(
        buildBillingCalculateParams({
          ...billingCalculateKeyParams,
          items: debouncedItemsWithSnapshots,
          showSubscriptionPromo,
          cityName: selectedAddress?.city ?? liveLocationAddress?.city ?? undefined,
          pickupLat: pickupLat ?? undefined,
          pickupLon: pickupLon ?? undefined,
        }),
        { signal }
      ),
    enabled: canRequestBilling,
    /** Keeps last bill on screen while cart/tip/donation refetch — avoids skeleton layout jump. */
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => isNetworkError(error) && failureCount < 1,
  });

  // [PERF][CHECKOUT] billing calculate timing — logs each fetch cycle's duration so a
  // "billing section hang" shows up as a long (or never-ending) billing:end (dev only).
  const perfBillingStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (billingQuery.isFetching) {
      if (perfBillingStartRef.current == null) {
        perfBillingStartRef.current = perfNow();
        checkoutPerfLog("billing:start");
      }
    } else if (perfBillingStartRef.current != null) {
      checkoutPerfLog("billing:end", perfNow() - perfBillingStartRef.current);
      perfBillingStartRef.current = null;
    }
  }, [billingQuery.isFetching]);

  // Live location from the location store — geocoded by Mapbox in the app, fresh every session.
  // Pass to backend so geo-bound platform offers resolve even when the saved address has
  // placeholder values (e.g. "—" stored when reverse-geocoding failed at save time).
  const livePincode = liveLocationAddress?.pincode ?? undefined;
  const liveState = liveLocationAddress?.state ?? undefined;
  const liveCity = liveLocationAddress?.city ?? undefined;

  /**
   * Keep the last bill on screen while address / cart refetches.
   * Place Order still waits on `billMatchesSelectedAddress` so we never charge
   * a stale provisional total.
   */
  const serverBill = billingQuery.data ?? null;

  /**
   * Live tip/donation vs last settled bill — keeps Total / GatiCash / CTA in sync while
   * billing-calculate is still debouncing (custom amounts must not only appear on the wallet row).
   */
  const gratitudePendingDelta = useMemo(() => {
    if (serverBill == null) return 0;
    const serverTip = serverBill.tipAmount ?? 0;
    const serverDonation = serverBill.donationAmount ?? 0;
    return roundBillAmount(tipValue - serverTip + (donationValue - serverDonation));
  }, [serverBill, tipValue, donationValue]);

  /** Settled bill finalAmount + any tip/donation still awaiting billing refetch. */
  const billFinalWithLiveGratitude = useMemo(() => {
    if (serverBill == null) return null;
    return roundBillAmount(serverBill.finalAmount + gratitudePendingDelta);
  }, [serverBill, gratitudePendingDelta]);

  useEffect(() => {
    if (
      !selectedAddress ||
      billingQuery.isPlaceholderData ||
      serverBill?.serviceable !== false ||
      serverBill.unserviceableReason === "store_inactive"
    ) {
      return;
    }
    // Serviceability may change while checkout is open. Remove the stale
    // selection immediately and force the user back to a deliverable address.
    setSelectedAddressId(null);
    setAddressSheetVisible(true);
    setOutOfZoneMessageVisible(true);
    idempotencyKeyRef.current = null;
  }, [
    selectedAddress?.id,
    billingQuery.isPlaceholderData,
    serverBill?.serviceable,
    serverBill?.unserviceableReason,
  ]);

  /**
   * Offer Engine v2 — prefer server eligibleSubtotal (never invent from client flags).
   * While loading, use only Boost/BOGO-free lines — never full cart.
   */
  const cartSubtotalForOffers = useMemo(() => {
    const fromBill = serverBill?.eligibleSubtotal;
    if (fromBill != null && Number.isFinite(fromBill) && fromBill >= 0) return fromBill;
    return clientEligibleCheckoutSubtotal;
  }, [serverBill?.eligibleSubtotal, clientEligibleCheckoutSubtotal]);

  const serverLineEligibilityById = useMemo(() => {
    const map = new Map<
      string,
      {
        isDiscountEligible: boolean;
        ineligibilityReason: "ITEM_PROMO" | "MRP" | null;
      }
    >();
    for (const row of serverBill?.orderLineEligibility ?? []) {
      map.set(String(row.menuItemId), {
        isDiscountEligible: row.isDiscountEligible,
        ineligibilityReason: row.ineligibilityReason ?? null,
      });
    }
    return map;
  }, [serverBill?.orderLineEligibility]);
  /** Store→drop km from the billing engine (same canonical getRoute as listing). */
  const serverDistanceKm = serverBill?.distanceKm ?? null;
  const uiDistanceKm = serverDistanceKm;
  /** Serviceability comes from the server (respects store.delivery_radius_km + env fallback),
   * falling back to the platform default if the server hasn't been updated yet.
   * Only treat as out-of-zone once a delivery address is selected and the bill matches it.
   */
  /** Delivery address on the current billing request matches the user's selection. */
  const billAddressMatchesSelection =
    hasDeliveryAddress &&
    selectedAddress != null &&
    billingCalculateKeyParams.addressId === String(selectedAddress.id);
  /**
   * Authoritative for Place Order — never charge while keepPreviousData is showing a
   * prior key's bill (e.g. right after an address change).
   */
  const billMatchesSelectedAddress =
    billAddressMatchesSelection && !billingQuery.isPlaceholderData;
  const isDeliveryOutOfRange =
    billMatchesSelectedAddress &&
    (serverBill?.serviceable === false ||
      serverBill?.unserviceableReason === "out_of_range" ||
      (uiDistanceKm != null &&
        serverBill?.serviceable == null &&
        uiDistanceKm > (serverBill?.serviceRadiusKm ?? SERVICE_RADIUS_KM)));
  const visibleDiscounts = useMemo(
    () => (serverBill?.discounts ?? []).filter((c) => !c.hidden),
    [serverBill?.discounts]
  );

  /** Offer IDs that are menu Boost/BOGO — folded into Item total strike, not listed again. */
  const itemSurfaceMerchantOfferIds = useMemo(() => {
    const ids = new Set<number>();
    for (const o of storeOffersData?.merchant_offers ?? []) {
      const type = String(o.offer_type ?? "").toUpperCase();
      if (type === "BOGO" || type === "BUY_X_GET_Y" || type === "BUY_N_GET_M") {
        ids.add(o.id);
        continue;
      }
      if (o.conditions_mode === "precision") continue;
      if (
        type === "CART_PERCENTAGE" ||
        type === "CART_FLAT" ||
        type === "FREE_DELIVERY" ||
        type === "COUPON" ||
        type === "TIERED" ||
        type === "BUNDLE"
      ) {
        continue;
      }
      if (type === "PERCENTAGE" || type === "FLAT") {
        if (o.conditions_mode === "boost" || o.conditions_mode == null) ids.add(o.id);
      }
    }
    return ids;
  }, [storeOffersData?.merchant_offers]);

  const merchantItemDiscountTotal = useMemo(() => {
    let sum = 0;
    for (const d of visibleDiscounts) {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && itemSurfaceMerchantOfferIds.has(id)) {
        sum += d.amount ?? 0;
      }
    }
    return sum;
  }, [visibleDiscounts, itemSurfaceMerchantOfferIds]);

  /**
   * Item total after Boost — whole rupees, same as menu "Get for" / line prices.
   * The billing API's own item total (net of item-surface discounts) is authoritative
   * once available; the catalog/offer-config estimate below only covers the brief
   * window before the first billing response resolves, so the item list doesn't
   * flash from struck to unstruck prices while billingQuery is still in flight.
   */
  const itemTotalNetOverride = useMemo(() => {
    if (serverBill && merchantItemDiscountTotal > 0.05) {
      return Math.max(0, Math.round(serverBill.itemTotal - merchantItemDiscountTotal));
    }

    let hasOfferLine = false;
    let net = 0;
    for (const item of items) {
      const baseId = cartItemBaseId(item.menuItemId);
      const itemOffer =
        itemOfferById.get(item.menuItemId) ?? itemOfferById.get(baseId) ?? null;
      const catalogBase =
        item.basePrice != null && item.basePrice > 0
          ? item.basePrice
          : cartLineBaseUnitPrice(item);
      const addonPerUnit = cartAddonTotalPerUnit(item);
      const boostBase = estimateBoostUnitPrice(catalogBase, itemOffer);
      if (boostBase != null && boostBase < catalogBase - 0.001) {
        hasOfferLine = true;
        net += Math.round(boostBase + addonPerUnit) * item.quantity;
      } else {
        net += Math.round(catalogBase + addonPerUnit) * item.quantity;
      }
    }
    return hasOfferLine ? Math.max(0, Math.round(net)) : null;
  }, [items, itemOfferById, serverBill, merchantItemDiscountTotal]);

  /**
   * Per Boost/item-deal offerId → rupees saved, read straight from the billing API
   * response (same source + filter as merchantItemDiscountTotal above) — never
   * re-derived from catalog price + offer config, which can silently drift from
   * what the billing engine actually computed (caps, rounding, targeting).
   */
  const itemDealSavingsByOfferId = useMemo(() => {
    const map: Record<number, number> = {};
    for (const d of visibleDiscounts) {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && itemSurfaceMerchantOfferIds.has(id)) {
        map[id] = (map[id] ?? 0) + (d.amount ?? 0);
      }
    }
    return map;
  }, [visibleDiscounts, itemSurfaceMerchantOfferIds]);

  const billVisibleDiscounts = useMemo(() => {
    if (itemSurfaceMerchantOfferIds.size === 0) return visibleDiscounts;
    return visibleDiscounts.filter((d) => {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && itemSurfaceMerchantOfferIds.has(id)) return false;
      return true;
    });
  }, [visibleDiscounts, itemSurfaceMerchantOfferIds]);

  const { subscriptionBenefits: subscriptionBenefitDiscounts, checkoutPromos: checkoutPromoDiscounts } =
    useMemo(() => splitCheckoutDiscounts(visibleDiscounts), [visibleDiscounts]);

  /**
   * checkoutPromoDiscounts includes item-surface Boost/BOGO (always-on, independent of
   * the "exactly one cart-level promo" rule) — every consumer that needs "the currently
   * active cart-level promo" (Precision / Platform / coupon) must use THIS list instead,
   * or an always-on Boost discount (usually larger) wins the "primary"/id lookups and
   * masks whichever cart-level offer is actually selected. Single source of truth for
   * that filter — do not re-implement it inline elsewhere.
   */
  const cartLevelCheckoutPromoDiscounts = useMemo(
    () =>
      checkoutPromoDiscounts.filter((d) => {
        const mid = d.meta?.merchantOfferId;
        return !(typeof mid === "number" && itemSurfaceMerchantOfferIds.has(mid));
      }),
    [checkoutPromoDiscounts, itemSurfaceMerchantOfferIds]
  );

  const subscriptionBenefitSavings = useMemo(
    () => subscriptionBenefitDiscounts.reduce((sum, d) => sum + (d.amount ?? 0), 0),
    [subscriptionBenefitDiscounts]
  );

  /**
   * Bill already includes membership free delivery without checkout opt-in → treat as
   * active member for UI (hides Join/APPLY upsell when /subscription/current was stale).
   */
  const membershipFreeDeliveryOnBill = subscriptionBenefitSavings > 0.005;

  /** Single GMitra Plus delivery savings figure — upsell, ADDED state, and green applied row. */
  const membershipDeliverySavingsDisplay = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery" || !checkoutPlan?.freeDeliveryEnabled) {
      return null;
    }
    const benefit =
      serverBill.subscriptionDeliveryBenefit ?? serverBill.subscriptionDeliveryBenefitEstimate ?? null;
    const quoted = serverBill.deliveryFeeQuotedInr ?? 0;
    const current =
      serverBill.deliveryFee ?? serverBill.components?.delivery?.taxable_value ?? 0;
    const strike = quoted > current + 0.005 ? quoted : null;
    return resolveMembershipDeliverySavingsDisplay({
      deliveryType,
      freeDeliveryEnabled: checkoutPlan.freeDeliveryEnabled,
      maxFreeDeliveryRadiusKm: checkoutPlan.maxFreeDeliveryRadiusKm ?? 7,
      distanceKm: uiDistanceKm,
      deliveryFeeQuotedInr: serverBill.deliveryFeeQuotedInr ?? null,
      deliveryFeeStrikeAmount: strike,
      currentDeliveryFee: current,
      serverBenefit: benefit,
      appliedBillSavings: subscriptionBenefitSavings,
      membershipOnBill: membershipFreeDeliveryOnBill,
    });
  }, [
    serverBill,
    deliveryType,
    checkoutPlan,
    uiDistanceKm,
    subscriptionBenefitSavings,
    membershipFreeDeliveryOnBill,
  ]);

  /** Platform FREE_DELIVERY (or any delivery-fee discount line) already on this bill. */
  const platformFreeDeliveryOnBill = useMemo(() => {
    for (const d of cartLevelCheckoutPromoDiscounts) {
      const kind = String(d.meta?.offerKind ?? "").toUpperCase();
      if (kind === "FREE_DELIVERY" && (d.amount ?? 0) > 0.005) return true;
      if (
        typeof d.meta?.platformOfferId === "number" &&
        (d.amount ?? 0) > 0.005 &&
        /free\s*delivery|delivery\s*discount/i.test(String(d.label ?? ""))
      ) {
        return true;
      }
    }
    if (!serverBill || deliveryType !== "delivery") return false;
    const quoted = serverBill.deliveryFeeQuotedInr ?? 0;
    if (serverBill.deliveryFee <= 0.005 && quoted > 0.005) {
      // Delivery fully waived with a quoted fee — hide subscription unlock upsell.
      return cartLevelCheckoutPromoDiscounts.some(
        (d) => typeof d.meta?.platformOfferId === "number" && (d.amount ?? 0) > 0.005
      );
    }
    return false;
  }, [cartLevelCheckoutPromoDiscounts, serverBill, deliveryType]);

  const showMembershipUpsell =
    showSubscriptionPromo &&
    !(membershipFreeDeliveryOnBill && !subscriptionOptIn) &&
    !platformFreeDeliveryOnBill;

  /** Debounced — this query is read-only (fetches available offers, doesn't submit
   * anything), so it's safe to fully key off the debounced cart like billingQuery. */
  const checkoutCartMenuItemIds = useMemo(() => {
    const ids: string[] = [];
    for (const line of debouncedItems) {
      const raw = String(line.menuItemId ?? "").trim();
      if (!raw) continue;
      const base = cartItemBaseId(raw) || raw;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      // Repeat id by qty so checkout-offers catalog share matches cart (API uses qty=1 per id token).
      for (let i = 0; i < qty; i++) ids.push(base);
    }
    return ids;
  }, [debouncedItems]);

  const checkoutCartQtyFingerprint = useMemo(
    () =>
      debouncedItems
        .map((i) => `${cartItemBaseId(i.menuItemId)}:${i.quantity}`)
        .sort()
        .join("|"),
    [debouncedItems]
  );

  const checkoutOffersQuery = useQuery({
    queryKey: [
      "billing-checkout-offers",
      merchantId,
      selectedAddress?.id,
      debouncedClientFullCartSubtotal,
      debouncedClientEligibleCheckoutSubtotal,
      checkoutCartQtyFingerprint,
      livePincode,
      liveState,
      subscriptionBenefitSavings,
      // selectedPlatformOfferId/selectedMerchantOfferId intentionally excluded — the
      // request (billingService.getCheckoutOffers below) never sends them, so keying on
      // them only forced pointless refetches every time the offer selection changed.
      checkoutCartMenuItemIds.join(","),
    ],
    queryFn: async () => {
      // Send full item+addon cart — backend scales min-order to the eligible share.
      const cartSubtotal = debouncedClientFullCartSubtotal;
      const data = await billingService.getCheckoutOffers({
        merchantId: merchantId!,
        addressId: String(selectedAddress!.id),
        cartSubtotal,
        serviceType: billingServiceType,
        pincode: livePincode,
        state: liveState,
        city: liveCity,
        menuItemIds: checkoutCartMenuItemIds,
      });
      // Live unlock math must use eligible checkout base (not full cart).
      return { ...data, fetchedCartSubtotal: debouncedClientEligibleCheckoutSubtotal };
    },
    enabled: !!merchantId && !!selectedAddress && items.length > 0,
    staleTime: couponSheetVisible ? 0 : 10_000,
    placeholderData: keepPreviousData,
  });

  /**
   * Live eligible checkout base (excludes item-deal lines). Prefer client over listing
   * `eligibleSubtotal` so GatiCash / unlock UI don't use a stale or qty-skewed server share.
   */
  const cartSubtotalForOffersResolved = useMemo(() => {
    if (clientEligibleCheckoutSubtotal > 0.005) return clientEligibleCheckoutSubtotal;
    const fromOffers = checkoutOffersQuery.data?.eligibleSubtotal;
    if (fromOffers != null && Number.isFinite(fromOffers) && fromOffers >= 0) return fromOffers;
    return cartSubtotalForOffers;
  }, [
    clientEligibleCheckoutSubtotal,
    checkoutOffersQuery.data?.eligibleSubtotal,
    cartSubtotalForOffers,
  ]);

  /** At least one cart rupee can receive checkout coupons / platform cart offers. */
  const hasEligibleCheckoutOfferBase = cartSubtotalForOffersResolved > 0.005;

  const primaryCheckoutDiscount = useMemo(() => {
    if (cartLevelCheckoutPromoDiscounts.length === 0) return null;
    return [...cartLevelCheckoutPromoDiscounts].sort((a, b) => b.amount - a.amount)[0];
  }, [cartLevelCheckoutPromoDiscounts]);

  /** Coupon code from server auto-apply (no client pin) — for Applied badges / featured hide. */
  const serverAutoAppliedCouponCode = useMemo(() => {
    if (checkoutOfferUserPinned || forceNoAutoOffer) return null;
    for (const d of cartLevelCheckoutPromoDiscounts) {
      const code = d.meta?.code;
      if (typeof code === "string" && code.trim()) return code.trim();
      const couponId = d.meta?.couponId;
      if (typeof couponId === "number" && couponId > 0) {
        const fromLabel = String(d.label ?? "").replace(/^Coupon\s+/i, "").trim();
        if (fromLabel) return fromLabel;
      }
    }
    return null;
  }, [cartLevelCheckoutPromoDiscounts, checkoutOfferUserPinned, forceNoAutoOffer]);

  const effectiveAppliedCouponCode = appliedCouponCode ?? serverAutoAppliedCouponCode;

  const couponDiscountAmount = useMemo(() => {
    if (!effectiveAppliedCouponCode || !primaryCheckoutDiscount) return 0;
    const metaCode =
      typeof primaryCheckoutDiscount.meta?.code === "string"
        ? primaryCheckoutDiscount.meta.code.trim()
        : "";
    if (
      metaCode &&
      metaCode.toUpperCase() === effectiveAppliedCouponCode.toUpperCase()
    ) {
      return primaryCheckoutDiscount.amount;
    }
    if (
      !discountMatchesCoupon(
        primaryCheckoutDiscount.label,
        effectiveAppliedCouponCode,
        appliedCouponLabel
      )
    ) {
      return 0;
    }
    return primaryCheckoutDiscount.amount;
  }, [primaryCheckoutDiscount, effectiveAppliedCouponCode, appliedCouponLabel]);

  const itemDealSavingsTotal = useMemo(
    () => Object.values(itemDealSavingsByOfferId).reduce((sum, n) => sum + n, 0),
    [itemDealSavingsByOfferId]
  );

  /** List→selling gap when billing does not return a separate item-deal discount line. */
  const clientItemDealSavings = useMemo(() => {
    let sum = 0;
    for (const cartItem of items) {
      const baseId = cartItemBaseId(cartItem.menuItemId);
      const menuItem = merchant?.menu
        ? findMenuItemByCartBaseId(merchant.menu, baseId)
        : null;
      const catalogMrp =
        menuItem?.basePrice != null && menuItem.basePrice > menuItem.price
          ? menuItem.basePrice
          : null;
      const { strike, net } = cartLineStrikeNetTotals(
        { ...cartItem, catalogMrp },
        itemOfferById
      );
      if (strike != null && strike > net + 0.005) sum += strike - net;
    }
    return roundBillAmount(sum);
  }, [items, itemOfferById, merchant?.menu]);

  const appliedItemDealSavings = useMemo(
    () =>
      Math.max(merchantItemDiscountTotal, itemDealSavingsTotal, clientItemDealSavings),
    [merchantItemDiscountTotal, itemDealSavingsTotal, clientItemDealSavings]
  );

  /** Match on-screen bill discount rows + item Boost/Get-for savings (folded out of bill list).
   * Only applied discounts — never advertised membership upsell. Subscription free-delivery
   * rows are already inside billVisibleDiscounts (counted once). */
  const checkoutSavingsTotal = useMemo(
    () =>
      computeAppliedCheckoutSavings({
        billVisibleDiscounts,
        itemDealSavings: appliedItemDealSavings,
      }),
    [billVisibleDiscounts, appliedItemDealSavings]
  );

  const missedOffersFingerprint = useMemo(() => {
    if (!hasEligibleCheckoutOfferBase) return "";
    return listMissedOfferWalletCandidates(
      checkoutOffersQuery.data,
      cartSubtotalForOffersResolved
    )
      .map((c) => `${c.source}:${c.id}`)
      .join("|");
  }, [
    hasEligibleCheckoutOfferBase,
    checkoutOffersQuery.data,
    cartSubtotalForOffersResolved,
  ]);

  const missedOfferWalletComp = useMemo(() => {
    if (!hasEligibleCheckoutOfferBase) return null;
    return resolveMissedOfferWalletCompensation(
      checkoutOffersQuery.data,
      merchantId,
      cartSubtotalForOffersResolved,
      deliveryType,
      selectedMissedOfferKey
    );
  }, [
    hasEligibleCheckoutOfferBase,
    checkoutOffersQuery.data,
    merchantId,
    cartSubtotalForOffersResolved,
    deliveryType,
    selectedMissedOfferKey,
  ]);

  /**
   * Best eligible store cart / precision offer — auto-apply + hide GatiCash unlock card.
   * Any non-item SPECIAL OFFERS row (not coupon-gated) qualifies — not only conditionsMode=precision.
   */
  const eligibleStorePrecisionOffer = useMemo(() => {
    const offers = checkoutOffersQuery.data;
    if (!offers || !hasEligibleCheckoutOfferBase) return null;

    const isCartSheetOffer = (o: {
      displaySurface?: string | null;
      autoApply?: boolean;
      requiresCouponCode?: string | null;
    }) =>
      o.displaySurface !== "item" &&
      o.autoApply !== false &&
      !o.requiresCouponCode;

    const score = (o: { estimatedSavingsInr?: number | null }) => o.estimatedSavingsInr ?? 0;

    const fromEligible = (offers.merchantOffers ?? []).filter(isCartSheetOffer);
    if (fromEligible.length > 0) {
      // Prefer precision-tagged rows when several cart offers exist.
      const precisionFirst = [...fromEligible].sort((a, b) => {
        const ap = isMerchantPrecisionOfferBlockedFromGatiCash(a) ? 1 : 0;
        const bp = isMerchantPrecisionOfferBlockedFromGatiCash(b) ? 1 : 0;
        if (bp !== ap) return bp - ap;
        return score(b) - score(a);
      });
      return precisionFirst[0] ?? null;
    }

    const fetched = offers.fetchedCartSubtotal ?? cartSubtotalForOffersResolved;
    const liveReady = (offers.merchantOffersIneligible ?? [])
      .filter(isCartSheetOffer)
      .map((o) => {
        const gap = liveUnlockGapInr({
          reason: o.reason,
          lockReason: o.lockReason,
          minOrderAmount: o.minOrderAmount,
          cartSubtotal: cartSubtotalForOffersResolved,
          fetchedCartSubtotal: fetched,
        });
        return { o, gap };
      })
      .filter((x) => x.gap <= 0)
      .map((x) => x.o);
    if (liveReady.length === 0) return null;
    return [...liveReady].sort((a, b) => score(b) - score(a))[0] ?? null;
  }, [
    checkoutOffersQuery.data,
    hasEligibleCheckoutOfferBase,
    cartSubtotalForOffersResolved,
  ]);

  const hideGatiCashUnlockCard = Boolean(eligibleStorePrecisionOffer) && !missedOfferWalletPending;

  // Auto-apply of the best eligible merchant Precision / auto_apply coupon / platform
  // offer (promo_config.auto_apply) happens server-side (checkoutExclusiveOffer.ts)
  // whenever selectedMerchantOfferId / selectedPlatformOfferId / couponCode are unset.
  // The client never soft-selects those back into billingQuery params for the auto case.

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
    // Store precision eligible/applied → hide unlock card (change via offers sheet).
    if (hideGatiCashUnlockCard) return null;
    return missedOfferWalletComp;
  }, [missedOfferWalletPending, missedOfferWalletComp, hideGatiCashUnlockCard]);

  const missedOfferWalletPendingAmount = useMemo(() => {
    if (!missedOfferWalletPending || !displayMissedOfferWalletComp) return 0;
    return displayMissedOfferWalletComp.amountInr;
  }, [missedOfferWalletPending, displayMissedOfferWalletComp]);

  const openMissedOfferUnlockSheet = useCallback(() => {
    if (!hasEligibleCheckoutOfferBase) return;
    if (missedOfferWalletComp?.key) {
      setSelectedMissedOfferKey(missedOfferWalletComp.key);
    }
    setMissedOfferSheetVisible(true);
  }, [hasEligibleCheckoutOfferBase, missedOfferWalletComp?.key]);

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
      if (!merchantId || !hasEligibleCheckoutOfferBase) return;
      // Store precision offers cannot be unlocked with GatiCash.
      if (source === "merchant") {
        const row =
          checkoutOffersQuery.data?.merchantOffersIneligible?.find((o) => o.id === offerId) ??
          checkoutOffersQuery.data?.merchantOffers?.find((o) => o.id === offerId);
        if (row && isMerchantPrecisionOfferBlockedFromGatiCash(row)) return;
      }
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
          cartSubtotalForOffersResolved,
          deliveryType,
          key
        );
        if (!nextComp) return;

        // One checkout promo at a time — drop coupon / platform / merchant (membership stays).
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
        setSelectedPlatformOfferId(null);
        setSelectedMerchantOfferId(null);
        setForceNoAutoOffer(true);
        setCheckoutOfferUserPinned(false);
        setCouponCelebrationVisible(false);

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
      hasEligibleCheckoutOfferBase,
      missedOfferWalletPending,
      authSession,
      checkoutOffersQuery.data,
      cartSubtotalForOffersResolved,
      deliveryType,
    ]
  );

  const handleSelectMissedOfferWallet = useCallback(() => {
    if (!hasEligibleCheckoutOfferBase) return;
    if (!missedOfferWalletComp || missedOfferWalletPending) return;
    if (!authSession) {
      Alert.alert("Sign in required", "Please sign in to add GatiCash for this offer.");
      return;
    }
    // One checkout promo at a time — drop coupon / platform / merchant (membership stays).
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setSelectedPlatformOfferId(null);
    setSelectedMerchantOfferId(null);
    setForceNoAutoOffer(true);
    setCheckoutOfferUserPinned(false);
    setCouponCelebrationVisible(false);

    pendingMissedOfferWalletRef.current = missedOfferWalletComp;
    setMissedOfferWalletPending(true);
    setSelectedMissedOfferKey(missedOfferWalletComp.key);
    setMissedOfferCelebration(missedOfferWalletComp);
    setMissedOfferSheetVisible(false);
  }, [hasEligibleCheckoutOfferBase, missedOfferWalletComp, missedOfferWalletPending, authSession]);

  const handleRemoveMissedOfferWallet = useCallback(() => {
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferSheetVisible(false);
    setMissedOfferCelebration(null);
    setForceNoAutoOffer(false);
    setCheckoutOfferUserPinned(false);
  }, []);

  const fulfillPendingMissedOfferWallet = useCallback(async () => {
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    const { refreshCustomerWallet } = await import("@/lib/refreshCustomerWallet");
    void refreshCustomerWallet(queryClient);
  }, [queryClient]);

  const featuredCoupon = useMemo(() => {
    const list =
      checkoutOffersQuery.data?.coupons?.filter(
        (c) => c.code.toUpperCase() !== (effectiveAppliedCouponCode ?? "").toUpperCase()
      ) ?? [];
    return list[0] ?? null;
  }, [checkoutOffersQuery.data?.coupons, effectiveAppliedCouponCode]);

  const appliedPlatformOfferId = useMemo(() => {
    for (const d of cartLevelCheckoutPromoDiscounts) {
      const id = d.meta?.platformOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    // Optimistic only while a pinned selection awaits a bill that includes the discount.
    // Never treat selection alone as "applied" — that caused "Free Delivery applied" with ₹0 cut.
    if (
      checkoutOfferUserPinned &&
      selectedPlatformOfferId != null &&
      (billingQuery.isFetching || !serverBill)
    ) {
      return selectedPlatformOfferId;
    }
    return null;
  }, [
    cartLevelCheckoutPromoDiscounts,
    selectedPlatformOfferId,
    checkoutOfferUserPinned,
    billingQuery.isFetching,
    serverBill,
  ]);

  const appliedMerchantOfferId = useMemo(() => {
    for (const d of cartLevelCheckoutPromoDiscounts) {
      const id = d.meta?.merchantOfferId;
      if (typeof id === "number" && id > 0) return id;
    }
    return selectedMerchantOfferId;
  }, [cartLevelCheckoutPromoDiscounts, selectedMerchantOfferId]);

  const appliedDiscountRows = useMemo(
    () =>
      (primaryCheckoutDiscount ? [primaryCheckoutDiscount] : []).map((d) => ({
        label: friendlyCheckoutDiscountLabel(d.label),
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
    if (!hasEligibleCheckoutOfferBase) {
      return "Item deals already applied — checkout coupons not available";
    }

    if (missedOfferWalletPending && displayMissedOfferWalletComp) {
      return `${friendlyCheckoutDiscountLabel(displayMissedOfferWalletComp.offerTitle)} unlocked`;
    }

    const subLabel = subscriptionBenefitDiscounts[0]?.label;
    const subSave =
      membershipDeliverySavingsDisplay != null && membershipDeliverySavingsDisplay > 0.005
        ? membershipDeliverySavingsDisplay
        : subscriptionBenefitSavings;
    /** Past-tense membership savings only when free delivery is actually on the bill. */
    const membershipApplied = membershipFreeDeliveryOnBill;

    if (primaryCheckoutDiscount) {
      const promoSave = primaryCheckoutDiscount.amount;
      const promoLabel = friendlyCheckoutDiscountLabel(primaryCheckoutDiscount.label);
      if (membershipApplied && subSave > 0.005 && subLabel) {
        return `You saved ₹${formatCheckoutSavingsRupees(promoSave + subSave)} with ${promoLabel} + free delivery`;
      }
      if (promoSave > 0.005) {
        return `You saved ₹${formatCheckoutSavingsRupees(promoSave)} with ${promoLabel}`;
      }
      return `${promoLabel} applied!`;
    }

    if (membershipApplied && subSave > 0.005 && subLabel) {
      return `You saved ₹${formatCheckoutSavingsRupees(subSave)} with ${friendlyCheckoutDiscountLabel(subLabel)}`;
    }

    if (appliedCouponCode) {
      // Don't claim "applied" until the server bill includes a matching discount line.
      if (!primaryCheckoutDiscount && (billingQuery.isFetching || !serverBill)) {
        return `Applying ${friendlyCheckoutDiscountLabel(appliedCouponLabel ?? appliedCouponCode)}…`;
      }
      if (!primaryCheckoutDiscount) {
        // Bill settled without a cut — error effect surfaces the reason; avoid false success.
        if (featuredCoupon) {
          return featuredCoupon.description || `Save more with '${featuredCoupon.code}'`;
        }
        return "Apply a coupon to save on this order";
      }
      return `${friendlyCheckoutDiscountLabel(appliedCouponLabel ?? appliedCouponCode)} applied`;
    }

    if (featuredCoupon) {
      return featuredCoupon.description || `Save more with '${featuredCoupon.code}'`;
    }

    return "Apply a coupon to save on this order";
  }, [
    hasEligibleCheckoutOfferBase,
    primaryCheckoutDiscount,
    subscriptionBenefitDiscounts,
    subscriptionBenefitSavings,
    membershipFreeDeliveryOnBill,
    membershipDeliverySavingsDisplay,
    appliedCouponCode,
    appliedCouponLabel,
    featuredCoupon,
    missedOfferWalletPending,
    displayMissedOfferWalletComp,
    billingQuery.isFetching,
    serverBill,
  ]);

  const offersAppliedSubline = useMemo(() => {
    if (missedOfferWalletPending && displayMissedOfferWalletComp) {
      return `Saving ₹${formatCheckoutSavingsRupees(displayMissedOfferWalletComp.offerSavingsInr)} on this order · ₹${formatCheckoutSavingsRupees(displayMissedOfferWalletComp.amountInr)} to GatiCash after order`;
    }
    return null;
  }, [missedOfferWalletPending, displayMissedOfferWalletComp]);

  const hasMissedOfferUnlocked = Boolean(missedOfferWalletPending && displayMissedOfferWalletComp);

  const hasAppliedCheckoutPromo = Boolean(
    primaryCheckoutDiscount ||
      (appliedCouponCode && primaryCheckoutDiscount) ||
      appliedPlatformOfferId ||
      (appliedMerchantOfferId && primaryCheckoutDiscount)
  );

  const hasCheckoutOffersCatalog = useMemo(() => {
    const d = checkoutOffersQuery.data;
    if (!d) return false;
    const platformInelVisible = (d.platformOffersIneligible ?? []).filter((o) => {
      const reason = String(o.reason ?? "").toLowerCase();
      return (
        !reason.includes("not available at your delivery location") &&
        !reason.includes("not available for your account")
      );
    });
    return (
      (d.coupons?.length ?? 0) > 0 ||
      (d.merchantOffers?.length ?? 0) > 0 ||
      (d.platformOffers?.length ?? 0) > 0 ||
      (d.merchantOffersIneligible?.length ?? 0) > 0 ||
      platformInelVisible.length > 0
    );
  }, [checkoutOffersQuery.data]);

  /** Hide the apply-coupon row when nothing can be applied (avoids empty-sheet frustration). */
  const showCheckoutCouponRow = useMemo(() => {
    if (!hasEligibleCheckoutOfferBase) return false;
    if (
      hasAppliedCheckoutPromo ||
      hasMissedOfferUnlocked ||
      membershipFreeDeliveryOnBill
    ) {
      return true;
    }
    if (checkoutOffersQuery.isLoading && !checkoutOffersQuery.data) return false;
    return hasCheckoutOffersCatalog;
  }, [
    hasEligibleCheckoutOfferBase,
    hasAppliedCheckoutPromo,
    hasMissedOfferUnlocked,
    membershipFreeDeliveryOnBill,
    checkoutOffersQuery.isLoading,
    checkoutOffersQuery.data,
    hasCheckoutOffersCatalog,
  ]);

  const hasCheckoutOfferSavings =
    hasAppliedCheckoutPromo || subscriptionBenefitSavings > 0.005 || hasMissedOfferUnlocked;

  /**
   * Reconcile a USER-PINNED promo (set only by applyCouponCode/applyPlatformOfferById/
   * applyMerchantOfferById below) against the server bill. Auto mode never writes
   * selectedPlatformOfferId/selectedMerchantOfferId here — those stay null by
   * construction. Backend may auto-apply merchant Precision, auto_apply coupons, or
   * platform offers with promo_config.auto_apply === true. The applied-offer display
   * reads serverBill.discounts directly for auto cases.
   */
  useEffect(() => {
    if (!serverBill || billingQuery.isFetching) return;
    if (!hasEligibleCheckoutOfferBase) return;

    // GatiCash unlock is the active checkout promo — don't re-attach coupon/platform/merchant.
    if (missedOfferWalletPending) {
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      if (selectedPlatformOfferId != null) setSelectedPlatformOfferId(null);
      if (selectedMerchantOfferId != null) setSelectedMerchantOfferId(null);
      setCheckoutOfferUserPinned(false);
      return;
    }

    if (!checkoutOfferUserPinned) return;

    // Never sync Boost/BOGO (item-surface) into selectedMerchantOfferId — that drops cart precision.
    const checkoutPromos = cartLevelCheckoutPromoDiscounts;
    const primary =
      checkoutPromos.length > 0 ? [...checkoutPromos].sort((a, b) => b.amount - a.amount)[0] : null;

    if (selectedPlatformOfferId != null) {
      const platformId =
        primary && typeof primary.meta?.platformOfferId === "number"
          ? (primary.meta.platformOfferId as number)
          : null;
      if (platformId != null) {
        if (selectedPlatformOfferId !== platformId) setSelectedPlatformOfferId(platformId);
        return;
      }
      // Bill settled without this platform discount — drop the pin (don't leave
      // "Applied" + red error forever because the offer is still listed).
      setSelectedPlatformOfferId(null);
      setAppliedCouponCode(null);
      setAppliedCouponLabel(null);
      setCheckoutOfferUserPinned(false);
      setCouponCelebrationVisible(false);
      const stillListed = (checkoutOffersQuery.data?.platformOffers ?? []).some(
        (o) => o.id === selectedPlatformOfferId
      );
      setCouponApplyError(
        stillListed
          ? "This offer could not be applied. Check minimum order or try another offer."
          : "Your platform offer is no longer available and was removed."
      );
      return;
    }

    if (selectedMerchantOfferId != null) {
      const merchantId =
        primary && typeof primary.meta?.merchantOfferId === "number"
          ? (primary.meta.merchantOfferId as number)
          : null;
      if (merchantId != null) {
        // Backend may have fallen back to a different eligible merchant offer — follow it.
        if (selectedMerchantOfferId !== merchantId) setSelectedMerchantOfferId(merchantId);
        if (appliedCouponCode) {
          setAppliedCouponCode(null);
          setAppliedCouponLabel(null);
        }
        return;
      }
      const stillListed = (checkoutOffersQuery.data?.merchantOffers ?? []).some(
        (o) => o.id === selectedMerchantOfferId
      );
      if (!stillListed && !checkoutOffersQuery.isFetching) {
        setSelectedMerchantOfferId(null);
        setCheckoutOfferUserPinned(false);
        setCouponApplyError("Your store offer is no longer available and was removed.");
      }
      return;
    }

    // Pinned coupon only (no platform/merchant id).
    if (appliedCouponCode) {
      const couponApplied = checkoutPromos.some((d) => !isSubscriptionBenefitDiscount(d));
      if (!couponApplied) {
        const listed = (checkoutOffersQuery.data?.coupons ?? []).find(
          (c) => c.code.toUpperCase() === appliedCouponCode.toUpperCase()
        );
        const minOrd = listed?.minOrderAmount;
        const gap =
          minOrd != null && minOrd > 0
            ? Math.ceil(Math.max(0, minOrd - (cartSubtotalForOffers ?? 0)))
            : 0;
        let msg = "This coupon could not be applied on this order.";
        if (gap > 0) {
          msg = `Add ₹${gap} more to use this coupon (min order ₹${Math.round(minOrd!)}).`;
        } else if (listed?.customerSegment === "NEW") {
          msg = "This coupon is for new customers only.";
        } else if (minOrd != null && minOrd > 0) {
          msg = `Minimum order value ₹${Math.round(minOrd)} required for this coupon.`;
        }
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
        setCheckoutOfferUserPinned(false);
        setCouponCelebrationVisible(false);
        setCouponApplyError(msg);
      }
    }
  }, [
    serverBill,
    billingQuery.isFetching,
    billingQuery.dataUpdatedAt,
    hasEligibleCheckoutOfferBase,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    appliedCouponCode,
    checkoutOfferUserPinned,
    missedOfferWalletPending,
    cartLevelCheckoutPromoDiscounts,
    checkoutOffersQuery.data,
    checkoutOffersQuery.isFetching,
    cartSubtotalForOffers,
  ]);

  /** Surface when a user-pinned platform/store promo did not land on this bill (transient). */
  useEffect(() => {
    if (!serverBill || billingQuery.isFetching) return;
    if (!checkoutOfferUserPinned) return;
    const checkoutPromos = cartLevelCheckoutPromoDiscounts;
    if (selectedPlatformOfferId != null) {
      const applied = checkoutPromos.some(
        (d) =>
          typeof d.meta?.platformOfferId === "number" &&
          d.meta.platformOfferId === selectedPlatformOfferId
      );
      // Reconcile effect clears the pin when apply fails; only show error while still pinned.
      if (!applied) {
        setCouponApplyError(
          "This offer could not be applied. Check minimum order or try another offer."
        );
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
      setCouponApplyError(
        applied ? null : "This store offer could not be applied. Check eligibility or try another offer."
      );
    }
  }, [
    serverBill,
    billingQuery.isFetching,
    billingQuery.dataUpdatedAt,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    cartLevelCheckoutPromoDiscounts,
    checkoutOfferUserPinned,
  ]);

  const applyCouponCode = useCallback((code: string, label?: string) => {
    if (!hasEligibleCheckoutOfferBase) {
      setCouponApplyError("Add items without item deals to use checkout offers");
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    setCouponApplyError(null);
    const norm = (c: string | null | undefined) =>
      String(c ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "");
    const want = norm(trimmed);
    // Match eligible first, then soft-locked (min-order) platform offers by coupon code.
    const platformHit =
      checkoutOffersQuery.data?.platformOffers.find((o) => norm(o.couponCode) === want) ??
      checkoutOffersQuery.data?.platformOffersIneligible?.find((o) => norm(o.couponCode) === want) ??
      null;
    if (platformHit) {
      const ineligible = (checkoutOffersQuery.data?.platformOffersIneligible ?? []).find(
        (o) => o.id === platformHit.id
      );
      if (ineligible && !(checkoutOffersQuery.data?.platformOffers ?? []).some((o) => o.id === platformHit.id)) {
        const minOrd = ineligible.minCartAmount;
        const gap =
          minOrd != null && minOrd > 0
            ? Math.ceil(Math.max(0, minOrd - (cartSubtotalForOffers ?? 0)))
            : 0;
        setCouponApplyError(
          gap > 0
            ? `Add ₹${gap} more to use this offer (min order ₹${Math.round(minOrd!)}).`
            : ineligible.reason || "This offer is not eligible on this order yet."
        );
        return;
      }
      setSelectedMerchantOfferId(null);
      pendingMissedOfferWalletRef.current = null;
      setMissedOfferWalletPending(false);
      setSelectedMissedOfferKey(null);
      setMissedOfferCelebration(null);
      setForceNoAutoOffer(false);
      setCheckoutOfferUserPinned(true);
      setSelectedPlatformOfferId(platformHit.id);
      // Pin by platform id only — keep coupon code slot empty so sheet/Applied UI
      // wait for a real FREE_DELIVERY (or other) discount line on the bill.
      setAppliedCouponCode(null);
      setAppliedCouponLabel(platformHit.name ?? label ?? trimmed);
      setCouponCodeInput("");
      setCouponSheetVisible(false);
      setCouponCelebrationCode(platformHit.couponCode?.trim() || trimmed);
      setCouponCelebrationVisible(true);
      return;
    }

    const listed = checkoutOffersQuery.data?.coupons?.find(
      (c) => c.code.toUpperCase() === trimmed.toUpperCase()
    );
    const minOrd = listed?.minOrderAmount;
    const gap =
      minOrd != null && minOrd > 0
        ? Math.ceil(Math.max(0, minOrd - (cartSubtotalForOffers ?? 0)))
        : 0;
    if (gap > 0) {
      setCouponApplyError(
        `Add ₹${gap} more to use this coupon (min order ₹${Math.round(minOrd!)}).`
      );
      return;
    }

    // Replace any other checkout promo (platform / merchant / GatiCash unlock). Membership stays.
    setSelectedPlatformOfferId(null);
    setSelectedMerchantOfferId(null);
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferCelebration(null);
    setForceNoAutoOffer(false);
    setCheckoutOfferUserPinned(true);
    setAppliedCouponCode(trimmed);
    setAppliedCouponLabel(label ?? trimmed);
    setCouponCodeInput("");
    setCouponSheetVisible(false);
    setCouponCelebrationCode(trimmed);
    setCouponCelebrationVisible(true);
  }, [
    hasEligibleCheckoutOfferBase,
    checkoutOffersQuery.data?.platformOffers,
    checkoutOffersQuery.data?.platformOffersIneligible,
    checkoutOffersQuery.data?.coupons,
    cartSubtotalForOffers,
  ]);

  const applyPlatformOfferById = useCallback((offerId: number, name: string | null) => {
    if (!hasEligibleCheckoutOfferBase) return;
    const fromList =
      checkoutOffersQuery.data?.platformOffers.find((o) => o.id === offerId) ??
      checkoutOffersQuery.data?.platformOffersIneligible?.find((o) => o.id === offerId);
    const code = fromList?.couponCode?.trim() || null;
    // Platform offers pin by id only — do NOT dual-write appliedCouponCode (that made the
    // coupon sheet claim "Applied" while billing never waived delivery).
    setAppliedCouponCode(null);
    setAppliedCouponLabel(name ?? fromList?.name ?? code);
    setSelectedMerchantOfferId(null);
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferCelebration(null);
    setSelectedPlatformOfferId(offerId);
    setForceNoAutoOffer(false);
    setCheckoutOfferUserPinned(true);
    setCouponApplyError(null);
    setCouponSheetVisible(false);
    setCouponCelebrationCode(code || name?.trim() || "Offer");
    setCouponCelebrationVisible(true);
  }, [hasEligibleCheckoutOfferBase, checkoutOffersQuery.data]);

  const applyMerchantOfferById = useCallback((offerId: number, couponCode?: string | null) => {
    if (!hasEligibleCheckoutOfferBase) return;
    setSelectedPlatformOfferId(null);
    setAppliedCouponLabel(null);
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferCelebration(null);
    setForceNoAutoOffer(false);
    setCheckoutOfferUserPinned(true);
    setSelectedMerchantOfferId(offerId);
    if (couponCode?.trim()) {
      setAppliedCouponCode(couponCode.trim());
    } else {
      setAppliedCouponCode(null);
    }
    setCouponSheetVisible(false);
    const offerTitle =
      checkoutOffersQuery.data?.merchantOffers.find((o) => o.id === offerId)?.title ??
      checkoutOffersQuery.data?.merchantOffersIneligible?.find((o) => o.id === offerId)?.title ??
      "Offer";
    setCouponCelebrationCode(offerTitle);
    setCouponCelebrationVisible(true);
  }, [hasEligibleCheckoutOfferBase, checkoutOffersQuery.data]);

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
    cartSubtotal: cartSubtotalForOffersResolved,
    hasAppliedOffer: hasAppliedCheckoutOffer,
    blocked:
      !hasEligibleCheckoutOfferBase ||
      !hasCheckoutOffersCatalog ||
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
    if (!couponSheetVisible) return;
    if (!hasEligibleCheckoutOfferBase) {
      setCouponSheetVisible(false);
      return;
    }
    if (
      !checkoutOffersQuery.isLoading &&
      !hasCheckoutOffersCatalog &&
      !hasAppliedCheckoutPromo &&
      !hasMissedOfferUnlocked
    ) {
      setCouponSheetVisible(false);
    }
  }, [
    hasEligibleCheckoutOfferBase,
    couponSheetVisible,
    checkoutOffersQuery.isLoading,
    hasCheckoutOffersCatalog,
    hasAppliedCheckoutPromo,
    hasMissedOfferUnlocked,
  ]);

  useEffect(() => {
    if (!hasEligibleCheckoutOfferBase) {
      setMissedOfferSheetVisible(false);
      return;
    }
    // Precision eligible → no GatiCash unlock nudge (user can open offers sheet).
    if (hideGatiCashUnlockCard) {
      setMissedOfferSheetVisible(false);
      return;
    }
    if (!missedOffersFingerprint) {
      setMissedOfferSheetVisible(false);
      return;
    }
    if (
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
    hasEligibleCheckoutOfferBase,
    hideGatiCashUnlockCard,
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
    pendingMissedOfferWalletRef.current = null;
    setMissedOfferWalletPending(false);
    setSelectedMissedOfferKey(null);
    setMissedOfferCelebration(null);
    setForceNoAutoOffer(true);
    setCheckoutOfferUserPinned(false);
    setCouponCelebrationVisible(false);
  }, []);

  /** Drop checkout coupons / unlock when cart has no discount-eligible base. */
  useEffect(() => {
    if (hasEligibleCheckoutOfferBase) return;
    setMissedOfferSheetVisible(false);
    if (
      appliedCouponCode ||
      selectedPlatformOfferId != null ||
      selectedMerchantOfferId != null ||
      missedOfferWalletPending
    ) {
      removeAllCheckoutOffers();
    }
  }, [
    hasEligibleCheckoutOfferBase,
    appliedCouponCode,
    selectedPlatformOfferId,
    selectedMerchantOfferId,
    missedOfferWalletPending,
    removeAllCheckoutOffers,
  ]);

  const removeAppliedCoupon = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setCheckoutOfferUserPinned(false);
    // Opt out of server auto-apply so the same coupon does not immediately reattach.
    setForceNoAutoOffer(true);
    setCouponCelebrationVisible(false);
  }, []);

  const removeAppliedPlatformOffer = useCallback(() => {
    setSelectedPlatformOfferId(null);
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setCheckoutOfferUserPinned(false);
    setForceNoAutoOffer(false);
    setCouponCelebrationVisible(false);
    setCouponApplyError(null);
  }, []);

  const removeAppliedMerchantOffer = useCallback(() => {
    setSelectedMerchantOfferId(null);
    setCheckoutOfferUserPinned(false);
    setForceNoAutoOffer(false);
  }, []);

  const showItemTotalStrike =
    (itemTotalNetOverride != null && itemTotalNetOverride > 0) || appliedItemDealSavings > 0.005;

  /** List price for Item total strike when deals are folded into the billed item total. */
  const itemTotalStrikeAmount = useMemo(() => {
    if (!serverBill) {
      return itemTotalNetOverride != null && appliedItemDealSavings > 0.005
        ? roundBillAmount(itemTotalNetOverride + appliedItemDealSavings)
        : null;
    }
    if (merchantItemDiscountTotal > 0.05) {
      return serverBill.itemTotal;
    }
    if (appliedItemDealSavings > 0.005) {
      return roundBillAmount(serverBill.itemTotal + appliedItemDealSavings);
    }
    if (itemTotalNetOverride != null && itemTotalNetOverride > 0.005) {
      // Pre-billing / Boost estimate: catalog list vs net override
      return roundBillAmount(itemTotalNetOverride + Math.max(0, clientItemDealSavings));
    }
    return null;
  }, [
    serverBill,
    merchantItemDiscountTotal,
    appliedItemDealSavings,
    itemTotalNetOverride,
    clientItemDealSavings,
  ]);

  const itemTotalNetForSheet = useMemo(() => {
    if (serverBill && merchantItemDiscountTotal > 0.05) {
      return Math.max(0, Math.round(serverBill.itemTotal - merchantItemDiscountTotal));
    }
    if (serverBill) return serverBill.itemTotal;
    return itemTotalNetOverride;
  }, [serverBill, merchantItemDiscountTotal, itemTotalNetOverride]);

  const deliveryFeeStrikeAmount = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return null;
    const quoted = serverBill.deliveryFeeQuotedInr ?? 0;
    const current =
      serverBill.deliveryFee ??
      serverBill.components?.delivery?.taxable_value ??
      0;
    if (quoted > current + 0.005) return quoted;
    const waived = serverBill.deliveryFeeWaivedInr ?? 0;
    if (waived > 0.005 && current > 0.005) {
      return Math.round((current + waived) * 100) / 100;
    }
    if (serverBill.deliveryFee <= 0.005 && quoted > 0.005) return quoted;
    const orig = serverBill.components?.delivery?.original ?? 0;
    const curr = serverBill.components?.delivery?.taxable_value ?? serverBill.deliveryFee ?? 0;
    if (orig > curr + 0.005) return orig;
    if (quoted > curr + 0.005) return quoted;
    return null;
  }, [serverBill, deliveryType]);

  /** Single source of truth for membership delivery savings (applied or upsell preview). */
  const subscriptionDeliveryBenefitResolved = useMemo(() => {
    if (!serverBill || deliveryType !== "delivery") return null;
    return serverBill.subscriptionDeliveryBenefit ?? serverBill.subscriptionDeliveryBenefitEstimate ?? null;
  }, [serverBill, deliveryType]);

  /** Estimated delivery-fee savings with GMitra Plus — same amount in upsell + applied copy. */
  const gmitraPlusDeliverySave = membershipDeliverySavingsDisplay;

  const gmitraPlusMembershipDeliveryFee = useMemo(() => {
    const benefit = subscriptionDeliveryBenefitResolved;
    if (!benefit) return null;
    return Math.round(benefit.membershipDeliveryFeeInr);
  }, [subscriptionDeliveryBenefitResolved]);

  const showDeliveryFeeRow = useMemo(() => {
    if (deliveryType !== "delivery") return false;
    if (deliveryFeePending) return true;
    if (!serverBill) return false;
    return (
      (serverBill.components?.delivery?.taxable_value ?? 0) > 0.005 ||
      (deliveryFeeStrikeAmount ?? 0) > 0.005
    );
  }, [serverBill, deliveryType, deliveryFeeStrikeAmount, deliveryFeePending]);

  const billSubscriptionCharges = useMemo(
    () => pickSubscriptionBillCharges(serverBill?.charges),
    [serverBill?.charges]
  );

  const subscriptionDisplayMiscTotal = useMemo(
    () => subscriptionDisplayTotal(billSubscriptionCharges),
    [billSubscriptionCharges]
  );

  const deliveryFeeLabel = useMemo(() => {
    if (deliveryFeePending) return "Delivery fee";
    if (!serverBill) return "Delivery fee";
    const feeForLabel =
      deliveryFeeStrikeAmount ??
      serverBill.deliveryFee ??
      serverBill.components?.delivery?.taxable_value ??
      0;
    if (feeForLabel <= 0.005) return "Delivery fee";
    const found = (serverBill.charges ?? []).find(
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
  }, [serverBill, uiDistanceKm, deliveryFeeStrikeAmount, deliveryFeePending]);

  const showGmitraPlusAttachRow = deliveryType === "delivery" && showMembershipUpsell;

  const gmitraPlusPromoCopy = useMemo(
    () => {
      const addCopy =
        checkoutPlan && defaultPrice
          ? buildAddPlanCopy(checkoutPlan, defaultPrice)
          : `Join ${subscriptionPlanName}`;
      const freeDeliveryRadius = checkoutPlan?.maxFreeDeliveryRadiusKm ?? 7;
      const saveAmt = gmitraPlusDeliverySave;
      const payDelivery = gmitraPlusMembershipDeliveryFee;
      const partialNote =
        subscriptionDeliveryBenefitResolved?.isPartial && freeDeliveryRadius > 0
          ? `${freeDeliveryRadius} km covered — pay only for extra distance`
          : null;
      const upsellSaveLine =
        saveAmt != null
          ? `Save ₹${formatCheckoutSavingsRupees(saveAmt)} on delivery with ${subscriptionPlanName}`
          : `Add ${subscriptionPlanName} for free delivery benefits`;
      const upsellPayLine =
        payDelivery != null && subscriptionDeliveryBenefitResolved?.isPartial
          ? `Pay only ₹${payDelivery} delivery after membership`
          : saveAmt != null
            ? `Unlock ₹${saveAmt} delivery savings`
            : `Unlock free delivery benefits`;
      return {
        offersTitle: subscriptionOptIn
          ? `${subscriptionPlanName} savings on this order`
          : upsellSaveLine,
        offersSub: subscriptionOptIn
          ? subscriptionDeliveryBenefitResolved?.isPartial
            ? `${subscriptionPlanName}: ${freeDeliveryRadius} km free — you pay only for extra distance.`
            : saveAmt != null && saveAmt > 0
              ? `You're saving ₹${formatCheckoutSavingsRupees(saveAmt)} on delivery on this order.`
              : `${subscriptionPlanName} benefits are applied to your bill.`
          : saveAmt != null && saveAmt > 0
            ? `${addCopy}. Apply to save ₹${formatCheckoutSavingsRupees(saveAmt)} on delivery.`
            : partialNote
              ? `${addCopy}. ${partialNote}`
              : addCopy,
        attachTitle: subscriptionOptIn
          ? `${subscriptionPlanName} applied on this order`
          : upsellPayLine,
        attachSub: subscriptionOptIn
          ? subscriptionDeliveryBenefitResolved?.isPartial
            ? `You save ₹${formatCheckoutSavingsRupees(saveAmt ?? 0)} — delivery ₹${payDelivery ?? 0} for extra km + base fare`
            : "Member benefits are included in your bill."
          : partialNote ? `${addCopy}. ${partialNote}` : addCopy,
        freeDeliveryNote: checkoutPlan?.freeDeliveryEnabled
          ? subscriptionDeliveryBenefitResolved?.isPartial
            ? `${subscriptionPlanName} Free Delivery — ${freeDeliveryRadius} km covered`
            : `Free delivery within ${freeDeliveryRadius} km`
          : null,
        membershipSavingNote:
          saveAmt != null && saveAmt > 0
            ? subscriptionDeliveryBenefitResolved?.isPartial
              ? `Save ₹${formatCheckoutSavingsRupees(saveAmt)} on delivery (partial)`
              : `Save ₹${formatCheckoutSavingsRupees(saveAmt)} on delivery`
            : null,
      };
    },
    [
      subscriptionOptIn,
      membershipDeliverySavingsDisplay,
      gmitraPlusMembershipDeliveryFee,
      subscriptionDeliveryBenefitResolved,
      checkoutPlan,
      defaultPrice,
      subscriptionPlanName,
    ]
  );

  const gstAndOtherBreakdown = useMemo(() => {
    if (!serverBill) return null;
    const comp = serverBill.components;
    if (!comp?.items || !comp.delivery || !comp.packaging || !comp.platform) return null;

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
    push("surge_gst", "GST on surge fee", comp.surge?.gst ?? 0);
    push("small_order_gst", "GST on small-order fee", comp.small_order?.gst ?? 0);
    push("convenience_gst", "GST on convenience fee", comp.convenience?.gst ?? 0);
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
    if (billFinalWithLiveGratitude == null || gatiCashAvailable <= 0.005) return 0;
    const base = roundBillAmount(billFinalWithLiveGratitude - missedOfferUnlockDiscount);
    return Math.min(gatiCashAvailable, Math.max(0, base));
  }, [billFinalWithLiveGratitude, gatiCashAvailable, missedOfferUnlockDiscount]);

  const gatiCashApplyAmount = useMemo(() => {
    if (!useGatiCashWallet || gatiCashMaxApply <= 0.005) return 0;
    return gatiCashMaxApply;
  }, [useGatiCashWallet, gatiCashMaxApply]);

  const checkoutScrollBottomInset = useMemo(
    () =>
      footerBottomInset +
      CHECKOUT_SCROLL_FOOTER_BASE +
      CHECKOUT_SCROLL_BRANDING_CLEARANCE +
      CHECKOUT_SCROLL_GATICASH_BAR_EXTRA +
      (deliveryType === "delivery" && deliveryUnavailableAlert != null ? 44 : 0),
    [footerBottomInset, deliveryType, deliveryUnavailableAlert]
  );

  /** Authoritative total from the last SETTLED server bill (not a mid-flight placeholder). */
  const confirmedToPayAmount = useMemo(() => {
    if (serverBill == null || billFinalWithLiveGratitude == null) return undefined;
    return computeCheckoutToPayAmount({
      finalAmount: billFinalWithLiveGratitude,
      deliveryType,
      deliveryFeePending,
      pendingDeliveryFee: Math.max(
        0,
        serverBill.deliveryFee ?? serverBill.components?.delivery?.taxable_value ?? 0
      ),
      gatiCashApplyAmount,
      missedOfferUnlockDiscount,
      missedOfferWalletPendingAmount:
        missedOfferWalletPending && missedOfferWalletPendingAmount > 0.005
          ? missedOfferWalletPendingAmount
          : 0,
    });
  }, [
    serverBill,
    billFinalWithLiveGratitude,
    gatiCashApplyAmount,
    missedOfferUnlockDiscount,
    missedOfferWalletPending,
    missedOfferWalletPendingAmount,
    deliveryFeePending,
    deliveryType,
  ]);

  /**
   * Snapshot of the cart + confirmed total at the moment billing last SETTLED (i.e. not
   * while a refetch triggered by this cart is still in flight — `keepPreviousData` would
   * otherwise make `confirmedToPayAmount` look "fresh" while it's actually still the
   * PRE-tap value). Only updates once `billingQuery` has finished fetching.
   */
  const lastSettledBillRef = useRef<{ items: CartItem[]; toPayAmount: number } | null>(null);
  /** Address + delivery type + store coords — qty taps must not count as a new scope. */
  const billingDisplayScope = `${selectedAddress?.id ?? "none"}|${deliveryType}|${pickupLat ?? ""}|${pickupLon ?? ""}`;
  const lastSettledScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (confirmedToPayAmount == null || billingQuery.isFetching) return;
    lastSettledBillRef.current = { items, toPayAmount: confirmedToPayAmount };
    lastSettledScopeRef.current = billingDisplayScope;
  }, [confirmedToPayAmount, billingQuery.isFetching, items, billingDisplayScope]);

  /**
   * Display total. Never show cart-only / placeholder / previous-address amounts.
   * Qty +/- on the same address uses the last settled server bill plus the known
   * line-price delta so the number updates instantly without a skeleton flash.
   */
  const toPayAmount = useMemo(() => {
    if (deliveryType === "delivery" && !hasDeliveryAddress) return undefined;

    const scopeChanged =
      lastSettledScopeRef.current != null &&
      lastSettledScopeRef.current !== billingDisplayScope;
    // Only hide for placeholder when the address/delivery scope changed — cart/tip
    // refetches keep the last total visible (with optional qty delta below).
    const stalePlaceholder = billingQuery.isPlaceholderData && scopeChanged;
    if (stalePlaceholder) return undefined;
    if (confirmedToPayAmount == null) return undefined;

    if (scopeChanged && billingQuery.isFetching) return undefined;

    const snapshot = lastSettledBillRef.current;
    if (!snapshot || snapshot.items === items) return confirmedToPayAmount;
    const delta =
      effectiveCartValue(items, itemOfferById) - effectiveCartValue(snapshot.items, itemOfferById);
    if (Math.abs(delta) < 0.005) return confirmedToPayAmount;
    return Math.max(0, roundBillAmount(snapshot.toPayAmount + delta));
  }, [
    confirmedToPayAmount,
    items,
    itemOfferById,
    hasDeliveryAddress,
    deliveryType,
    billingDisplayScope,
    billingQuery.isPlaceholderData,
    billingQuery.isFetching,
  ]);

  const showPaymentFailedSheet = useCallback(
    (amountOverride?: number | null) => {
      idempotencyKeyRef.current = null;
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      setSimulatedPaymentOrder(null);
      setPaymentReturnBusy(false);
      presentCheckoutPaymentFailure({
        amountInr:
          amountOverride ?? (typeof toPayAmount === "number" ? toPayAmount : null),
        methodLabel: "UPI / Cards",
      });
    },
    [toPayAmount]
  );
  /** List price strike — only when payable is actually lower (hide when wallet top-up inflates total).
   * Also when GatiCash covers 100% (₹0 to-pay), strike the pre-wallet amount so CTA/Total Bill
   * explain why the bold total is zero.
   *
   * CRITICAL: tip + Feeding India are part of `finalAmount` / GatiCash. Strike must use
   * pre-wallet total (`toPay + gatiCash`), not `toPay + savings` alone — otherwise custom
   * tip/donation vanish from Total while still inflating the wallet row.
   */
  const gmStrikethroughTotal = useMemo(() => {
    if (toPayAmount == null) return null;
    return computeCheckoutStrikethroughTotal({
      toPayAmount,
      gatiCashApplyAmount,
      checkoutSavingsTotal,
      missedOfferWalletPending,
      missedOfferWalletPendingAmount,
    });
  }, [
    toPayAmount,
    checkoutSavingsTotal,
    gatiCashApplyAmount,
    missedOfferWalletPending,
    missedOfferWalletPendingAmount,
  ]);
  /** Smooth count animation for the grand total — shared by the "Total Bill" teaser and
   * the Place Order CTA so both numbers always read the same value at the same instant.
   * `ready` snaps the first real bill straight in instead of visibly counting up from
   * the 0 placeholder used before billingQuery resolves. */
  const billingReady = toPayAmount != null;
  // The two animated totals used to be driven from here, which re-rendered this
  // entire component once per animation tick on every bill change. They now live
  // inside <AnimatedRupeeAmount>, so each tick re-renders only that leaf.
  /** Payable is fully covered by wallet — explain ₹0 on the Place Order CTA. */
  const fullyPaidByGatiCash =
    toPayAmount != null && toPayAmount <= 0.005 && gatiCashApplyAmount > 0.005;
  const hasValidPayment =
    paymentMethod !== "cod" && ["upi", "card", "wallet", "online"].includes(paymentMethod);
  /** Placeable only when the bill is settled for the selected address (not keepPreviousData). */
  const riderBlocksPlaceOrder =
    deliveryType === "delivery" && deliveryUnavailableAlert != null;
  const canPlaceOrder =
    !isStoreClosed &&
    items.length > 0 &&
    hasDeliveryAddress &&
    !!merchantId &&
    hasValidPayment &&
    serverBill != null &&
    billMatchesSelectedAddress &&
    billingQuery.isSuccess &&
    !billingQuery.isPlaceholderData &&
    (deliveryType === "self_pickup" || !isDeliveryOutOfRange) &&
    !riderBlocksPlaceOrder;

  const takeawayDistanceLabel = useMemo(() => {
    const fromBill = formatMerchantDistanceKm(uiDistanceKm);
    if (fromBill) return fromBill.replace(/\s+/g, " ").trim();
    const fromMerchant = formatMerchantDistanceKm(merchant?.distanceKm);
    if (fromMerchant) return fromMerchant.replace(/\s+/g, " ").trim();
    if (
      merchant?.latitude != null &&
      merchant?.longitude != null &&
      selectedAddress?.latitude != null &&
      selectedAddress?.longitude != null
    ) {
      const km = haversineKm(
        Number(selectedAddress.latitude),
        Number(selectedAddress.longitude),
        Number(merchant.latitude),
        Number(merchant.longitude)
      );
      return formatMerchantDistanceKm(km);
    }
    return null;
  }, [
    uiDistanceKm,
    merchant?.distanceKm,
    merchant?.latitude,
    merchant?.longitude,
    selectedAddress?.latitude,
    selectedAddress?.longitude,
  ]);

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
      ...(appliedCouponCode && selectedPlatformOfferId == null && { couponCode: appliedCouponCode }),
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
        receiverContactName: checkoutReceiverName.trim() || null,
        receiverContactMobile: checkoutReceiverMobile.trim() || null,
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
    checkoutReceiverName,
    checkoutReceiverMobile,
    deliveryPartnerNote,
    instrLeaveWithGuard,
    instrAvoidCalling,
    instrDontRingBell,
    instrPetAtHome,
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
        deliveryContactName: checkoutReceiverName.trim() || profileContactName || null,
        deliveryContactPhone: checkoutReceiverMobile.trim() || profileContactMobile || null,
        merchantName: merchantName ?? undefined,
        merchantPublicName: merchantName ?? null,
        merchantPublicStoreId: merchantId ?? null,
        // Seed tracking map from checkout snapshots until GET /orders/:id returns.
        deliveryLat: selectedAddress.latitude,
        deliveryLng: selectedAddress.longitude,
        ...(merchant?.latitude != null && merchant?.longitude != null
          ? {
              pickupLat: Number(merchant.latitude),
              pickupLng: Number(merchant.longitude),
            }
          : {}),
      });
    },
    [
      queryClient,
      selectedAddress,
      checkoutReceiverName,
      checkoutReceiverMobile,
      profileContactName,
      profileContactMobile,
      deliveryPartnerNote,
      leaveAtDoor,
      instrLeaveWithGuard,
      instrAvoidCalling,
      instrDontRingBell,
      instrPetAtHome,
      restaurantNote,
      merchantName,
      merchantId,
      merchant,
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
    onSuccess: (order) => {
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
        serviceType: "food",
        isSelfPickup: deliveryType === "self_pickup",
      });
      // Navigate first — wallet refresh / cart clear must not delay or unmount
      // the checkout tree before expo-router dispatches payment-success.
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId: order.orderId,
          ...(merchantName ? { merchantName } : {}),
          ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
          ...(etaMaxMinutes > 0 ? { etaMinutes: String(etaMaxMinutes) } : {}),
        },
      });
      void fulfillPendingMissedOfferWallet();
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          clearCart();
          queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        }, 80);
      });
    },
    onError: (err: Error & { response?: { data?: { message?: string; error?: string; code?: string; title?: string } } }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const data = err?.response?.data;
      const blocked =
        data?.code === "SERVICE_BLOCKED_IN_LOCATION" || data?.error === "SERVICE_BLOCKED_IN_LOCATION";
      const msg = blocked
        ? data?.message ??
          "This service is temporarily unavailable in your current location. Please try again later or choose another nearby location."
        : data?.message ?? err?.message ?? "Could not place order.";
      if (blocked) {
        Alert.alert(data?.title ?? "Checkout unavailable", msg, [{ text: "OK" }]);
        presentCheckoutPaymentFailure({
          amountInr: typeof toPayAmount === "number" ? toPayAmount : null,
          methodLabel: "UPI / Cards",
        });
        return;
      }
      showPaymentFailedSheet();
    },
  });

  // [PERF][CHECKOUT] payment-init timing — create-order → Razorpay params ready (dev only).
  const perfPaymentStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (placeOrder.isPending) {
      if (perfPaymentStartRef.current == null) {
        perfPaymentStartRef.current = perfNow();
        checkoutPerfLog("payment:createOrder:start");
      }
    } else if (perfPaymentStartRef.current != null) {
      checkoutPerfLog("payment:createOrder:end", perfNow() - perfPaymentStartRef.current);
      perfPaymentStartRef.current = null;
    }
  }, [placeOrder.isPending]);

  const finalizeArgsRef = useRef<{ pendingId: string; result: RazorpayPaymentResult | null } | null>(
    null
  );

  const finalizeOrder = useMutation({
    // `result: null` means GatiCash covered the whole bill, so no gateway payment exists to
    // verify. Both settlements share this mutation so success / recovery / failure handling
    // below stays identical for every payment shape.
    mutationFn: (args: { pendingId: string; result: RazorpayPaymentResult | null }) => {
      finalizeArgsRef.current = args;
      if (!args.result) {
        return orderService.finalizeWalletOnlyOrderWithRetry(args.pendingId, {
          retries: 3,
          delayMs: 1500,
        });
      }
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
      void clearPendingCheckoutPayment();
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
      seedTrackingOrderCache(orderId, "ORDER_PLACED");
      setActiveOrder({
        orderId,
        status: "ORDER_PLACED",
        etaMinutes: etaMaxMinutes,
        storeId: merchantId ?? null,
        storeName: merchantName ?? null,
        placedAt: Date.now(),
        serviceType: "food",
        isSelfPickup: deliveryType === "self_pickup",
      });
      if (isCheckoutSheet) {
        useCheckoutSheetStore.getState().hide();
      }
      // CRITICAL: navigate FIRST. Wallet refresh and clearCart must not run in
      // the same React batch — emptying the cart swaps checkout to CartEmptyView
      // and tears down the navigator before expo-router can open payment-success.
      router.replace({
        pathname: "/orders/payment-success",
        params: {
          orderId,
          ...(merchantName ? { merchantName } : {}),
          ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
          ...(etaMaxMinutes > 0 ? { etaMinutes: String(etaMaxMinutes) } : {}),
        },
      });
      void fulfillPendingMissedOfferWallet();
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          clearCart();
          queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        }, 80);
      });
    },
    onError: (err: Error & { response?: { data?: { message?: string } }; code?: string }) => {
      setRazorpayModalVisible(false);
      setRazorpayOrderParams(null);
      const msg = err?.response?.data?.message ?? err?.message ?? "Order could not be confirmed.";
      const apiCode = (err as unknown as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const networkErr = isNetworkError(err);

      // A GatiCash-settled order has no gateway payment and no webhook, so nothing can
      // finalize it in the background — the "confirming payment" screen would poll forever.
      // Money only leaves the wallet once the order is created, so failing here means
      // nothing was charged and the customer can simply retry.
      const walletSettled = finalizeArgsRef.current?.result === null;

      const shouldDeferToRecovery =
        finalizeArgsRef.current &&
        !walletSettled &&
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
        showPaymentFailedSheet();
      }
    },
  });

  const runPlaceOrderFlow = useCallback(async () => {
    if (!canPlaceOrder || placeOrder.isPending || finalizeOrder.isPending || razorpayCreating || paymentReturnBusy) return;
    if (!checkoutReceiverName.trim() || !checkoutReceiverMobile.trim()) {
      Alert.alert(
        "Contact details required",
        "Please add your name and mobile number before placing the order.",
        [{ text: "Add details", onPress: () => openReceiverSheet() }]
      );
      return;
    }
    if (deliveryType === "delivery") {
      // Pre-placement serviceability gate (delivery). Fail-open on API/network error so a
      // transient issue never blocks checkout — only a definitive "not serviceable" stops it.
      const allowed = await recheckDeliveryUnavailableGate(true);
      if (!allowed) return;
    }
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
          paymentMethod,
          idempotencyKey: idempotencyKeyRef.current,
        });
        const { label: etaLabel } = checkoutDeliveryEtaRef.current;
        void persistPendingCheckoutPayment({
          pendingId: pending.pendingId,
          idempotencyKey: idempotencyKeyRef.current ?? undefined,
          merchantName: merchantName ?? undefined,
          amount: typeof toPayAmount === "number" ? String(toPayAmount) : undefined,
          method: "UPI / Cards",
          deliveryEtaLabel: etaLabel || undefined,
        });
        // GatiCash covered the whole bill: there is nothing to charge, so skip Razorpay
        // entirely and let the backend settle the order off the wallet ledger. Minting a
        // ₹0 gateway order is impossible and used to fail checkout outright.
        //
        // Never trust a ₹0 pending amount if the checkout UI still shows a payable —
        // that mismatch used to place the order with GatiCash only while PhonePe ₹7.93
        // was still on the CTA.
        if (pending.amount <= 0) {
          const uiPayablePaise =
            typeof toPayAmount === "number" && Number.isFinite(toPayAmount)
              ? Math.round(toPayAmount * 100)
              : null;
          if (uiPayablePaise != null && uiPayablePaise > 0) {
            console.warn("[checkout] refusing wallet-only finalize; UI still has payable", {
              pendingAmount: pending.amount,
              uiPayablePaise,
            });
            showPaymentFailedSheet(toPayAmount);
            return;
          }
          finalizeOrder.mutate({ pendingId: pending.pendingId, result: null });
          return;
        }
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
          await new Promise<void>((resolve) => {
            InteractionManager.runAfterInteractions(() => resolve());
          });
          // Open full Razorpay Standard Checkout (all enabled methods). Method is
          // chosen there — do not lock to a preselected UPI app / custom sheet.
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
  }, [
    deliveryType,
    canPlaceOrder,
    baseOrderPayload,
    placeOrder,
    finalizeOrder,
    razorpayCreating,
    paymentReturnBusy,
    hasValidPayment,
    checkoutReceiverName,
    checkoutReceiverMobile,
    openReceiverSheet,
    recheckDeliveryUnavailableGate,
    toPayAmount,
    showPaymentFailedSheet,
    paymentMethod,
    merchantName,
  ]);

  const handlePlaceOrderPress = useCallback(async () => {
    if (deliveryType === "self_pickup") {
      if (!canPlaceOrder || placeOrder.isPending || finalizeOrder.isPending || razorpayCreating || paymentReturnBusy) {
        return;
      }
      setTakeawayConfirmVisible(true);
      return;
    }
    await runPlaceOrderFlow();
  }, [
    deliveryType,
    canPlaceOrder,
    placeOrder.isPending,
    finalizeOrder.isPending,
    razorpayCreating,
    paymentReturnBusy,
    runPlaceOrderFlow,
  ]);

  useEffect(() => {
    if (paymentFailureRetryNonce < 1) return;
    void handlePlaceOrderPress();
  }, [paymentFailureRetryNonce, handlePlaceOrderPress]);

  useEffect(() => {
    if (paymentFailureChooseNonce < 1) return;
    void handlePlaceOrderPress();
  }, [paymentFailureChooseNonce, handlePlaceOrderPress]);

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
    setPaymentReturnBusy(false);
    setRazorpayCreating(false);
    // Let the user re-tap "Place order" with a fresh intent — most cancels mean
    // "I changed my mind" not "retry the same idempotent attempt".
    idempotencyKeyRef.current = null;
  }, []);

  const handleUpiAppOpened = useCallback(async () => {
    const pendingId = razorpayOrderParams?.pendingId;
    const amount = typeof toPayAmount === "number" ? toPayAmount : null;
    setRazorpayModalVisible(false);
    setRazorpayOrderParams(null);
    if (!pendingId) {
      showPaymentFailedSheet(amount);
      return;
    }

    setPaymentReturnBusy(true);
    try {
      const deadline = Date.now() + 14000;
      while (Date.now() < deadline) {
        const status = await orderService.getPendingOrderStatus(pendingId);
        if (status.finalized && status.orderId) {
          const orderId = status.orderId;
          const { label: etaLabel, etaMaxMinutes } = checkoutDeliveryEtaRef.current;
          seedTrackingOrderCache(orderId, "ORDER_PLACED");
          setActiveOrder({
            orderId,
            status: "ORDER_PLACED",
            etaMinutes: etaMaxMinutes,
            storeId: merchantId ?? null,
            storeName: merchantName ?? null,
            placedAt: Date.now(),
            serviceType: "food",
            isSelfPickup: deliveryType === "self_pickup",
          });
          if (isCheckoutSheet) {
            useCheckoutSheetStore.getState().hide();
          }
          router.replace({
            pathname: "/orders/payment-success",
            params: {
              orderId,
              ...(merchantName ? { merchantName } : {}),
              ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
              ...(etaMaxMinutes > 0 ? { etaMinutes: String(etaMaxMinutes) } : {}),
            },
          });
          void fulfillPendingMissedOfferWallet();
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              clearCart();
              queryClient.invalidateQueries({ queryKey: ["my-orders"] });
            }, 80);
          });
          return;
        }
        if (
          status.paymentState === "failed" ||
          status.paymentState === "refunded" ||
          status.paymentState === "refund_pending"
        ) {
          showPaymentFailedSheet(amount);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      const { label: etaLabel } = checkoutDeliveryEtaRef.current;
      router.replace({
        pathname: "/orders/payment-confirming",
        params: {
          pendingId,
          merchantName: merchantName ?? "",
          message: "We're confirming your payment. Keep this screen open.",
          amount: amount != null ? String(amount) : "",
          method: "UPI / Cards",
          ...(etaLabel ? { deliveryEtaLabel: etaLabel } : {}),
        },
      });
    } catch {
      showPaymentFailedSheet(amount);
    } finally {
      setPaymentReturnBusy(false);
    }
  }, [
    clearCart,
    fulfillPendingMissedOfferWallet,
    isCheckoutSheet,
    merchantId,
    merchantName,
    queryClient,
    razorpayOrderParams?.pendingId,
    router,
    seedTrackingOrderCache,
    setActiveOrder,
    showPaymentFailedSheet,
    toPayAmount,
  ]);

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
    const { pendingId, orderId, amount } = simulatedPaymentOrder;
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
      console.warn("[checkout] dummy fail call errored", e);
    } finally {
      idempotencyKeyRef.current = null;
      setSimulatedSubmitting(false);
      presentCheckoutPaymentFailure({
        amountInr: typeof amount === "number" ? amount / 100 : null,
        methodLabel: "UPI / Cards",
      });
    }
  }, [simulatedPaymentOrder, simulatedSubmitting]);

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
        catalogMrp: null as number | null,
      }));
    }
    return items.map((cartItem) => {
      const baseId = cartItemBaseId(cartItem.menuItemId);
      const menuItem = findMenuItemByCartBaseId(merchant.menu, baseId);
      const mrp =
        menuItem?.basePrice != null && menuItem.basePrice > menuItem.price
          ? menuItem.basePrice
          : null;
      return {
        ...cartItem,
        imageUrl: menuItem?.imageUrl ?? null,
        checkoutSubtext: cartItemSubline(cartItem) || null,
        catalogMrp: mrp,
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
    const cartLine = items.find((i) => i.lineId === editingCartItemId);
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
    const cartLine = items.find((i) => i.lineId === editingCartItemId);
    if (!cartLine) return null;
    return {
      variantId: cartLine.variantId ?? null,
      variantName: cartLine.variantName ?? null,
      addons: (cartLine.addons ?? []).map((a) => ({ addonId: a.addonId })),
      quantity: cartLine.quantity,
      specialInstructions: cartLine.specialInstructions ?? null,
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
        setEditingCartItemId(cartLine.lineId);
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
          foodType: (m as { foodType?: string }).foodType ?? (m as { food_type?: string }).food_type ?? null,
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

  const showBillSkeleton = toPayAmount == null && !billingQuery.isError;

  const showDistanceBanner =
    isDeliveryOutOfRange ||
    (currentVsSelectedDistanceKm != null && currentVsSelectedDistanceKm > 1.5);

  const checkoutPageBg = isDiscoveryDark ? DiscoveryColors.bg : "#F2F2F2";
  const checkoutHeaderBg = isDiscoveryDark ? DiscoveryColors.bg : CHECKOUT_HEADER_BG;
  const checkoutText = isDiscoveryDark ? DiscoveryColors.text : "#1A1A1A";
  const checkoutMuted = isDiscoveryDark ? DiscoveryColors.textMuted : "#4B5563";
  const dCard = isDiscoveryDark ? styles.darkCard : null;
  const dText = isDiscoveryDark ? styles.darkText : null;
  const dMuted = isDiscoveryDark ? styles.darkMuted : null;
  const dIcon = isDiscoveryDark ? DiscoveryColors.textDim : GatiMitraColors.textSecondary;

  if (cartIsEmpty) {
    return (
      <MerchantUiThemeProvider dark={isDiscoveryDark}>
      <View style={[styles.center, { paddingBottom: insets.bottom, backgroundColor: checkoutPageBg }]}>
        <CheckoutText style={[styles.emptyText, isDiscoveryDark && { color: DiscoveryColors.textMuted }]}>
          Cart is empty
        </CheckoutText>
        <TouchableOpacity onPress={handleCheckoutBack} style={styles.ctaSecondary}>
          <CheckoutText style={styles.ctaSecondaryText}>Back to cart</CheckoutText>
        </TouchableOpacity>
      </View>
      </MerchantUiThemeProvider>
    );
  }

  return (
    <MerchantUiThemeProvider dark={isDiscoveryDark}>
    <View style={[styles.container, { backgroundColor: checkoutPageBg }]}>
      {/* GatiMitra-style header: back · merchant name (top, small) + eta + address (with chevron) · share icon */}
      <View
        style={[
          styles.header,
          {
            paddingTop: checkoutHeaderTopPadding,
            backgroundColor: checkoutHeaderBg,
            borderBottomWidth: isDiscoveryDark ? 0 : StyleSheet.hairlineWidth,
            borderBottomColor: isDiscoveryDark ? "transparent" : "#E8E8E8",
            ...(isDiscoveryDark
              ? {
                  shadowColor: "transparent",
                  shadowOpacity: 0,
                  shadowRadius: 0,
                  elevation: 0,
                }
              : null),
          },
        ]}
      >
        <View style={styles.headerRow}>
          {isCheckoutSheet ? (
            <View style={styles.headerBack} />
          ) : (
            <TouchableOpacity onPress={handleCheckoutBack} style={styles.headerBack} hitSlop={12}>
              <Ionicons name="chevron-back" size={22} color={checkoutText} />
            </TouchableOpacity>
          )}
          <View style={styles.headerCenter}>
            <CheckoutText
              style={[
                styles.headerStoreName,
                { color: isDiscoveryDark ? DiscoveryColors.text : "#4B5563" },
              ]}
              numberOfLines={1}
            >
              {merchantName ?? storeFullAddress}
            </CheckoutText>
            <TouchableOpacity
              style={styles.headerAddressHit}
              onPress={openCheckoutAddressSheet}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <View style={styles.headerAddressRow}>
              <CheckoutText
                style={[styles.headerEtaText, isDiscoveryDark && { color: DiscoveryColors.text }]}
                numberOfLines={1}
              >
                <CheckoutText style={[styles.headerEtaStrong, isDiscoveryDark && { color: DiscoveryColors.teal }]}>
                  {deliveryEta}
                </CheckoutText>
                {hasDeliveryAddress ? (
                  <>
                    <CheckoutText style={[styles.headerEtaSecondary, isDiscoveryDark && { color: DiscoveryColors.text }]}>
                      {" "}to {selectedAddress?.label?.toLowerCase() ?? "address"}
                    </CheckoutText>
                    <CheckoutText style={[styles.headerAddressSep, isDiscoveryDark && { color: DiscoveryColors.textDim }]}>
                      {"  |  "}
                    </CheckoutText>
                    <CheckoutText
                      style={[
                        styles.headerFullAddressInline,
                        isDiscoveryDark && { color: DiscoveryColors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedAddress?.fullAddress ?? "Tap to choose address"}
                    </CheckoutText>
                  </>
                ) : (
                  <CheckoutText style={[styles.headerEtaSecondary, isDiscoveryDark && { color: DiscoveryColors.text }]}>
                    {" "}· Select delivery address
                  </CheckoutText>
                )}
              </CheckoutText>
              <Ionicons
                name="chevron-down"
                size={14}
                color={isDiscoveryDark ? DiscoveryColors.text : "#888888"}
                style={styles.headerChevron}
              />
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => void handleShareCheckout()}
            style={styles.headerShareIconBtn}
            hitSlop={10}
            accessibilityLabel="Share restaurant"
          >
            <Ionicons name="share-social-outline" size={20} color={checkoutText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* One-line distance banner — GatiMitra style ("Selected address is N km away from your location") */}
      {showDistanceBanner && (
        <Animated.View
          entering={FadeIn.duration(ANIM_DURATION)}
          style={[
            styles.distanceBannerOuter,
            { backgroundColor: checkoutPageBg },
            isDiscoveryDark && styles.darkDistanceBannerOuter,
          ]}
        >
          <View style={styles.distanceBannerNotch} />
          <View style={[styles.distanceBannerCompact, isDiscoveryDark && styles.darkDistanceBannerInner]}>
            <CheckoutText
              style={[
                styles.distanceBannerCompactText,
                isDiscoveryDark && styles.darkDistanceBannerText,
              ]}
              numberOfLines={2}
            >
              {isDeliveryOutOfRange
                ? "This address is outside the restaurant delivery zone. Choose another address to place your order."
                : `Selected address is ${(currentVsSelectedDistanceKm)?.toFixed(
                    (currentVsSelectedDistanceKm ?? 0) >= 10 ? 0 : 1
                  )} km away from your location`}
            </CheckoutText>
          </View>
        </Animated.View>
      )}

      {checkoutSavingsTotal > 0.005 ? (
        <View style={[styles.checkoutSavingsTag, isDiscoveryDark && styles.darkSavingsTag]}>
          <CheckoutText style={[styles.checkoutSavingsTagText, isDiscoveryDark && styles.darkSavingsTagText]} bold>
            {`🥳 You saved ₹${formatCheckoutSavingsRupees(checkoutSavingsTotal)} on this order`}
          </CheckoutText>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, { backgroundColor: checkoutPageBg }]}
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
          <View style={[styles.checkoutFullBleedSection, dCard]}>
            <View style={styles.orderItemsPreview}>
              {itemsWithImage.map((item) => (
                <CheckoutCartLineRow
                  key={item.lineId}
                  item={item}
                  itemOfferById={itemOfferById}
                  serverLineEligibilityById={serverLineEligibilityById}
                  foodType={
                    findMenuItemByCartBaseId(merchant?.menu, cartItemBaseId(item.menuItemId))?.foodType
                  }
                  onEdit={handleEditCartItem}
                  onIncrement={handleIncrementCartLine}
                  onDecrement={handleDecrementCartLine}
                />
              ))}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.checkoutActionRowScroll}
              contentContainerStyle={styles.checkoutActionRowContent}
            >
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId } })}
                style={[styles.checkoutActionPillHit, isDiscoveryDark && styles.darkPill]}
                activeOpacity={0.8}
              >
                <View style={styles.checkoutActionPill}>
                <CheckoutText style={styles.checkoutActionPillPlus}>+</CheckoutText>
                <CheckoutText style={styles.checkoutActionPillTextMint}>Add more items</CheckoutText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.checkoutActionPillHit,
                  isDiscoveryDark && styles.darkPill,
                  restaurantNote.trim().length > 0 && styles.checkoutActionPillActive,
                ]}
                onPress={() => setRestaurantNoteModalVisible(true)}
                activeOpacity={0.8}
              >
                <View style={styles.checkoutActionPill}>
                <Ionicons name="document-text-outline" size={14} color={isDiscoveryDark ? DiscoveryColors.textMuted : CX.textSecondary} />
                <CheckoutText style={[styles.checkoutActionPillText, dMuted]} numberOfLines={1}>
                  Add a note for the restaurant
                </CheckoutText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.checkoutActionPillHit,
                  isDiscoveryDark && styles.darkPill,
                  skipCutlery && styles.checkoutActionPillActive,
                ]}
                onPress={() => setSkipCutlery((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={styles.checkoutActionPill}>
                <Ionicons name="restaurant-outline" size={14} color={isDiscoveryDark ? DiscoveryColors.textMuted : CX.textSecondary} />
                <CheckoutText style={[styles.checkoutActionPillText, dMuted]} numberOfLines={1}>
                  {"Don't send cutlery"}
                </CheckoutText>
                </View>
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
            <View style={[styles.checkoutFullBleedSection, dCard]}>
              <View style={styles.upsellSectionHeader}>
                <View style={[styles.upsellSectionIcon, isDiscoveryDark && styles.darkUpsellIcon]}>
                  <Ionicons name="grid-outline" size={14} color={isDiscoveryDark ? DiscoveryColors.textDim : "#9CA3AF"} />
                  <View style={styles.upsellSectionIconPlus}>
                    <Ionicons name="add" size={8} color={isDiscoveryDark ? DiscoveryColors.textDim : "#9CA3AF"} />
                  </View>
                </View>
                <CheckoutText style={[styles.upsellSectionTitle, dText]}>Complete your meal with</CheckoutText>
              </View>
              <View style={styles.upsellScrollWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.upsellScrollContent,
                    { gap: upsellChipLayout.gap, paddingRight: 16 },
                  ]}
                  style={[
                    styles.upsellScrollInner,
                    // Explicit height — never flex-grow into sheet leftover (whitespace gap).
                    { height: upsellChipLayout.chipW + 44 },
                  ]}
                >
                  {completeYourMealItems.map((m) => {
                    const { chipW, radius } = upsellChipLayout;
                    const diet = resolveItemDiet({ foodType: m.foodType, isVeg: m.isVeg });
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
                              contentFit="cover"
                              cachePolicy="memory-disk"
                            />
                          ) : (
                            <View
                              style={[
                                styles.upsellImagePlaceholder,
                                diet === "nonveg" && styles.nonVegBg,
                                { borderRadius: radius },
                              ]}
                            >
                              <Ionicons name="restaurant" size={20} color={GatiMitraColors.textSecondary} />
                            </View>
                          )}
                          <View
                            style={[
                              styles.upsellVegBadge,
                              diet === "nonveg" && styles.upsellNonVegBadge,
                              diet === "egg" && styles.upsellEggBadge,
                            ]}
                          >
                            {diet === "veg" ? (
                              <View style={styles.upsellVegDot} />
                            ) : diet === "egg" ? (
                              <View style={styles.upsellEggDot} />
                            ) : (
                              <View style={styles.upsellNonVegDot} />
                            )}
                          </View>
                          <View style={styles.upsellAddBtnOnImage} pointerEvents="none">
                            <Ionicons name="add" size={16} color="#FFFFFF" />
                          </View>
                        </View>
                        <CheckoutText style={[styles.upsellName, { width: chipW }, dText]} numberOfLines={2}>
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
        {showMembershipUpsell || showCheckoutCouponRow ? (
        <Animated.View entering={FadeInDown.duration(ANIM_DURATION).delay(50)} style={styles.section}>
          <View style={[styles.offersCard, dCard]}>
            <LinearGradient
              colors={
                isDiscoveryDark
                  ? ["#134E4A", "#1A2E2C", "#1E1E1E"]
                  : ["#C8DCF2", "#EAF4FC", "#F5FAFF"]
              }
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.offersCardBanner}
            >
              <CheckoutText style={[styles.offersCardBannerTitle, isDiscoveryDark && styles.darkOffersBannerTitle]}>
                Save extra by applying coupons on every order
              </CheckoutText>
              <View style={styles.offersCardBannerIconGlow}>
                <View style={[styles.offersCardBannerIconOuter, isDiscoveryDark && styles.darkOffersIconOuter]}>
                  <View style={[styles.offersCardBannerIconBox, isDiscoveryDark && styles.darkOffersIconBox]}>
                    <CheckoutText
                      style={[
                        styles.offersCardBannerPct,
                        isDiscoveryDark && styles.darkOffersPct,
                      ]}
                    >
                      %
                    </CheckoutText>
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={[styles.offersDottedSep, isDiscoveryDark && styles.darkDash]} />

            {showMembershipUpsell ? (
              <>
                <View style={styles.offersBodyRow}>
                  <MaterialCommunityIcons
                    name="crown-outline"
                    size={20}
                    color={subscriptionAccentColor}
                    style={styles.offersSubIcon}
                  />
                    <View style={styles.offersBodyTextCol}>
                      <CheckoutText style={[styles.offersSubLineBold, dText, styles.offersMemberTitleFlex]}>
                        {gmitraPlusPromoCopy.offersTitle}
                      </CheckoutText>
                      <CheckoutText style={[styles.offersSubLineMuted, dMuted]} numberOfLines={2}>
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
                        isDiscoveryDark && styles.darkApplyOutline,
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
                        {subscriptionOptIn ? "ADDED" : "JOIN"}
                      </CheckoutText>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : null}

            {showCheckoutCouponRow ? (
            <>
            {showMembershipUpsell ? (
              <View style={[styles.offersDottedSep, isDiscoveryDark && styles.darkDash]} />
            ) : null}
            <View style={styles.offersAppliedRow}>
              {hasEligibleCheckoutOfferBase &&
              (hasAppliedCheckoutPromo ||
                hasMissedOfferUnlocked ||
                membershipFreeDeliveryOnBill) ? (
                <View style={styles.offersGreenTick}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : (
                <View style={styles.offersCouponIconCircle}>
                  <CheckoutText style={styles.offersCouponIconPct}>%</CheckoutText>
                </View>
              )}
              <View style={styles.offersBodyTextCol}>
                <CheckoutText style={[styles.offersAppliedHeadline, dText]} numberOfLines={2}>
                  {offersAppliedHeadline}
                </CheckoutText>
                {offersAppliedSubline ? (
                  <CheckoutText style={[styles.offersSubLineMuted, dMuted]} numberOfLines={2}>
                    {offersAppliedSubline}
                  </CheckoutText>
                ) : null}
                {hasEligibleCheckoutOfferBase ? (
                  <TouchableOpacity onPress={() => setCouponSheetVisible(true)} activeOpacity={0.7} hitSlop={6}>
                    <CheckoutText style={styles.offersLearnMore}>View all coupons ›</CheckoutText>
                  </TouchableOpacity>
                ) : null}
              </View>
              {hasEligibleCheckoutOfferBase && hasMissedOfferUnlocked ? (
                <TouchableOpacity onPress={handleRemoveMissedOfferWallet} hitSlop={8} activeOpacity={0.7}>
                  <CheckoutText style={styles.offersRemoveRed}>Remove</CheckoutText>
                </TouchableOpacity>
              ) : hasEligibleCheckoutOfferBase && hasAppliedCheckoutPromo ? (
                <TouchableOpacity onPress={removeAllCheckoutOffers} hitSlop={8} activeOpacity={0.7}>
                  <CheckoutText style={styles.offersRemoveRed}>Remove</CheckoutText>
                </TouchableOpacity>
              ) : hasEligibleCheckoutOfferBase && !membershipFreeDeliveryOnBill ? (
                <TouchableOpacity
                  style={[
                    styles.offersApplyOutline,
                    isDiscoveryDark && styles.darkApplyOutline,
                  ]}
                  onPress={() => {
                    if (featuredCoupon) setCouponCodeInput(featuredCoupon.code);
                    setCouponSheetVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <CheckoutText style={styles.offersApplyOutlineText}>APPLY</CheckoutText>
                </TouchableOpacity>
              ) : null}
            </View>
            </>
            ) : null}
          </View>
        </Animated.View>
        ) : null}



        {displayMissedOfferWalletComp && hasEligibleCheckoutOfferBase ? (
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
          <View style={[styles.gmCheckoutCard, dCard]}>
            <View style={styles.gmCardPad}>
              <View style={styles.deliveryEtaRow}>
                <Ionicons name="flash" size={18} color={isDiscoveryDark ? DiscoveryColors.teal : GatiMitraColors.emerald} style={styles.gmEtaFlashIcon} />
                <View style={styles.gmEtaTextCol}>
                  <CheckoutText style={[styles.gmEtaLine, dText]}>
                    Delivery in <CheckoutText style={[styles.gmEtaBold, isDiscoveryDark && styles.darkTealText]}>{deliveryEta}</CheckoutText>
                  </CheckoutText>
                  {deliveryEtaImpactLabel ? (
                    <CheckoutText style={styles.weatherEtaImpact}>{deliveryEtaImpactLabel}</CheckoutText>
                  ) : null}
                  <CheckoutText style={[styles.gmScheduleLine, dMuted, isDiscoveryDark && styles.darkScheduleLine]} onPress={() => setScheduleSheetVisible(true)}>
                    Want this later? Schedule it
                  </CheckoutText>
                </View>
              </View>
            </View>

            <View style={[styles.gmCardDash, isDiscoveryDark && styles.darkDash]} />

            {hasDeliveryAddress ? (
              <>
            <TouchableOpacity
              style={styles.gmCardPad}
              onPress={openCheckoutAddressSheet}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Change delivery address"
            >
              <View style={styles.gmMetaRow}>
              <Ionicons
                name="location-outline"
                size={20}
                color={dIcon}
                style={styles.gmAddrIcon}
              />
              <View style={styles.gmMetaTextCol}>
                <View style={styles.deliveryAddrTitleRow}>
                  <View style={styles.deliveryAddrTitleTextWrap}>
                    <CheckoutText style={[styles.deliveryAddrLabel, dText]} numberOfLines={2}>
                      <CheckoutText style={[styles.deliveryAddrPre, dText]}>Delivery at </CheckoutText>
                      <CheckoutText style={[styles.deliveryAddrName, dText]}>
                        {selectedAddress?.label ?? "—"}
                      </CheckoutText>
                    </CheckoutText>
                  </View>
                </View>
                <DeliveryAddressText
                  variant="checkout"
                  address={selectedAddress?.fullAddress}
                  emptyLabel="Tap to choose delivery address"
                  style={[styles.deliveryAddrSub, dMuted]}
                />
                {leaveAtDoor ? (
                  <View style={[styles.leaveAtDoorChip, styles.leaveAtDoorChipBelowAddr]}>
                    <Ionicons name="checkmark-circle" size={14} color={GatiMitraColors.emerald} />
                    <CheckoutText style={styles.leaveAtDoorChipText}>Leave at door</CheckoutText>
                  </View>
                ) : null}
              </View>
              <View style={[styles.gmMetaChevron, styles.gmMetaChevronTop]}>
                <Ionicons
                  name="chevron-forward"
                  size={CHECKOUT_META_CHEVRON_SIZE}
                  color={dIcon}
                />
              </View>
              </View>
            </TouchableOpacity>

            <View style={[styles.gmCardDash, isDiscoveryDark && styles.darkDash]} />

            <TouchableOpacity
              style={styles.gmCardPad}
              onPress={() => setInstructionSheetVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.instructionPartnerRow}>
              <Ionicons name="chatbox-ellipses-outline" size={20} color={dIcon} />
              <View style={styles.instructionPartnerTextCol}>
                <CheckoutText style={[styles.instructionPartnerTitle, dText]}>Add instructions for delivery partner</CheckoutText>
                {partnerInstructionSummary ? (
                  <CheckoutText style={[styles.instructionPartnerSummary, dMuted]} numberOfLines={2}>
                    {partnerInstructionSummary}
                  </CheckoutText>
                ) : null}
              </View>
              <View style={styles.gmMetaChevron}>
                <Ionicons
                  name="chevron-forward"
                  size={CHECKOUT_META_CHEVRON_SIZE}
                  color={dIcon}
                />
              </View>
              </View>
            </TouchableOpacity>

            <View style={[styles.gmCardDash, isDiscoveryDark && styles.darkDash]} />
            <TouchableOpacity
              style={styles.gmCardPad}
              onPress={openReceiverSheet}
              activeOpacity={0.75}
              accessibilityLabel="Edit name and phone number"
              accessibilityHint="Shows your contact for this order. Tap to change."
            >
              <View style={styles.checkoutReceiverRow}>
              <Ionicons name="call-outline" size={20} color={dIcon} />
              <View style={styles.checkoutReceiverTextCol}>
                <CheckoutText style={[styles.checkoutReceiverText, dText]} numberOfLines={1}>
                  {checkoutReceiverSummary}
                </CheckoutText>
                {!hasCheckoutReceiverDetails ? (
                  <CheckoutText style={styles.checkoutReceiverHint} numberOfLines={1}>
                    Required before placing order
                  </CheckoutText>
                ) : null}
              </View>
              <View style={styles.gmMetaChevron}>
                <Ionicons
                  name="chevron-forward"
                  size={CHECKOUT_META_CHEVRON_SIZE}
                  color={dIcon}
                />
              </View>
              </View>
            </TouchableOpacity>

            <View style={[styles.gmCardDash, isDiscoveryDark && styles.darkDash]} />
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.gmBillHeaderHit, showGmitraPlusAttachRow && styles.gmBillHeaderWithAttach]}
              onPress={() => setBillSummarySheetVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.gmBillHeader}>
              <Ionicons name="receipt-outline" size={22} color={dIcon} />
              <View style={styles.gmBillHeaderContent}>
                <View style={styles.gmBillTopRow}>
                  <View style={styles.gmBillTitleCol}>
                    <CheckoutText style={[styles.gmBillTitle, dText]}>Total Bill</CheckoutText>
                    {fullyPaidByGatiCash ? (
                      <CheckoutText style={styles.gmBillGatiCashHint}>100% GatiCash used</CheckoutText>
                    ) : null}
                  </View>
                  {!showBillSkeleton ? (
                    <>
                      <View style={styles.gmBillPriceCluster}>
                        {gmStrikethroughTotal != null ? (
                          <AnimatedRupeeAmount
                            value={gmStrikethroughTotal}
                            ready={billingReady}
                            style={styles.gmBillStrike}
                          />
                        ) : null}
                        <AnimatedRupeeAmount
                          value={toPayAmount}
                          ready={billingReady}
                          style={[styles.gmBillFinal, dText]}
                        />
                        {checkoutSavingsTotal > 0.005 ? (
                          <View style={[styles.gmSavedPill, isDiscoveryDark && styles.darkSavedPill]}>
                            <CheckoutText style={[styles.gmSavedPillText, isDiscoveryDark && styles.darkSavedPillText]}>
                              You saved ₹{formatCheckoutSavingsRupees(checkoutSavingsTotal)}
                            </CheckoutText>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.gmMetaChevron}>
                        <Ionicons
                          name="chevron-forward"
                          size={CHECKOUT_META_CHEVRON_SIZE}
                          color={dIcon}
                        />
                      </View>
                    </>
                  ) : (
                    <GMSkeleton dark={isDiscoveryDark} style={{ width: 72, height: 18, borderRadius: 4 }} />
                  )}
                </View>
                <CheckoutText style={[styles.gmBillSub, dMuted]}>
                  {deliveryFeePending
                    ? "Incl. taxes · Delivery fee after address"
                    : "Incl. taxes and charges"}
                </CheckoutText>
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
              </View>
            </TouchableOpacity>

            {showBillSkeleton ? (
              <View style={[styles.billSkeletonWrap, styles.gmCardPadH]}>
                <GMSkeleton dark={isDiscoveryDark} style={styles.billSkeletonLine} />
                <GMSkeleton dark={isDiscoveryDark} style={styles.billSkeletonLastLine} />
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
                  <CheckoutText style={[styles.gmGoldSub, dMuted]} numberOfLines={2}>
                    {gmitraPlusPromoCopy.attachSub}
                  </CheckoutText>
                </View>
                <TouchableOpacity
                  style={[
                    styles.gmGoldAddBtn,
                    { borderColor: subscriptionAttachTheme.accent },
                    isDiscoveryDark && styles.darkApplyOutline,
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
          <CheckoutText style={[styles.cancellationTitle, dMuted]}>CANCELLATION POLICY</CheckoutText>
          <CheckoutText style={[styles.cancellationText, dMuted]}>
            A 100% cancellation fee will be applied if you cancel the order after it is confirmed from your end.{" "}
            See our <LegalLink id="refund-cancellation-policy" style={isDiscoveryDark ? { color: DiscoveryColors.teal } : undefined} />.
          </CheckoutText>
        </View>

        {/* GatiMitra branding — end of content */}
        <BrandingFooter compact />
      </ScrollView>

      <CouponApplyCelebration
        visible={couponCelebrationVisible}
        couponCode={couponCelebrationCode}
        // primaryCheckoutDiscount reflects whichever promo is currently active (coupon,
        // Precision, or Platform) — couponDiscountAmount alone would show 0 for the
        // latter two since it only matches against appliedCouponCode.
        savedAmount={primaryCheckoutDiscount?.amount ?? couponDiscountAmount}
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
        visible={missedOfferSheetVisible && hasEligibleCheckoutOfferBase}
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
        loading={false}
        error={checkoutOffersQuery.isError && !checkoutOffersQuery.data}
        data={checkoutOffersQuery.data}
        merchantId={merchantId}
        cartSubtotal={clientEligibleCheckoutSubtotal}
        itemDealSavingsByOfferId={itemDealSavingsByOfferId}
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
        appliedCouponCode={effectiveAppliedCouponCode}
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

      {/* Payment methods are selected inside Razorpay Standard Checkout. */}

      {/* Footer: Pay using + Place Order CTA. Delivery/takeaway sits on the GatiCash row. */}
      <View
        style={[
          styles.fixedBottom,
          {
            paddingBottom: footerBottomInset,
            backgroundColor: checkoutPageBg,
            borderTopColor: isDiscoveryDark ? DiscoveryColors.border : "#E5E7EB",
            ...(isDiscoveryDark ? { shadowOpacity: 0, elevation: 0 } : null),
          },
        ]}
      >
        <View
          style={[
            styles.gatiCashWalletBarWrap,
            isDiscoveryDark && { borderBottomColor: DiscoveryColors.border },
          ]}
        >
            {deliveryType === "delivery" && deliveryUnavailableAlert != null ? (
              <CheckoutRiderUnavailableBanner
                refreshing={riderAvailabilityRefreshing}
                onRefresh={() => {
                  void refreshRiderAvailability();
                }}
              />
            ) : null}
            <CheckoutGatiCashWalletBar
              balance={gatiCashAvailable}
              maxApplyAmount={gatiCashMaxApply}
              applyAmount={gatiCashApplyAmount}
              checked={useGatiCashWallet}
              onToggle={() => setUseGatiCashWallet((v) => !v)}
              loading={gatiCashBalanceQ.isLoading && authHydrated && !!authSession}
              trailing={
                <CheckoutDeliveryTypeToggle value={deliveryType} onChange={setDeliveryType} />
              }
            />
          </View>
        {needsDeliveryAddress ? (
          <Pressable
            onPress={openCheckoutAddressSheet}
            accessibilityRole="button"
            accessibilityLabel="Select address to continue ordering"
            style={({ pressed }) => [
              styles.ctaSolidPressable,
              styles.footerAddressCtaPressable,
              pressed && styles.ctaTouchPressed,
            ]}
          >
            <View style={[styles.ctaSolid, styles.footerAddressCta]} collapsable={false}>
              <CheckoutText style={styles.ctaSolidTitle} bold numberOfLines={1}>
                Select Address to Continue Ordering
              </CheckoutText>
            </View>
          </Pressable>
        ) : (
          <View style={styles.footerRow}>
            <View style={styles.footerToggleCol}>
              <CheckoutPayUsingButton
                onPress={() => {
                  void handlePlaceOrderPress();
                }}
                disabled={
                  needsDeliveryAddress ||
                  placeOrder.isPending ||
                  finalizeOrder.isPending ||
                  razorpayCreating ||
                  paymentReturnBusy
                }
              />
            </View>
            <View style={styles.footerCtaCol}>
            {isStoreClosed ? (
              <View style={[styles.ctaSolid, styles.ctaSolidMuted]} collapsable={false}>
                <CheckoutText style={styles.ctaSolidTitle} bold>
                  Store closed
                </CheckoutText>
              </View>
            ) : items.length === 0 ? (
              <View style={[styles.ctaSolid, styles.ctaSolidMuted]} collapsable={false}>
                <CheckoutText style={styles.ctaSolidTitle} bold>
                  Add items
                </CheckoutText>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  if (riderBlocksPlaceOrder) {
                    void refreshRiderAvailability();
                    return;
                  }
                  if (!canPlaceOrder) {
                    const reason = !hasDeliveryAddress
                      ? "Add a delivery address to place your order."
                      : deliveryType === "delivery" && isDeliveryOutOfRange
                        ? "This address is outside the restaurant delivery zone. Please choose another address."
                      : billingQuery.isError
                        ? "Could not load the bill. Pull to refresh or try again."
                        : billingQuery.isLoading ||
                            billingQuery.isPlaceholderData ||
                            billingQuery.isFetching
                          ? "Updating your bill — try again in a moment."
                          : !serverBill
                            ? "Waiting for the bill to load."
                            : "Select a payment method to continue.";
                    setAlmostThereModal({ title: "Almost there", message: reason });
                    return;
                  }
                  handlePlaceOrderPress();
                }}
                disabled={
                  riderBlocksPlaceOrder ||
                  (canPlaceOrder &&
                    (placeOrder.isPending ||
                      finalizeOrder.isPending ||
                      razorpayCreating ||
                      paymentReturnBusy))
                }
                accessibilityRole="button"
                accessibilityLabel={
                  riderBlocksPlaceOrder
                    ? "Place order unavailable — low rider availability"
                    : canPlaceOrder
                      ? "Place order"
                      : "Place order unavailable"
                }
                style={({ pressed }) => [styles.ctaSolidPressable, pressed && styles.ctaTouchPressed]}
              >
                <View
                  style={[
                    styles.ctaSolid,
                    riderBlocksPlaceOrder && styles.ctaSolidFaded,
                    !canPlaceOrder && !riderBlocksPlaceOrder && styles.ctaSolidWaiting,
                  ]}
                  collapsable={false}
                >
                  <View style={styles.ctaSolidLeft}>
                    <View style={styles.ctaSolidAmountRow}>
                      {showBillSkeleton ? (
                        <GMSkeleton
                          dark={false}
                          style={{ width: 52, height: 18, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.28)" }}
                        />
                      ) : (
                        <>
                      {gmStrikethroughTotal != null ? (
                        <AnimatedRupeeAmount
                          value={gmStrikethroughTotal}
                          ready={billingReady}
                          style={styles.ctaSolidStrike}
                          bold
                          numberOfLines={1}
                        />
                      ) : null}
                      <AnimatedRupeeAmount
                        value={toPayAmount}
                        ready={billingReady}
                        style={styles.ctaSolidAmount}
                        bold
                        numberOfLines={1}
                      />
                        </>
                      )}
                    </View>
                    <View style={styles.ctaSolidTotalRow}>
                      <CheckoutText
                        style={styles.ctaSolidTotal}
                        bold
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                      >
                        TOTAL
                      </CheckoutText>
                      {fullyPaidByGatiCash ? (
                        <CheckoutText
                          style={styles.ctaSolidGatiCashHint}
                          bold
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.3}
                        >
                          · 100% GatiCash
                        </CheckoutText>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.ctaSolidRight}>
                    {canPlaceOrder &&
                    !riderBlocksPlaceOrder &&
                    (placeOrder.isPending ||
                      finalizeOrder.isPending ||
                      razorpayCreating ||
                      paymentReturnBusy) ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <View style={styles.ctaSolidRightRow}>
                          <CheckoutText
                            style={styles.ctaSolidTitle}
                            bold
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.3}
                          >
                            Place Order
                          </CheckoutText>
                          {canPlaceOrder && !riderBlocksPlaceOrder ? (
                            <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                          ) : null}
                        </View>
                        {!canPlaceOrder || riderBlocksPlaceOrder ? (
                          <CheckoutText style={styles.ctaSolidHint} bold numberOfLines={1}>
                            {riderBlocksPlaceOrder
                              ? "Riders unavailable"
                              : !hasDeliveryAddress
                              ? "Check address"
                              : deliveryType === "delivery" && isDeliveryOutOfRange
                                ? "Out of delivery zone"
                              : billingQuery.isError
                                ? "Bill error"
                                : toPayAmount == null
                                  ? "Loading bill…"
                                  : !hasValidPayment
                                    ? "Select payment"
                                    : "Select payment"}
                          </CheckoutText>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            )}
            </View>
          </View>
        )}
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
          itemOffer={
            itemOfferById.get(customizationSheetItem.id) ??
            (customizationSheetItem.menuItemId != null
              ? itemOfferById.get(String(customizationSheetItem.menuItemId))
              : undefined) ??
            itemOfferById.get(String(customizationSheetItem.id)) ??
            null
          }
          onAdd={(params) => {
            if (editingCartItemId) {
              replaceLine(
                editingCartItemId,
                {
                  menuItemId: params.menuItemId,
                  name: params.name,
                  price: params.price,
                  isVeg: params.isVeg,
                  basePrice: params.basePrice,
                  variantId: params.variantId,
                  variantName: params.variantName,
                  variantSizeValue: params.variantSizeValue,
                  variantSizeUnit: params.variantSizeUnit,
                  addons: params.addons,
                  imageUrl: params.imageUrl ?? customizationSheetItem?.imageUrl ?? null,
                  specialInstructions: params.specialInstructions ?? null,
                },
                params.quantity
              );
            } else {
              useCartStore.getState().addItem(merchantId!, merchantName!, {
                menuItemId: params.menuItemId,
                name: params.name,
                price: params.price,
                isVeg: params.isVeg,
                basePrice: params.basePrice,
                variantId: params.variantId,
                variantName: params.variantName,
                variantSizeValue: params.variantSizeValue,
                variantSizeUnit: params.variantSizeUnit,
                addons: params.addons,
                imageUrl: params.imageUrl ?? customizationSheetItem?.imageUrl ?? null,
                specialInstructions: params.specialInstructions ?? null,
              }, params.quantity, checkoutCartBannerUrl);
            }
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
          <View style={[styles.noteSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }, isDiscoveryDark && styles.darkSheet]}>
            <View style={styles.noteSheetTitleRow}>
              <CheckoutText style={[styles.noteSheetTitle, dText]}>Add a note for the restaurant</CheckoutText>
              <TouchableOpacity
                onPress={() => setRestaurantNoteModalVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={isDiscoveryDark ? DiscoveryColors.text : "#111827"} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.noteSheetInput, isDiscoveryDark && styles.darkInput]}
              value={restaurantNote}
              onChangeText={setRestaurantNote}
              placeholder="e.g. Note for the entire order"
              placeholderTextColor={isDiscoveryDark ? DiscoveryColors.textDim : "#9CA3AF"}
              multiline
              maxLength={280}
              textAlignVertical="top"
            />
            <CheckoutText style={[styles.noteSheetDisclaimer, dMuted]}>
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

      <StoreScheduleSheet
        visible={scheduleSheetVisible}
        onClose={() => setScheduleSheetVisible(false)}
      />

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
        dark={isDiscoveryDark}
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
              isDiscoveryDark && styles.darkSheet,
              {
                paddingBottom: Math.max(insets.bottom, 4),
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
            <CheckoutText style={[styles.addressSelectSheetTitle, dText]}>Select an address</CheckoutText>

            <View style={[styles.addressSelectActionPanel, isDiscoveryDark && styles.darkElevatedPanel]}>
              <Pressable
                style={styles.addressSelectActionHit}
                onPress={() => {
                  void openCheckoutAddAddress({
                    router,
                    closeAddressSheet: () => setAddressSheetVisible(false),
                    hideCheckoutDrawer: isCheckoutSheet,
                    hideCartGate: true,
                  });
                }}
                android_ripple={{ color: "rgba(45, 181, 160, 0.12)" }}
              >
                <View style={styles.addressSelectActionRow}>
                <View style={styles.addressSelectActionLeft}>
                  <Ionicons name="add" size={22} color={CX.mint} />
                  <View style={styles.addressSelectActionTextCol}>
                    <CheckoutText style={[styles.addressSelectActionTitle, dText]}>Add Address</CheckoutText>
                    <CheckoutText style={[styles.addressSelectActionSub, dMuted]} numberOfLines={1}>
                      Search area or drop a pin on the map
                    </CheckoutText>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </View>
              </Pressable>
            </View>

            <CheckoutText style={[styles.addressSelectSectionLabel, dMuted]}>SAVED ADDRESSES</CheckoutText>

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
                style={[
                  styles.addressSelectScroll,
                  { maxHeight: Math.min(420, Math.round(windowHeight * 0.55)) },
                ]}
                contentContainerStyle={styles.addressSelectScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={[styles.addressSelectActionPanel, styles.addressSelectActionPanelInScroll, isDiscoveryDark && styles.darkElevatedPanel]}>
                  {addresses.map((addr, index) => {
                    const busy = addressSheetBusyId === addr.id;
                    const quote = checkoutAddressServiceability[index]?.data;
                    const dist = formatCanonicalQuoteDistance(quote);
                    const title = addr.contactName?.trim() || addr.label || "Saved address";
                    const isOutOfDeliveryZone = isCheckoutSheetAddressOutOfZone(
                      quote,
                      merchant?.latitude,
                      merchant?.longitude,
                      addr
                    );
                    const isDeliverable = quote?.serviceable === true;
                    const isChecking = checkoutAddressServiceability[index]?.isPending === true;
                    // Out-of-zone rows are reference-only and never render a
                    // selected state, even if stale checkout state held this id.
                    const isSelected = selectedAddress?.id === addr.id && isDeliverable;
                    const showLabel =
                      addr.label?.trim() &&
                      addr.label.trim().toLowerCase() !== title.toLowerCase();
                    return (
                      <Pressable
                        key={addr.id}
                        style={[
                          styles.addressSelectActionHit,
                          isSelected && (isDiscoveryDark ? styles.darkRowSelected : styles.addressSelectActionRowSelected),
                          isOutOfDeliveryZone && (isDiscoveryDark ? styles.darkRowUnavailable : styles.addressSelectActionRowUnavailable),
                          index === addresses.length - 1 && styles.addressSelectActionRowLast,
                        ]}
                        onPress={() => {
                          if (isOutOfDeliveryZone) {
                            setOutOfZoneMessageVisible(true);
                            return;
                          }
                          if (isDeliverable) void selectAddressFromCheckoutSheet(addr);
                        }}
                        disabled={
                          addressSheetBusyId != null ||
                          (!isOutOfDeliveryZone && !isDeliverable)
                        }
                        accessibilityState={{ disabled: !isDeliverable }}
                        android_ripple={
                          isOutOfDeliveryZone
                            ? undefined
                            : { color: "rgba(45, 181, 160, 0.1)" }
                        }
                      >
                        <View style={styles.addressSelectActionRow}>
                        <View style={styles.addressSelectActionLeft}>
                          {busy ? (
                            <ActivityIndicator size="small" color={CX.mint} />
                          ) : (
                            <Ionicons
                              name={checkoutAddressRowIcon(addr.label, addr.contactName)}
                              size={22}
                              color={isOutOfDeliveryZone ? "#9CA3AF" : CX.mint}
                            />
                          )}
                          <View style={styles.addressSelectActionTextCol}>
                            {isOutOfDeliveryZone ? (
                              <View style={styles.addressSelectOutOfZonePill}>
                                <CheckoutText style={styles.addressSelectOutOfZonePillText}>
                                  Out of Delivery Zone
                                </CheckoutText>
                              </View>
                            ) : null}
                            <CheckoutText style={[styles.addressSelectActionTitle, dText]} numberOfLines={1}>
                              {title}
                            </CheckoutText>
                            {showLabel ? (
                              <CheckoutText style={styles.addressSelectActionLabel} numberOfLines={1}>
                                {addr.label}
                              </CheckoutText>
                            ) : null}
                            <DeliveryAddressText
                              variant="checkout"
                              address={addr.fullAddress}
                              style={[styles.addressSelectActionSub, dMuted]}
                            />
                            {dist !== "—" ? (
                              <CheckoutText style={styles.addressSelectActionDist}>{dist}</CheckoutText>
                            ) : null}
                          </View>
                        </View>
                        {isOutOfDeliveryZone ? null : isChecking ? (
                          <ActivityIndicator size="small" color="#9CA3AF" />
                        ) : isSelected ? (
                          <View style={styles.addressSelectSelectedPill}>
                            <CheckoutText style={styles.addressSelectSelectedPillText}>SELECTED</CheckoutText>
                          </View>
                        ) : isDeliverable ? (
                          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                        ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <OutOfDeliveryZoneSheet
        visible={outOfZoneMessageVisible}
        onClose={() => setOutOfZoneMessageVisible(false)}
      />

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
          <View style={[styles.noteSheetCard, styles.receiverSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 12 }, isDiscoveryDark && styles.darkSheet]}>
            <View style={styles.noteSheetTitleRow}>
              <CheckoutText style={[styles.noteSheetTitle, dText]}>Your contact for this order</CheckoutText>
              <TouchableOpacity
                onPress={() => setReceiverSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={isDiscoveryDark ? DiscoveryColors.text : "#111827"} />
              </TouchableOpacity>
            </View>
            <DeliveryAddressText
              variant="checkout"
              address={
                selectedAddress
                  ? `${selectedAddress.label ? `${selectedAddress.label} — ` : ""}${selectedAddress.fullAddress}`
                  : ""
              }
              emptyLabel=""
              style={[styles.receiverSheetAddr, dMuted]}
            />
            <CheckoutText style={[styles.receiverFieldLabel, dMuted]}>Receiver&apos;s name</CheckoutText>
            <View style={[styles.receiverInputRow, isDiscoveryDark && styles.darkInput]}>
              <TextInput
                style={[styles.receiverTextInput, dText]}
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
            <CheckoutText style={[styles.receiverFieldLabel, dMuted]}>Receiver&apos;s mobile number</CheckoutText>
            <View style={[styles.receiverInputRow, isDiscoveryDark && styles.darkInput]}>
              <TextInput
                style={[styles.receiverTextInput, dText]}
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
              onPress={() => void saveReceiverDetails()}
            >
              <LinearGradient
                colors={[CX.mintGradient[0], CX.mintGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.receiverSubmitBtn}
              >
                <CheckoutText style={styles.receiverSubmitBtnText}>Submit</CheckoutText>
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
          <View style={[styles.noteSheetCard, { paddingBottom: Math.max(insets.bottom, 16) + 8 }, isDiscoveryDark && styles.darkSheet]}>
            <View style={styles.noteSheetTitleRow}>
              <CheckoutText style={[styles.noteSheetTitle, dText]}>{subscriptionPlanName}</CheckoutText>
              <TouchableOpacity
                onPress={() => setGmitraPlusSheetVisible(false)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={26} color={isDiscoveryDark ? DiscoveryColors.text : "#111827"} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.gmitraSheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <CheckoutText style={[styles.gmitraSheetLead, dMuted]}>
                {checkoutPlan?.description ??
                  `${subscriptionPlanName} is a membership that helps you save on every order with better delivery pricing and exclusive offers.`}
              </CheckoutText>
              <CheckoutText style={[styles.gmitraSheetSectionTitle, dText]}>What you get</CheckoutText>
              {(checkoutPlan?.benefits ?? []).map((benefit) => (
                <CheckoutText key={benefit} style={[styles.gmitraSheetBullet, dMuted]}>
                  • {benefit}
                </CheckoutText>
              ))}
              {gmitraPlusPromoCopy.freeDeliveryNote ? (
                <CheckoutText style={[styles.gmitraSheetBullet, dMuted]}>• {gmitraPlusPromoCopy.freeDeliveryNote}</CheckoutText>
              ) : null}
              {defaultPrice ? (
                <CheckoutText style={[styles.gmitraSheetBullet, dMuted]}>
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
          <View
            style={[
              styles.gstModalCard,
              isDiscoveryDark && {
                backgroundColor: DiscoveryColors.bg,
                shadowOpacity: 0,
                elevation: 0,
              },
            ]}
          >
            <View style={styles.gstModalHeader}>
              <CheckoutText style={[styles.gstModalTitle, dText]}>GST & other charges</CheckoutText>
              <Pressable
                onPress={() => setGstBreakdownModalVisible(false)}
                hitSlop={12}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={isDiscoveryDark ? DiscoveryColors.textMuted : GatiMitraColors.textSecondary} />
              </Pressable>
            </View>
            <CheckoutText style={[styles.gstModalSubtitle, dMuted]}>
              Every GST and platform charge on this order, broken out one by one.
            </CheckoutText>
            <ScrollView style={styles.gstModalScroll} showsVerticalScrollIndicator={false}>
              {gstAndOtherBreakdown?.lines.map((row) => (
                <View key={row.key} style={styles.gstModalLine}>
                  <View style={styles.gstModalLineLeft}>
                    <CheckoutText style={[styles.gstModalLineLabel, dText]}>{row.label}</CheckoutText>
                    {row.sub ? <CheckoutText style={[styles.gstModalLineSub, dMuted]}>{row.sub}</CheckoutText> : null}
                  </View>
                  <CheckoutText style={[styles.gstModalLineValue, dText]}>₹{row.amount.toFixed(2)}</CheckoutText>
                </View>
              ))}
              <View style={[styles.gstModalDivider, isDiscoveryDark && { backgroundColor: DiscoveryColors.border }]} />
              <View style={styles.gstModalLine}>
                <CheckoutText style={[styles.gstModalTotalLabel, dText]}>Total</CheckoutText>
                <CheckoutText style={[styles.gstModalTotalValue, dText]}>
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
        deliveryFeePending={deliveryFeePending}
        deliveryFeeStrikeAmount={deliveryFeeStrikeAmount}
        distanceKm={uiDistanceKm}
        subscriptionPlanName={subscriptionPlanName}
        billSubscriptionCharges={billSubscriptionCharges}
        gstAndOtherBreakdown={gstAndOtherBreakdown}
        onGstInfoPress={() => setGstBreakdownModalVisible(true)}
        visibleDiscounts={visibleDiscounts.map((d) => ({
          ...d,
          label: friendlyCheckoutDiscountLabel(d.label),
        }))}
        showItemTotalStrike={
          showItemTotalStrike &&
          itemTotalStrikeAmount != null &&
          itemTotalNetForSheet != null &&
          itemTotalStrikeAmount > itemTotalNetForSheet + 0.005
        }
        itemTotalNetOverride={itemTotalNetForSheet}
        itemTotalStrikeAmount={itemTotalStrikeAmount}
        youSavedAmount={checkoutSavingsTotal}
        gatiCashApplyAmount={gatiCashApplyAmount}
        missedOfferWalletPendingAmount={missedOfferWalletPendingAmount}
        missedOfferUnlockDiscount={missedOfferUnlockDiscount}
        missedOfferUnlockLabel={
          missedOfferWalletComp?.offerTitle
            ? `${missedOfferWalletComp.offerTitle} unlocked`
            : "Offer unlocked"
        }
        toPayAmount={toPayAmount}
        subscriptionDeliveryBenefitLive={subscriptionDeliveryBenefitResolved}
        {...checkoutGratitudeProps}
      />

      <RazorpayCheckoutModal
        visible={razorpayModalVisible && !!razorpayOrderParams}
        orderParams={razorpayOrderParams}
        checkoutMethod={null}
        prefill={{
          contact: checkoutReceiverMobile.trim() || profileContactMobile || null,
          name: checkoutReceiverName.trim() || profileContactName || null,
          email: (userProfile?.email ?? "").trim() || null,
        }}
        onSuccess={handleRazorpaySuccess}
        onCancel={handleRazorpayCancel}
        onFailure={() => showPaymentFailedSheet(typeof toPayAmount === "number" ? toPayAmount : null)}
        onUpiAppOpened={handleUpiAppOpened}
      />

      <CheckoutPaymentReturnOverlay visible={paymentReturnBusy} />

      <CheckoutTakeawayConfirmModal
        visible={takeawayConfirmVisible}
        distanceLabel={takeawayDistanceLabel}
        onCancel={() => setTakeawayConfirmVisible(false)}
        onContinue={() => {
          setTakeawayConfirmVisible(false);
          void runPlaceOrderFlow();
        }}
      />

      <CheckoutAlmostThereModal
        visible={almostThereModal != null}
        title={almostThereModal?.title ?? "Almost there"}
        message={almostThereModal?.message ?? ""}
        onDismiss={() => setAlmostThereModal(null)}
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
                <View style={styles.simulatedConfirmBtnRow}>
                {simulatedSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <CheckoutText style={styles.simulatedConfirmBtnText}>Simulate Success</CheckoutText>
                  </>
                )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.simulatedFailBtn, simulatedSubmitting && styles.simulatedBtnDisabled]}
                onPress={handleSimulatedPaymentFail}
                activeOpacity={0.85}
                disabled={simulatedSubmitting}
              >
                <View style={styles.simulatedFailBtnRow}>
                <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginRight: 8 }} />
                <CheckoutText style={styles.simulatedFailBtnText}>Simulate Failure</CheckoutText>
                </View>
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
    </MerchantUiThemeProvider>
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
  headerAddressHit: {
    minWidth: 0,
    marginTop: 0,
  },
  headerAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
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
    alignItems: "stretch",
    justifyContent: "center",
  },
  checkoutSavingsTagText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    color: "#2563EB",
    textAlign: "center",
    width: "100%",
    flexShrink: 1,
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
  offersMemberSaveLine: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  offersMemberTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  offersMemberTitleFlex: {
    flex: 1,
    minWidth: 0,
  },
  offersMemberSaveBadgeInline: {
    marginTop: 1,
    flexShrink: 0,
  },
  offersMemberSaveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  offersMemberSaveBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
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
  orderItemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  /** Same dotted underline treatment as Bill Summary fee labels. */
  orderItemNameDashWrap: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderBottomWidth: 1,
    borderStyle: Platform.OS === "ios" ? "dotted" : "dashed",
    borderColor: "#94A3B8",
    paddingBottom: 1,
  },
  orderItemNameDashWrapDark: {
    borderColor: MerchantDarkPalette.textDim,
  },
  orderItemName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1C1C1C",
    lineHeight: 20,
    flexShrink: 1,
  },
  orderItemCustom: {
    fontSize: 12,
    fontWeight: "400",
    color: "#696969",
    marginTop: 2,
    lineHeight: 16,
  },
  orderItemCooking: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
    marginTop: 2,
    lineHeight: 16,
  },
  orderItemEditHit: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  orderItemEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  orderItemEditText: { fontSize: 12, fontWeight: "600", color: CX.mint },
  orderItemEditChevron: { marginLeft: -1, marginTop: 1 },
  orderItemBogoPill: {
    flexShrink: 0,
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#86EFAC",
  },
  orderItemBogoPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803D",
    letterSpacing: 0.2,
  },
  orderItemIneligible: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
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
  orderItemPriceCol: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  orderItemLinePriceStrike: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
    textDecorationColor: "#9CA3AF",
    textAlign: "right",
  },
  orderItemLinePriceOffer: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
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
  checkoutActionPillHit: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  checkoutActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  upsellScrollInner: { overflow: "visible" },
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
  upsellEggBadge: { borderColor: "#F59E0B" },
  upsellVegDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22C55E" },
  upsellNonVegDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#8D4A2B" },
  upsellEggDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#F59E0B" },
  upsellAddBtnOnImage: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#111111",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 5,
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
  gmMetaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 12,
  },
  gmMetaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  /** Fixed trailing slot so address / instructions / contact / bill chevrons share one column. */
  gmMetaChevron: {
    width: CHECKOUT_META_CHEVRON_SIZE,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  gmMetaChevronTop: {
    marginTop: 2,
  },
  deliveryAddrTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  deliveryAddrTitleTextWrap: { flex: 1, minWidth: 0 },
  leaveAtDoorChipBelowAddr: { marginTop: 6, alignSelf: "flex-start" },
  gmAddrChevronHit: {
    justifyContent: "flex-start",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingLeft: 4,
    paddingTop: 2,
  },
  gmAddrRowInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  gmAddrIcon: {
    marginTop: 2,
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
  gmBillHeaderHit: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  gmBillHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
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
  gmBillTitleCol: { flex: 1, minWidth: 0 },
  gmBillTitle: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.textPrimary },
  gmBillGatiCashHint: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.splashMint,
  },
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
  deliveryAddrTextWrap: { flex: 1, minWidth: 0, flexShrink: 1 },
  deliveryAddrLabel: { fontSize: 14, fontWeight: "400", color: GatiMitraColors.textPrimary },
  deliveryAddrSub: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
    flexShrink: 1,
  },
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
  checkoutReceiverTextCol: {
    flex: 1,
    minWidth: 0,
  },
  checkoutReceiverText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  checkoutReceiverHint: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#B45309",
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
  addressSelectActionPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    overflow: "hidden",
  },
  addressSelectActionPanelInScroll: {
    marginBottom: 0,
  },
  addressSelectActionHit: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF0",
  },
  addressSelectActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  addressSelectActionRowLast: { borderBottomWidth: 0 },
  addressSelectActionRowSelected: {
    backgroundColor: "#F0FDFA",
  },
  addressSelectActionRowUnavailable: {
    backgroundColor: "#FAFAFA",
  },
  addressSelectActionLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  addressSelectActionTextCol: { flex: 1, minWidth: 0 },
  addressSelectActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 20,
  },
  addressSelectActionSub: {
    fontSize: 12,
    color: "#4B5563",
    marginTop: 4,
    lineHeight: 17,
  },
  addressSelectActionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 2,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  addressSelectActionDist: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 4,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  addressSelectOutOfZonePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 5,
  },
  addressSelectOutOfZonePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#DC2626",
    letterSpacing: 0.5,
  },
  addressSelectSelectedPill: {
    backgroundColor: CX.mint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  addressSelectSelectedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
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
  addressSelectScrollContent: { flexGrow: 0, paddingBottom: 0 },
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
    backgroundColor: CX.mint,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  simulatedConfirmBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  simulatedConfirmBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  simulatedFailBtn: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#dc2626",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 4,
  },
  simulatedFailBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  simulatedFailBtnText: { fontSize: 16, fontWeight: "700", color: "#dc2626" },
  simulatedBtnDisabled: { opacity: 0.55 },
  simulatedCancelBtn: { paddingVertical: 12, alignItems: "center" },
  simulatedCancelBtnText: { fontSize: 15, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  gatiCashWalletBarWrap: {
    marginHorizontal: -CHECKOUT_PAGE_H_MARGIN,
    marginBottom: 0,
    borderBottomWidth: 0,
    overflow: "visible",
    zIndex: 60,
  },
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
    overflow: "visible",
    ...GatiMitraColors.elevationShadow,
  },
  footerRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
    marginTop: 8,
  },
  footerToggleCol: {
    width: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    maxWidth: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: CHECKOUT_FOOTER_TOGGLE_WIDTH,
    justifyContent: "center",
    alignSelf: "center",
  },
  footerCtaCol: {
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: CHECKOUT_FOOTER_GAP,
    paddingLeft: CHECKOUT_FOOTER_CTA_LEFT_INSET,
    justifyContent: "center",
    alignSelf: "center",
  },
  footerAddressCtaPressable: {
    marginTop: 8,
  },
  footerAddressCta: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
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
  /** Hit target only — paint lives on `ctaSolid` View. */
  ctaSolidPressable: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 52,
  },
  ctaSolid: {
    width: "100%",
    minHeight: 52,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    backgroundColor: CHECKOUT_CTA_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  ctaSolidWaiting: {
    backgroundColor: CHECKOUT_CTA_GREEN_WAIT,
  },
  ctaSolidFaded: {
    backgroundColor: CHECKOUT_CTA_GREEN_MUTED,
    opacity: 0.55,
  },
  ctaSolidMuted: {
    backgroundColor: CHECKOUT_CTA_GREEN_MUTED,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaSolidLeft: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  ctaSolidRight: {
    flexShrink: 0,
    marginLeft: 8,
    maxWidth: "55%",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  ctaSolidRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ctaSolidAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "100%",
  },
  ctaSolidStrike: {
    fontSize: 12,
    fontFamily: "Lora_700Bold",
    color: "rgba(255,255,255,0.72)",
    textDecorationLine: "line-through",
  },
  ctaSolidAmount: {
    fontSize: 15,
    fontFamily: "Lora_700Bold",
    color: "#FFFFFF",
  },
  ctaSolidTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 1,
    maxWidth: "100%",
  },
  ctaSolidTotal: {
    fontSize: 10,
    fontFamily: "Lora_700Bold",
    color: "rgba(255,255,255,0.92)",
  },
  ctaSolidGatiCashHint: {
    fontSize: 9,
    fontFamily: "Lora_700Bold",
    color: "rgba(255,255,255,0.88)",
  },
  ctaSolidTitle: {
    fontSize: 13,
    fontFamily: "Lora_700Bold",
    color: "#FFFFFF",
  },
  ctaSolidHint: {
    fontSize: 9,
    fontFamily: "Lora_700Bold",
    color: "rgba(255,255,255,0.9)",
    marginTop: 2,
    textAlign: "right",
  },
  footerCtaPressable: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 50,
  },
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
    backgroundColor: CHECKOUT_CTA_GREEN_MUTED,
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
    backgroundColor: CHECKOUT_CTA_GREEN_MUTED,
    alignItems: "center",
  },
  ctaDisabledText: { fontSize: 15, fontFamily: "Lora_700Bold", color: "#FFFFFF", textAlign: "center" },
  ctaDisabledSplit: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
    minHeight: 50,
  },
  ctaDisabledAmount: { fontSize: 14, fontFamily: "Lora_700Bold", color: "#FFFFFF" },
  ctaDisabledTotalLabel: { fontSize: 9, fontFamily: "Lora_700Bold", color: "rgba(255,255,255,0.92)", marginTop: 1 },
  ctaDisabledLabel: { fontSize: 12, fontFamily: "Lora_700Bold", color: "#FFFFFF" },
  ctaDisabledHint: { fontSize: 9, fontFamily: "Lora_700Bold", color: "rgba(255,255,255,0.92)", marginTop: 1, textAlign: "right" },
  ctaTouch: { borderRadius: CARD_RADIUS, overflow: "hidden", ...GatiMitraColors.cardShadowSoft },
  ctaTouchPressed: { opacity: 0.92 },
  ctaGradient: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: CHECKOUT_FOOTER_CTA_RADIUS,
    overflow: "hidden",
    minHeight: 50,
    backgroundColor: CHECKOUT_CTA_GREEN,
  },
  ctaLeftPart: { flex: 1, minWidth: 0, alignItems: "flex-start", justifyContent: "center" },
  ctaTotalAmount: { fontSize: 14, fontFamily: "Lora_700Bold", color: "#FFFFFF" },
  ctaTotalLabel: { fontSize: 9, fontFamily: "Lora_700Bold", color: "rgba(255,255,255,0.92)", marginTop: 1 },
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
  ctaLabel: { fontSize: 12, fontFamily: "Lora_700Bold", color: "#FFFFFF" },
  ctaAmount: { fontSize: 15, fontFamily: "Lora_700Bold", color: "#FFFFFF" },
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
  darkCard: {
    backgroundColor: DiscoveryColors.card,
    borderColor: DiscoveryColors.border,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  darkText: { color: DiscoveryColors.text },
  darkMuted: { color: DiscoveryColors.textMuted },
  darkTealText: { color: DiscoveryColors.teal },
  darkDash: { borderBottomColor: DiscoveryColors.dashed },
  darkPill: {
    backgroundColor: DiscoveryColors.pill,
    borderColor: DiscoveryColors.border,
  },
  darkStepper: {
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    borderColor: DiscoveryColors.teal,
  },
  darkBogoPill: {
    backgroundColor: "rgba(45, 212, 191, 0.16)",
    borderColor: DiscoveryColors.teal,
  },
  darkOffersBannerTitle: { color: DiscoveryColors.teal },
  darkOffersIconOuter: {
    backgroundColor: DiscoveryColors.card,
    borderColor: DiscoveryColors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  darkOffersIconBox: { backgroundColor: DiscoveryColors.teal },
  darkOffersPct: { color: "#111111" },
  darkApplyOutline: { backgroundColor: DiscoveryColors.card },
  darkSavedPill: { backgroundColor: "rgba(45, 212, 191, 0.16)" },
  darkSavedPillText: { color: DiscoveryColors.teal },
  darkScheduleLine: { textDecorationColor: DiscoveryColors.dashed },
  darkUpsellIcon: { backgroundColor: DiscoveryColors.search },
  darkToggle: {
    backgroundColor: DiscoveryColors.card,
    borderColor: DiscoveryColors.border,
  },
  darkToggleSegText: { color: DiscoveryColors.text },
  darkSheet: { backgroundColor: DiscoveryColors.card },
  darkInput: {
    backgroundColor: DiscoveryColors.search,
    borderColor: DiscoveryColors.border,
    color: DiscoveryColors.text,
  },
  darkElevatedPanel: {
    backgroundColor: DiscoveryColors.cardElevated,
    borderColor: DiscoveryColors.border,
  },
  darkRowSelected: { backgroundColor: "rgba(45, 212, 191, 0.12)" },
  darkRowUnavailable: { backgroundColor: DiscoveryColors.search },
  darkDistanceBannerOuter: { backgroundColor: DiscoveryColors.bg },
  darkDistanceBannerInner: {
    backgroundColor: "#2A2416",
    borderTopColor: "#5C4A1F",
    borderBottomColor: "#5C4A1F",
  },
  darkDistanceBannerText: { color: "#E8D48B" },
  darkSavingsTag: {
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    borderTopColor: DiscoveryColors.border,
    borderBottomColor: DiscoveryColors.border,
  },
  darkSavingsTagText: { color: DiscoveryColors.teal },
});
