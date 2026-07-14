/**
 * Food floating cart + multi-order tracking dock.
 * Cart visible only on food browse: /home, /home/merchant/*, /search, /home/category/*, etc.
 * Hidden on Home tab (/(tabs)/index), Profile, Orders, checkout, and other non-food routes.
 * Order tracking dock: food browse + /orders when user has active deliveries.
 */

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Modal,
  Pressable,
  Alert,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useRouter, useSegments, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  SlideInUp,
  Easing,
} from "react-native-reanimated";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/store/cartStore";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { useOrderStore } from "@/store/orderStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import type { ActiveOrder } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { merchantService } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";
import { closedStoreCtaCopy, getOpenSoonState } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { FloatingOrderTrackingPill } from "@/components/orders/FloatingOrderTrackingPill";
import { StoreText } from "@/components/store/StoreText";
import { customerTabBarOffset } from "@/components/CustomerTabBar";
import { resolveFloatingCartBottomOffset, FLOATING_CART_UI_LIFT } from "@/constants/layout";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import { prefetchSubscriptionPlans } from "@/lib/subscriptionCache";
import { useAuthStore } from "@/store/authStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useMealsUnderPriceCartUiStore } from "@/store/mealsUnderPriceCartUiStore";

const CHECKOUT_PATH = "/checkout";

/** Shown instead of multi-cart checkout until the feature exists. */
const CHECKOUT_ALL_COMING_SOON = "Checkout all functionality coming soon";

/** Bottom sheet primary accent (GatiMitra-style; brand red token). */
const SHEET_BRAND_RED = GatiMitraColors.closedRed;

/** Floating View Cart fill — matches menu ADD green, not mint gradient. */
const FLOAT_CART_GREEN = "#137243";
const FLOAT_CART_RADIUS = 10;
/** Soft sage wash — readable contrast vs white page + green CTA. */
const FLOAT_BAR_BG = "#E8F5EE";
const FLOAT_BAR_BORDER = "rgba(19, 114, 67, 0.22)";

/** Show on: /home, /home/merchant/*, /home/category/*, /search. */
function useIsFoodServicePage(): boolean {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  if (typeof pathname !== "string") return false;
  const p = pathname as string;
  if (segments[0] === "(auth)" || segments[0] === "(onboarding)") return false;
  if (p.startsWith("/checkout") || p.startsWith("/profile") || p.startsWith("/wallet")) return false;
  if (p === "/home" || p.startsWith("/home/merchant") || p.startsWith("/home/category") || p.startsWith("/home/meals-under-price")) return true;
  if (p.startsWith("/home/service") || p.startsWith("/home/shop")) return false;
  if (p === "/search") return true;
  if (p === "/" || p.startsWith("/(tabs)")) return false;
  return false;
}

/** Show dock on orders list or order detail when user has active orders (switch between orders). */
function useIsOnOrdersArea(): boolean {
  const pathname = usePathname();
  if (typeof pathname !== "string") return false;
  const p = pathname as string;
  return p === "/orders" || p.startsWith("/orders/") || p.includes("orders");
}

/** Hide floating track pill on screens where tracking is redundant or clutters checkout/payment flow. */
function useHideFloatingOrderTrackingPill(): boolean {
  const pathname = usePathname();
  const segments = useSegments() as string[];
  if (typeof pathname !== "string") return false;
  const p = pathname as string;

  if (p === "/checkout" || p.startsWith("/checkout/")) return true;

  if (p.startsWith("/orders/payment-")) return true;

  // Profile & Orders tabs — no floating order dock (orders list already shows actives).
  if (segments[0] === "(tabs)") {
    const tab = String(segments[1] ?? "");
    if (tab === "profile" || tab === "orders") return true;
  }
  if (p === "/profile" || p.startsWith("/profile/")) return true;
  if (p === "/orders") return true;
  // Ride searching screen owns its own bottom UI — no floating pill.
  if (p.startsWith("/home/service/ride-searching")) return true;

  if (segments[0] === "home" && segments[1] === "merchant" && segments.length >= 3) {
    return true;
  }

  return segments[0] === "orders" && segments.length === 2 && String(segments[1] ?? "").length > 0;
}

