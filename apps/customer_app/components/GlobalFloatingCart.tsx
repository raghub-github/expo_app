/**
 * Food floating cart + multi-order tracking dock.
 * Visible on: /home, /home/merchant/*, /search, and on /orders when there are active orders.
 * Hidden on /orders/[id] (order detail already shows map + tracking).
 * When cart + active order(s): paged horizontal dock — swipe to switch (one pill visible at a time).
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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  SlideInUp,
  Easing,
} from "react-native-reanimated";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import type { ActiveOrder } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { merchantService } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";
import { closedStoreCtaCopy, getOpenSoonState } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";
import { FloatingOrderTrackingPill } from "@/components/orders/FloatingOrderTrackingPill";
import { usePartnerChatUnread } from "@/hooks/usePartnerChatUnread";
import { prefetchSubscriptionPlans } from "@/lib/subscriptionCache";
import { useAuthStore } from "@/store/authStore";

const CHECKOUT_PATH = "/checkout";

/** Shown instead of multi-cart checkout until the feature exists. */
const CHECKOUT_ALL_COMING_SOON = "Checkout all functionality coming soon";

/** Bottom sheet primary accent (GatiMitra-style; brand red token). */
const SHEET_BRAND_RED = GatiMitraColors.closedRed;

/** Show on main tab screens (Home, Food, Orders, Profile). */
function useIsOnMainTabs(): boolean {
  const segments = useSegments();
  return segments[0] === "(tabs)";
}