/** Hide floating cart on order detail / live tracking — map + status already on screen. */
function useHideFloatingCart(): boolean {
  const segments = useSegments() as string[];
  const pathname = usePathname();
  if (segments[0] === "orders" && segments.length === 2 && String(segments[1] ?? "").length > 0) {
    return true;
  }
  // Checkout owns the screen — never show the floating cart (incl. route settle lag).
  if (segments[0] === "checkout") return true;
  if (
    typeof pathname === "string" &&
    (pathname === "/checkout" || pathname.startsWith("/checkout/"))
  ) {
    return true;
  }
  // Meals-under-price uses per-card "View cart" → checkout sheet; no dock pill.
  if (typeof pathname === "string" && pathname.startsWith("/home/meals-under-price")) {
    return true;
  }
  // Merchant menu renders its own Zomato-style Continue dock — never the global pill.
  if (typeof pathname === "string" && /^\/home\/merchant\/[^/]+/.test(pathname)) {
    return true;
  }
  if (segments[0] === "home" && segments[1] === "merchant" && segments.length >= 3) {
    return true;
  }
  return false;
}

/** True when current route is restaurant detail and it's the same as cart merchant */
function useIsInsideCartRestaurant(): boolean {
  const segments = useSegments() as string[];
  const cartMerchantId = useCartStore((s) => s.merchantId);
  const isMerchantPage = segments[0] === "home" && segments[1] === "merchant";
  const currentMerchantId = isMerchantPage ? (segments[2] as string) : null;
  return isMerchantPage && !!cartMerchantId && currentMerchantId === cartMerchantId;
}

function FloatingOrderTrackingPillWithUnread({
  order,
  onPress,
}: {
  order: ActiveOrder;
  onPress: () => void;
}) {
  const { data: chatUnread } = usePartnerChatUnread(order.orderId, true);
  return (
    <FloatingOrderTrackingPill
      order={order}
      onPress={onPress}
      chatUnreadCount={chatUnread?.unreadCount ?? 0}
    />
  );
}

export function GlobalFloatingCart() {
  const insets = useAppSafeAreaInsets();
  const { bottom: rawBottom } = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const segments = useSegments() as string[];
  const isFoodServicePage = useIsFoodServicePage();
  const isOnOrdersArea = useIsOnOrdersArea();
  const hideFloatingOrderTrackingPill = useHideFloatingOrderTrackingPill();
  const hideFloatingCart = useHideFloatingCart();
  const suppressMealsUnderFloating = useMealsUnderPriceCartUiStore((s) => s.suppressFloatingCart);
  const checkoutSheetVisible = useCheckoutSheetStore((s) => s.visible);
  /**
   * Hide cart immediately on View Cart press — pathname still points at the previous
   * food route for a few frames while checkout mounts, which caused a flicker.
   */
  const [hideForCheckoutNav, setHideForCheckoutNav] = useState(false);
  const isInsideCartRestaurant = useIsInsideCartRestaurant();
  const merchantScrollY = useMerchantScrollStore((s) => s.scrollY);
  const isCartCompact = isInsideCartRestaurant && merchantScrollY > 80;

  const items = useCartStore((s) => s.items);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const merchantBannerUrl = useCartStore((s) => s.merchantBannerUrl);
  const stashedCarts = useCartStore((s) => s.stashedCarts);
  const clearCart = useCartStore((s) => s.clearCart);
  const activeOrdersRaw = useOrderStore((s) => s.activeOrders);
  const activeOrderFallback = useOrderStore((s) => s.activeOrder);
  const activeOrders = activeOrdersRaw.filter(
    (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED"
  );
  const trackingOrders = useMemo(() => {
    if (activeOrders.length > 0) return activeOrders;
    if (
      activeOrderFallback &&
      activeOrderFallback.status !== "DELIVERED" &&
      activeOrderFallback.status !== "CANCELLED"
    ) {
      return [activeOrderFallback];
    }
    return [];
  }, [activeOrders, activeOrderFallback]);
  const activeOrder = trackingOrders[0] ?? null;

  const totalCount = items.reduce((n, i) => n + i.quantity, 0);
  const hasCart = totalCount > 0;
  const [allCartsSheetVisible, setAllCartsSheetVisible] = useState(false);
  const [floatThumbLoadFailed, setFloatThumbLoadFailed] = useState(false);
  const [cartRemoveExpanded, setCartRemoveExpanded] = useState(false);

  const hasOtherStashedCarts = useMemo(
    () => Object.values(stashedCarts).some((c) => c.items.length > 0),
    [stashedCarts],
  );
  const showAllCartsTab = hasCart && hasOtherStashedCarts;

  const leadImageUri = useMemo(() => {
    const raw = items.find((i) => i.imageUrl)?.imageUrl;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [items]);

  const heroImageUri = useMemo(() => {
    if (!merchantBannerUrl) return null;
    return toAbsoluteImageUrl(merchantBannerUrl) ?? merchantBannerUrl;
  }, [merchantBannerUrl]);

  /** Resolve banner / dish thumb for floating bar + sheet (shared merchant cache). */
  useEnsureStoreLiveStatus(merchantId);

  const cartMerchantQuery = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId!),
    enabled: !!merchantId && (hasCart || allCartsSheetVisible),
    staleTime: 2 * 60 * 1000,
  });

  const liveStatusFromStore = useStoreStatusStore((s) =>
    merchantId ? (s.statusMap[merchantId] ?? null) : null
  );

  useEffect(() => {
    const m = cartMerchantQuery.data;
    if (!merchantId || !m) return;
    const ls = m.liveStatus;
    if (ls === "OPEN" || ls === "CLOSED") {
      useStoreStatusStore.getState().setStatusFromApi(merchantId, ls === "OPEN", ls);
    }
  }, [cartMerchantQuery.data, merchantId]);

  const isCartStoreClosed = useMemo(() => {
    if (!merchantId || !hasCart) return false;
    if (liveStatusFromStore === "CLOSED") return true;
    if (liveStatusFromStore === "OPEN") return false;
    const m = cartMerchantQuery.data;
    if (m?.liveStatus === "CLOSED") return true;
    if (m?.liveStatus === "OPEN") return false;
    return false;
  }, [merchantId, hasCart, liveStatusFromStore, cartMerchantQuery.data]);

  const cartNextOpenAt = cartMerchantQuery.data?.nextOpenAt ?? null;
  const scheduleNow = useScheduleTick(isCartStoreClosed && cartNextOpenAt != null);

  const cartClosedCta = useMemo(
    () => closedStoreCtaCopy(cartNextOpenAt, scheduleNow),
    [cartNextOpenAt, scheduleNow]
  );

  const cartOpenSoon = getOpenSoonState(cartNextOpenAt, scheduleNow, isCartStoreClosed).isOpenSoon;
  const fetchedBannerUri = useMemo(() => {
    const m = cartMerchantQuery.data;
    if (!m) return null;
    const raw =
      m.displayImage ??
      m.banner_url ??
      (m as { imageUrl?: string | null }).imageUrl ??
      null;
    if (!raw) return null;
    return toAbsoluteImageUrl(raw) ?? raw;
  }, [cartMerchantQuery.data]);

  const resolvedThumbUri = heroImageUri ?? leadImageUri ?? fetchedBannerUri;
  const hasActiveOrder = trackingOrders.length > 0;
  /** Hide track pill on order sub-routes — tracking UI is already on-screen or irrelevant. */
  const showActiveOrderTracking = hasActiveOrder && !hideFloatingOrderTrackingPill;
  /** Cart bar only on food-service routes — never on Profile / Orders / Home tabs / checkout. */
  const showFloatingFoodCart =
    hasCart &&
    !hideFloatingCart &&
    !suppressMealsUnderFloating &&
    !checkoutSheetVisible &&
    !hideForCheckoutNav &&
    isFoodServicePage;
  /** Paged dock when tracking + (cart on food page or multiple orders). */
  const showScrollDock =
    showActiveOrderTracking &&
    ((hasCart && isFoodServicePage) || trackingOrders.length > 1);
  const { width: windowWidth } = useWindowDimensions();
  const dockSideInset = 16;
  const dockPageWidth = Math.max(280, windowWidth - dockSideInset);
  const dockPageCount = trackingOrders.length + (showFloatingFoodCart ? 1 : 0);
  const [dockPageIndex, setDockPageIndex] = useState(0);

  useEffect(() => {
    setDockPageIndex(0);
  }, [dockPageCount, merchantId, trackingOrders.map((o) => o.orderId).join(",")]);

  const cartSlotCount = useMemo(() => {
    const stashedSlots = Object.values(stashedCarts).filter((c) => c.items.length > 0).length;
    return (hasCart ? 1 : 0) + stashedSlots;
  }, [hasCart, stashedCarts]);

  useEffect(() => {
    setFloatThumbLoadFailed(false);
  }, [resolvedThumbUri]);

  useEffect(() => {
    if (!hasCart) setCartRemoveExpanded(false);
  }, [hasCart]);

  useEffect(() => {
    setCartRemoveExpanded(false);
  }, [merchantId]);

  useEffect(() => {
    if (!session || !hasCart) return;
    void prefetchSubscriptionPlans(queryClient);
  }, [session, hasCart, queryClient]);

  useEffect(() => {
    const onCheckout =
      typeof pathname === "string" &&
      (pathname === "/checkout" || pathname.startsWith("/checkout/"));
    if (onCheckout) {
      setHideForCheckoutNav(true);
      return;
    }
    // Left checkout (back to food browse) — allow the floating cart again.
    setHideForCheckoutNav(false);
  }, [pathname]);

  const handleCartPress = () => {
    if (isCartStoreClosed) return;
    const currentPath = typeof pathname === "string" ? pathname : "";
    if (currentPath.startsWith("/checkout")) return;
    setHideForCheckoutNav(true);
    void prefetchSubscriptionPlans(queryClient);
    router.push(CHECKOUT_PATH as any);
  };

  /** Store inner page (merchant menu). */
  const handleViewMenuPress = () => {
    if (!merchantId) return;
    navigateToMerchant(router, queryClient, merchantId);
  };

  const handleDismissCartPress = () => {
    setCartRemoveExpanded(true);
  };

  const handleConfirmRemoveCart = () => {
    clearCart();
    setCartRemoveExpanded(false);
  };

  const handleCancelRemoveCart = () => {
    setCartRemoveExpanded(false);
  };

  const visible =
    showFloatingFoodCart ||
    (showActiveOrderTracking && (isFoodServicePage || isOnOrdersArea));
  if (!visible) return null;

  const inTabs = segments[0] === "(tabs)";
  const bottomOffset =
    resolveFloatingCartBottomOffset(rawBottom, {
      aboveTabBar: inTabs,
      tabBarOffset: inTabs ? customerTabBarOffset(rawBottom) : undefined,
    }) + (isFoodServicePage ? FLOATING_CART_UI_LIFT : 0);

  const slideUpEntering = SlideInUp.duration(250).easing(Easing.out(Easing.ease));
  const compact = isCartCompact;
  const itemLabel = totalCount === 1 ? "1 item" : `${totalCount} items`;

  const cartBarNode = (
    <View
      style={[
        styles.gmShell,
        compact && styles.gmShellCompact,
        !compact && showAllCartsTab && styles.gmShellWithTab,
      ]}
    >
      {!compact && showAllCartsTab ? (
        <Pressable
          style={styles.allCartsTab}
          onPress={() => setAllCartsSheetVisible(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="All carts"
        >
          <StoreText style={styles.allCartsTabText} bold>
            All carts
          </StoreText>
          <Ionicons name="caret-up" size={12} color={FLOAT_CART_GREEN} />
        </Pressable>
      ) : null}

      <View style={[styles.gmBar, compact && styles.gmBarCompact]}>
        <Pressable
          style={styles.gmLeftPress}
          onPress={handleViewMenuPress}
          hitSlop={4}
          android_ripple={{ color: "rgba(5, 150, 105, 0.08)" }}
        >
          <View style={[styles.gmThumb, compact && styles.gmThumbCompact]}>
            {resolvedThumbUri && !floatThumbLoadFailed ? (
              <Image
                source={{ uri: resolvedThumbUri }}
                style={styles.gmThumbImg}
                resizeMode="cover"
                onError={() => setFloatThumbLoadFailed(true)}
              />
            ) : (
              <View style={styles.gmThumbPlaceholder}>
                <Ionicons name="restaurant" size={compact ? 18 : 20} color={GatiMitraColors.textSecondary} />
              </View>
            )}
          </View>
          <View style={styles.gmLeftTextCol}>
            <StoreText
              style={[styles.gmStoreName, compact && styles.gmStoreNameCompact]}
              bold
              numberOfLines={1}
            >
              {merchantName ?? "Restaurant"}
            </StoreText>
            <View style={styles.gmViewMenuRow}>
              <StoreText style={styles.gmViewMenuText} bold>
                View Menu
              </StoreText>
              <Ionicons name="chevron-forward" size={10} color={FLOAT_CART_GREEN} />
            </View>
          </View>
        </Pressable>

        <TouchableOpacity
          activeOpacity={isCartStoreClosed ? 1 : 0.92}
          onPress={handleCartPress}
          disabled={isCartStoreClosed}
          style={[
            styles.gmViewCartCta,
            compact && styles.gmViewCartCtaCompact,
            isCartStoreClosed && styles.gmViewCartCtaClosed,
          ]}
          accessibilityState={{ disabled: isCartStoreClosed }}
          accessibilityLabel={isCartStoreClosed ? "Store closed, cart unavailable" : "View cart"}
        >
          <View
            style={[
              styles.gmViewCartFill,
              isCartStoreClosed
                ? cartOpenSoon
                  ? styles.gmViewCartFillOpenSoon
                  : styles.gmViewCartFillClosed
                : null,
            ]}
            pointerEvents="none"
          >
            <StoreText
              style={[styles.gmViewCartTitle, compact && styles.gmViewCartTitleCompact]}
              bold
            >
              {isCartStoreClosed ? cartClosedCta.title : "View Cart"}
            </StoreText>
            <StoreText
              style={[styles.gmViewCartSub, compact && styles.gmViewCartSubCompact]}
              bold={!isCartStoreClosed}
            >
              {isCartStoreClosed ? cartClosedCta.sub : itemLabel}
            </StoreText>
          </View>
        </TouchableOpacity>

        <View style={[styles.gmRightActions, cartRemoveExpanded && styles.gmRightActionsExpanded]}>
          <Pressable
            style={[styles.gmCloseBtn, compact && styles.gmCloseBtnCompact]}
            onPress={cartRemoveExpanded ? handleCancelRemoveCart : handleDismissCartPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={cartRemoveExpanded ? "Cancel remove cart" : "Remove cart"}
          >
            <Ionicons name="close" size={compact ? 18 : 20} color={GatiMitraColors.textSecondary} />
          </Pressable>
          {cartRemoveExpanded ? (
            <Pressable
              style={[styles.gmRemovePanel, compact && styles.gmRemovePanelCompact]}
              onPress={handleConfirmRemoveCart}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Confirm remove cart"
            >
              <StoreText style={[styles.gmRemoveText, compact && styles.gmRemoveTextCompact]} bold>
                Remove
              </StoreText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  const cartContentNode = showFloatingFoodCart ? cartBarNode : null;

  const onDockScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / dockPageWidth);
    if (idx !== dockPageIndex && idx >= 0 && idx < dockPageCount) {
      setDockPageIndex(idx);
    }
  };

  if (showScrollDock) {
    return (
      <>
        <Animated.View
          entering={slideUpEntering}
          style={[styles.wrap, styles.dockWrap, { bottom: bottomOffset }]}
          pointerEvents="box-none"
        >
          <View style={styles.dockContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={dockPageWidth}
              snapToAlignment="start"
              disableIntervalMomentum
              onMomentumScrollEnd={onDockScroll}
              onScrollEndDrag={onDockScroll}
              style={[styles.dockScroll, { width: dockPageWidth }]}
              contentContainerStyle={styles.dockContentPaged}
            >
              {trackingOrders.map((ord) => (
                <View key={ord.orderId} style={[styles.dockPage, { width: dockPageWidth }]}>
                  <FloatingOrderTrackingPillWithUnread
                    order={ord}
                    onPress={() => router.push(`/orders/${ord.orderId}` as const)}
                  />
                </View>
              ))}
              {showFloatingFoodCart ? (
                <View style={[styles.dockPage, { width: dockPageWidth }]}>
                  {cartContentNode}
                </View>
              ) : null}
            </ScrollView>
            {dockPageCount > 1 ? (
              <View style={styles.dockDots} pointerEvents="none">
                {Array.from({ length: dockPageCount }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dockDot, i === dockPageIndex && styles.dockDotActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </Animated.View>
        {showFloatingFoodCart ? (
          <AllCartsSheetModal
            visible={allCartsSheetVisible}
            onClose={() => setAllCartsSheetVisible(false)}
            merchantName={merchantName}
            merchantId={merchantId}
            cartSlotCount={cartSlotCount}
            thumbUri={resolvedThumbUri}
            itemLabel={itemLabel}
            onViewMenu={() => {
              setAllCartsSheetVisible(false);
              handleViewMenuPress();
            }}
            isStoreClosed={isCartStoreClosed}
            closedCta={cartClosedCta}
            cartOpenSoon={cartOpenSoon}
            onViewCart={() => {
              setAllCartsSheetVisible(false);
              handleCartPress();
            }}
            onRemoveCart={() => {
              setAllCartsSheetVisible(false);
              clearCart();
            }}
          />
        ) : null}
      </>
    );
  }

  if (showActiveOrderTracking && activeOrder && !hasCart) {
    return (
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, styles.trackingWrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        <FloatingOrderTrackingPillWithUnread
          order={activeOrder}
          onPress={() => router.push(`/orders/${activeOrder.orderId}` as const)}
        />
      </Animated.View>
    );
  }

  if (!showFloatingFoodCart) return null;

  return (
    <>
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        {cartContentNode}
      </Animated.View>

      <AllCartsSheetModal
        visible={allCartsSheetVisible}
        onClose={() => setAllCartsSheetVisible(false)}
        merchantName={merchantName}
        merchantId={merchantId}
        cartSlotCount={cartSlotCount}
        thumbUri={resolvedThumbUri}
        itemLabel={itemLabel}
        onViewMenu={() => {
          setAllCartsSheetVisible(false);
          handleViewMenuPress();
        }}
        isStoreClosed={isCartStoreClosed}
        closedCta={cartClosedCta}
        cartOpenSoon={cartOpenSoon}
        onViewCart={() => {
          setAllCartsSheetVisible(false);
          handleCartPress();
        }}
        onRemoveCart={() => {
          setAllCartsSheetVisible(false);
          clearCart();
        }}
      />
    </>
  );
}

function AllCartsSheetModal({
  visible,
  onClose,
  merchantName,
  merchantId,
  cartSlotCount,
  thumbUri,
  itemLabel,
  onViewMenu,
  onViewCart,
  onRemoveCart,
  isStoreClosed = false,
  closedCta = { title: "Store closed", sub: "Opens later" },
  cartOpenSoon = false,
}: {
  visible: boolean;
  onClose: () => void;
  merchantName: string | null;
  merchantId: string | null;
  cartSlotCount: number;
  thumbUri: string | null;
  itemLabel: string;
  onViewMenu: () => void;
  onViewCart: () => void;
  onRemoveCart: () => void;
  isStoreClosed?: boolean;
  closedCta?: { title: string; sub: string };
  cartOpenSoon?: boolean;
}) {
  const insets = useAppSafeAreaInsets();
  const [thumbLoadFailed, setThumbLoadFailed] = useState(false);
  const [rowRemoveExpanded, setRowRemoveExpanded] = useState(false);

  useEffect(() => {
    setThumbLoadFailed(false);
    if (!visible) setRowRemoveExpanded(false);
  }, [thumbUri, visible]);

  const onCheckoutAllPress = () => {
    Alert.alert("Coming soon", CHECKOUT_ALL_COMING_SOON);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetDim} onPress={onClose}>
        <Pressable style={styles.sheetStack} onPress={() => {}}>
          <View style={styles.sheetTopCluster}>
            <TouchableOpacity style={styles.sheetFloatingClose} onPress={onClose} activeOpacity={0.85} hitSlop={12}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={[styles.sheetCard, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <View style={styles.sheetHeaderTooltipBlock}>
                <View style={styles.sheetHeaderRow}>
                  <Text style={styles.sheetTitle}>Your Carts ({cartSlotCount})</Text>
                  <Pressable
                    style={styles.sheetCheckoutAllBtn}
                    onPress={onCheckoutAllPress}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Checkout all carts"
                  >
                    <Text style={styles.sheetCheckoutAllText}>Checkout all</Text>
                    <Ionicons name="chevron-forward" size={16} color={SHEET_BRAND_RED} />
                  </Pressable>
                </View>

                <View style={styles.sheetCaretRow}>
                  <View style={styles.sheetCaretFlex} />
                  <View style={styles.sheetCaretWrap}>
                    <Ionicons name="caret-up" size={18} color="#111827" />
                  </View>
                </View>

                <View style={styles.sheetComingSoonPill}>
                  <Text style={styles.sheetComingSoonPillText}>{CHECKOUT_ALL_COMING_SOON}</Text>
                </View>
              </View>

              {merchantId ? (
                <View style={styles.sheetCartRow}>
                  <View style={styles.sheetCartThumb}>
                    {thumbUri && !thumbLoadFailed ? (
                      <Image
                        source={{ uri: thumbUri }}
                        style={styles.gmThumbImg}
                        resizeMode="cover"
                        onError={() => setThumbLoadFailed(true)}
                      />
                    ) : (
                      <View style={styles.gmThumbPlaceholder}>
                        <Ionicons name="restaurant" size={20} color={GatiMitraColors.textSecondary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.sheetCartMid}>
                    <StoreText style={styles.sheetCartName} bold numberOfLines={1}>
                      {merchantName ?? "Restaurant"}
                    </StoreText>
                    <Pressable style={styles.sheetViewMenuRow} onPress={onViewMenu} hitSlop={6}>
                      <StoreText style={styles.sheetMenuLinkText} bold>
                        View Menu
                      </StoreText>
                      <Ionicons name="chevron-forward" size={10} color={FLOAT_CART_GREEN} />
                    </Pressable>
                  </View>
                    <View style={[styles.sheetCartActions, rowRemoveExpanded && styles.sheetCartActionsExpanded]}>
                      <TouchableOpacity
                        activeOpacity={isStoreClosed ? 1 : 0.92}
                        onPress={onViewCart}
                        disabled={isStoreClosed}
                        style={[styles.sheetViewCartBtn, isStoreClosed && styles.gmViewCartCtaClosed]}
                      >
                        <View
                          style={[
                            styles.sheetViewCartFill,
                            isStoreClosed
                              ? cartOpenSoon
                                ? styles.gmViewCartFillOpenSoon
                                : styles.gmViewCartFillClosed
                              : null,
                          ]}
                          pointerEvents="none"
                        >
                          <StoreText style={styles.sheetViewCartBtnTitle} bold>
                            {isStoreClosed ? closedCta.title : "View Cart"}
                          </StoreText>
                          <StoreText style={styles.sheetViewCartBtnSub} bold={!isStoreClosed}>
                            {isStoreClosed ? closedCta.sub : itemLabel}
                          </StoreText>
                        </View>
                      </TouchableOpacity>
                      <Pressable
                        style={styles.sheetRowClose}
                        onPress={
                          rowRemoveExpanded
                            ? () => setRowRemoveExpanded(false)
                            : () => setRowRemoveExpanded(true)
                        }
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={18} color={GatiMitraColors.textSecondary} />
                      </Pressable>
                      {rowRemoveExpanded ? (
                        <Pressable
                          style={styles.sheetRemovePanel}
                          onPress={onRemoveCart}
                          hitSlop={6}
                        >
                          <Text style={styles.sheetRemoveText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                </View>
              ) : (
                <Text style={styles.sheetEmpty}>No active cart.</Text>
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  trackingWrap: {
    left: 12,
    right: 12,
  },
  gmShell: {
    width: "100%",
    maxWidth: 400,
    position: "relative",
    paddingTop: 0,
    alignItems: "stretch",
  },
  gmShellWithTab: {
    paddingTop: 14,
  },
  gmShellCompact: {
    paddingTop: 0,
    maxWidth: 420,
  },
  allCartsTab: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GatiMitraColors.border,
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  allCartsTabText: {
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: FLOAT_CART_GREEN,
    letterSpacing: 0.2,
  },
  gmBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: FLOAT_BAR_BG,
    borderRadius: 16,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: FLOAT_BAR_BORDER,
  },
  gmBarCompact: {
    borderRadius: 14,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  gmLeftPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingVertical: 2,
    paddingRight: 4,
  },
  gmThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  gmThumbCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  gmThumbImg: {
    width: "100%",
    height: "100%",
  },
  gmThumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  gmLeftTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  gmStoreName: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimary,
  },
  gmStoreNameCompact: {
    fontSize: 13,
  },
  gmViewMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    marginTop: 2,
  },
  gmViewMenuText: {
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: FLOAT_CART_GREEN,
  },
  gmViewCartCta: {
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
    minWidth: 96,
  },
  gmViewCartCtaCompact: {
    minWidth: 88,
    borderRadius: FLOAT_CART_RADIUS,
  },
  gmViewCartCtaClosed: {
    opacity: 0.58,
  },
  dockPillClosed: {
    opacity: 0.58,
  },
  gmViewCartFill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    backgroundColor: FLOAT_CART_GREEN,
    borderRadius: FLOAT_CART_RADIUS,
  },
  gmViewCartFillOpenSoon: {
    backgroundColor: "#16A34A",
  },
  gmViewCartFillClosed: {
    backgroundColor: "#6B7280",
  },
  gmViewCartTitle: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
  },
  gmViewCartTitleCompact: {
    fontSize: 12,
  },
  gmViewCartSub: {
    fontSize: 10,
    fontFamily: StoreFonts.loraBold,
    color: "rgba(255,255,255,0.95)",
    marginTop: 1,
  },
  gmViewCartSubCompact: {
    fontSize: 9,
  },
  gmCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: FLOAT_BAR_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  gmCloseBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  gmRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    flexShrink: 0,
  },
  gmRightActionsExpanded: {
    backgroundColor: "#FFF1F2",
    borderRadius: 22,
    paddingRight: 4,
    overflow: "hidden",
  },
  gmRemovePanel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    minHeight: 38,
  },
  gmRemovePanelCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
  },
  gmRemoveText: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: SHEET_BRAND_RED,
    letterSpacing: 0.2,
  },
  gmRemoveTextCompact: {
    fontSize: 13,
  },
  sheetDim: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  /** Full-bleed bottom sheet — no horizontal inset. */
  sheetStack: {
    width: "100%",
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  sheetTopCluster: {
    width: "100%",
    alignItems: "center",
  },
  sheetFloatingClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -22,
    zIndex: 4,
    ...Platform.select({
      android: { elevation: 8 },
    }),
  },
  sheetCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 26,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
    }),
  },
  sheetHeaderTooltipBlock: {
    marginBottom: 16,
  },
  sheetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  sheetCheckoutAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  sheetCheckoutAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: SHEET_BRAND_RED,
  },
  sheetCaretRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 10,
    marginBottom: -1,
  },
  sheetCaretFlex: {
    flex: 1,
  },
  sheetCaretWrap: {
    marginRight: 28,
    height: 12,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheetComingSoonPill: {
    backgroundColor: "#111827",
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  sheetComingSoonPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 17,
  },
  sheetCartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF0F3",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  sheetCartThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  sheetCartMid: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  sheetCartName: {
    fontSize: 15,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimary,
  },
  sheetViewMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    marginTop: 3,
  },
  sheetMenuLinkText: {
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: FLOAT_CART_GREEN,
  },
  sheetCartActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sheetCartActionsExpanded: {
    backgroundColor: "#FFF1F2",
    borderRadius: 22,
    paddingRight: 4,
    gap: 0,
  },
  sheetViewCartBtn: {
    borderRadius: FLOAT_CART_RADIUS,
    overflow: "hidden",
    minWidth: 102,
  },
  sheetViewCartFill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    backgroundColor: FLOAT_CART_GREEN,
    borderRadius: FLOAT_CART_RADIUS,
  },
  sheetViewCartBtnTitle: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
  },
  sheetViewCartBtnSub: {
    fontSize: 10,
    fontFamily: StoreFonts.loraBold,
    color: "rgba(255,255,255,0.95)",
    marginTop: 1,
  },
  sheetRowClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRemovePanel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
  },
  sheetRemoveText: {
    fontSize: 13,
    fontWeight: "800",
    color: SHEET_BRAND_RED,
  },
  sheetEmpty: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    paddingVertical: 12,
  },
  dockWrap: {
    left: 8,
    right: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  dockContainer: {
    width: "100%",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  dockScroll: {
    alignSelf: "center",
    flexGrow: 0,
    backgroundColor: "transparent",
  },
  dockContentPaged: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dockPage: {
    justifyContent: "flex-start",
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  dockPillFull: {
    width: "100%",
  },
  dockDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingBottom: 2,
    backgroundColor: "transparent",
  },
  dockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dockDotActive: {
    width: 16,
    backgroundColor: GatiMitraColors.emerald,
  },
  dockPillInner: {
    minHeight: 48,
  },
  dockCartTouchable: {
    width: "100%",
  },
  dockCartShell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ECECEC",
  },
  dockCartShellDisabled: {
    opacity: 0.72,
  },
  dockCartIconWrap: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dockCartCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  dockCartTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.2,
  },
  dockCartSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  dockCartSub: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  dockCartCta: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
  },
  dockCartCtaTop: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textTransform: "lowercase",
  },
  dockCartCtaBottom: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 1,
  },
  dockCartCtaMuted: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#F3F4F6",
    minWidth: 56,
    alignItems: "center",
  },
  dockCartCtaMutedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textAlign: "center",
  },
  touchable: {
    width: "100%",
    maxWidth: 400,
  },
  pill: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.95)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  pillCompact: {
    borderRadius: 28,
  },
  livePill: {
    borderRadius: 28,
    overflow: "hidden",
  },
  pillGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 56,
    maxHeight: 64,
  },
  pillGradientCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    maxHeight: 56,
  },
  pillContentCompact: {
    gap: 4,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 28,
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
    justifyContent: "center",
  },
  cartCount: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  cartDivider: {
    fontSize: 12,
    color: "rgba(0,0,0,0.35)",
    fontWeight: "600",
  },
  cartTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  cartFrom: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    maxWidth: 100,
  },
  cartCta: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
    marginLeft: 2,
  },
  liveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  liveCta: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
    marginLeft: 6,
  },
});