/** Show on: /home, /home/merchant/*, /home/category/*, /search. */
function useIsFoodServicePage(): boolean {
  const pathname = usePathname();
  const segments = useSegments();
  if (typeof pathname !== "string") return false;
  const p = pathname as string;
  if (segments[0] === "(auth)" || segments[0] === "(onboarding)") return false;
  if (p.startsWith("/checkout") || p.startsWith("/profile") || p === "/wallet") return false;
  if (p === "/home" || p.startsWith("/home/merchant") || p.startsWith("/home/category")) return true;
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

/** Hide floating track pill on any /orders/[slug] screen (detail, help, chat, payment, etc.). */
function useHideFloatingOrderTrackingPill(): boolean {
  const segments = useSegments();
  return segments[0] === "orders" && segments.length === 2 && String(segments[1] ?? "").length > 0;
}

/** True when current route is restaurant detail and it's the same as cart merchant */
function useIsInsideCartRestaurant(): boolean {
  const segments = useSegments();
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const segments = useSegments();
  const isFoodServicePage = useIsFoodServicePage();
  const isOnMainTabs = useIsOnMainTabs();
  const isOnOrdersArea = useIsOnOrdersArea();
  const hideFloatingOrderTrackingPill = useHideFloatingOrderTrackingPill();
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
    } else if (m.isOpen != null) {
      useStoreStatusStore.getState().setStatusFromApi(merchantId, m.isOpen);
    }
  }, [cartMerchantQuery.data, merchantId]);

  const isCartStoreClosed = useMemo(() => {
    if (!merchantId || !hasCart) return false;
    if (liveStatusFromStore === "CLOSED") return true;
    if (liveStatusFromStore === "OPEN") return false;
    const m = cartMerchantQuery.data;
    if (m?.liveStatus === "CLOSED") return true;
    if (m?.liveStatus === "OPEN") return false;
    if (m?.isOpen === false) return true;
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
  /** Cart + tracking (or multiple orders): one pill per page, swipe to switch. */
  const showScrollDock =
    showActiveOrderTracking && (hasCart || trackingOrders.length > 1);
  const { width: windowWidth } = useWindowDimensions();
  const dockSideInset = 16;
  const dockPageWidth = Math.max(280, windowWidth - dockSideInset);
  const dockPageCount = trackingOrders.length + (hasCart ? 1 : 0);
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

  const handleCartPress = () => {
    if (isCartStoreClosed) return;
    const currentPath = typeof pathname === "string" ? pathname : "";
    if (currentPath.startsWith("/checkout")) return;
    void prefetchSubscriptionPlans(queryClient);
    router.push(CHECKOUT_PATH as any);
  };

  /** Store inner page (merchant menu). */
  const handleViewMenuPress = () => {
    if (!merchantId) return;
    router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId } });
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
    (hasCart && (isFoodServicePage || isOnOrdersArea)) ||
    (showActiveOrderTracking && (isFoodServicePage || isOnOrdersArea || isOnMainTabs));
  if (!visible) return null;

  const inTabs = segments[0] === "(tabs)";
  /** Matches compact CustomerTabBar (~52px content + wrapper padding). */
  const TAB_BAR_HEIGHT = 58;
  const GAP_ABOVE_NAV = 14;
  const bottomOffset = inTabs
    ? insets.bottom + TAB_BAR_HEIGHT + GAP_ABOVE_NAV
    : insets.bottom + GAP_ABOVE_NAV;

  const slideUpEntering = SlideInUp.duration(250).easing(Easing.out(Easing.ease));

  const onDockScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / dockPageWidth);
    if (idx !== dockPageIndex && idx >= 0 && idx < dockPageCount) {
      setDockPageIndex(idx);
    }
  };

  if (showScrollDock) {
    return (
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, styles.dockWrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
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
          {hasCart ? (
            <View style={[styles.dockPage, { width: dockPageWidth }]}>
              <TouchableOpacity
                activeOpacity={isCartStoreClosed ? 1 : 0.9}
                onPress={handleCartPress}
                disabled={isCartStoreClosed}
                style={[styles.dockPillFull, isCartStoreClosed && styles.dockPillClosed]}
              >
                <View style={[styles.pill, styles.dockPillInner]}>
                  <LinearGradient
                    colors={
                      isCartStoreClosed
                        ? (["#9CA3AF", "#6B7280"] as [string, string])
                        : (GatiMitraColors.mintGradient as unknown as [string, string])
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.pillGradient}
                  >
                    <View style={styles.glassOverlay} />
                    <View style={styles.pillContent}>
                      <Ionicons name="cart" size={18} color={isCartStoreClosed ? "#fff" : GatiMitraColors.emerald} />
                      <Text style={styles.cartCount}>{totalCount}</Text>
                      <Text style={styles.cartCta}>
                        {isCartStoreClosed ? (cartOpenSoon ? cartClosedCta.sub : "Closed") : "Cart →"}
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              </TouchableOpacity>
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
      </Animated.View>
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

  const compact = isCartCompact;

  const itemLabel = totalCount === 1 ? "1 item" : `${totalCount} items`;

  return (
    <>
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
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
              <Text style={styles.allCartsTabText}>All carts</Text>
              <Ionicons name="caret-up" size={12} color={GatiMitraColors.emerald} />
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
                <Text style={[styles.gmStoreName, compact && styles.gmStoreNameCompact]} numberOfLines={1}>
                  {merchantName ?? "Restaurant"}
                </Text>
                <View style={styles.gmViewMenuRow}>
                  <Text style={styles.gmViewMenuText}>View Menu</Text>
                  <Ionicons name="chevron-forward" size={14} color={GatiMitraColors.emerald} />
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
              <LinearGradient
                colors={
                  isCartStoreClosed
                    ? cartOpenSoon
                      ? (GatiMitraColors.mintGradient as unknown as [string, string])
                      : (["#9CA3AF", "#6B7280"] as [string, string])
                    : (GatiMitraColors.checkoutGradient as unknown as [string, string])
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gmViewCartGradient}
              >
                <Text style={[styles.gmViewCartTitle, compact && styles.gmViewCartTitleCompact]}>
                  {isCartStoreClosed ? cartClosedCta.title : "View Cart"}
                </Text>
                <Text style={[styles.gmViewCartSub, compact && styles.gmViewCartSubCompact]}>
                  {isCartStoreClosed ? cartClosedCta.sub : itemLabel}
                </Text>
              </LinearGradient>
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
                  <Text style={[styles.gmRemoveText, compact && styles.gmRemoveTextCompact]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
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
  const insets = useSafeAreaInsets();
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
                    <Text style={styles.sheetCartName} numberOfLines={1}>
                      {merchantName ?? "Restaurant"}
                    </Text>
                    <Pressable style={styles.sheetViewMenuRow} onPress={onViewMenu} hitSlop={6}>
                      <Text style={styles.sheetMenuLinkText}>View Menu</Text>
                      <Ionicons name="chevron-forward" size={14} color={SHEET_BRAND_RED} />
                    </Pressable>
                  </View>
                    <View style={[styles.sheetCartActions, rowRemoveExpanded && styles.sheetCartActionsExpanded]}>
                      <TouchableOpacity
                        activeOpacity={isStoreClosed ? 1 : 0.92}
                        onPress={onViewCart}
                        disabled={isStoreClosed}
                        style={[styles.sheetViewCartBtn, isStoreClosed && styles.gmViewCartCtaClosed]}
                      >
                        <LinearGradient
                          colors={
                            isStoreClosed
                              ? cartOpenSoon
                                ? (GatiMitraColors.mintGradient as unknown as [string, string])
                                : (["#9CA3AF", "#6B7280"] as [string, string])
                              : (GatiMitraColors.checkoutGradient as unknown as [string, string])
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.sheetViewCartGradient}
                        >
                          <Text style={styles.sheetViewCartBtnTitle}>
                            {isStoreClosed ? closedCta.title : "View Cart"}
                          </Text>
                          <Text style={styles.sheetViewCartBtnSub}>
                            {isStoreClosed ? closedCta.sub : itemLabel}
                          </Text>
                        </LinearGradient>
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
    justifyContent: "center",
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
    fontWeight: "700",
    color: GatiMitraColors.emerald,
    letterSpacing: 0.2,
  },
  gmBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 36,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 8,
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  gmBarCompact: {
    borderRadius: 32,
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
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  gmStoreNameCompact: {
    fontSize: 13,
  },
  gmViewMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  gmViewMenuText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  gmViewCartCta: {
    borderRadius: 26,
    overflow: "hidden",
    minWidth: 108,
  },
  gmViewCartCtaCompact: {
    minWidth: 96,
    borderRadius: 22,
  },
  gmViewCartCtaClosed: {
    opacity: 0.58,
  },
  dockPillClosed: {
    opacity: 0.58,
  },
  gmViewCartGradient: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  gmViewCartTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  gmViewCartTitleCompact: {
    fontSize: 13,
  },
  gmViewCartSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    marginTop: 1,
  },
  gmViewCartSubCompact: {
    fontSize: 10,
  },
  gmCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F3F4F6",
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
    fontWeight: "800",
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
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  sheetViewMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 3,
  },
  sheetMenuLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: SHEET_BRAND_RED,
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
    borderRadius: 999,
    overflow: "hidden",
    minWidth: 102,
  },
  sheetViewCartGradient: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  sheetViewCartBtnTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  sheetViewCartBtnSub: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
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
  },
  dockScroll: {
    alignSelf: "center",
  },
  dockContentPaged: {
    flexDirection: "row",
    alignItems: "center",
  },
  dockPage: {
    justifyContent: "center",
    paddingHorizontal: 4,
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
