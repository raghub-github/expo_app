/**
 * Food floating cart + multi-order tracking dock.
 * Visible on: /home, /home/merchant/*, /search, and on /orders when there are active orders.
 * When multiple active orders or cart + order: horizontal scrollable dock [Track #1] [Track #2] [Cart].
 */

import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { useRouter, useSegments, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  SlideInUp,
  Easing,
} from "react-native-reanimated";
import { useCartStore } from "@/store/cartStore";
import { useOrderStore } from "@/store/orderStore";
import { useMerchantScrollStore } from "@/store/merchantScrollStore";
import type { ActiveOrder } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";

const CHECKOUT_PATH = "/checkout";

/** True when current route is restaurant detail (any merchant id). */
function useIsOnRestaurantDetailsPage(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/home/merchant/");
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

/** True when current route is restaurant detail and it's the same as cart merchant */
function useIsInsideCartRestaurant(): boolean {
  const segments = useSegments();
  const cartMerchantId = useCartStore((s) => s.merchantId);
  const isMerchantPage = segments[0] === "home" && segments[1] === "merchant";
  const currentMerchantId = isMerchantPage ? (segments[2] as string) : null;
  return isMerchantPage && !!cartMerchantId && currentMerchantId === cartMerchantId;
}

export function GlobalFloatingCart() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const isFoodServicePage = useIsFoodServicePage();
  const isOnOrdersArea = useIsOnOrdersArea();
  const isInsideCartRestaurant = useIsInsideCartRestaurant();
  const isOnRestaurantDetails = useIsOnRestaurantDetailsPage();
  const merchantScrollY = useMerchantScrollStore((s) => s.scrollY);
  const isCartCompact = isInsideCartRestaurant && merchantScrollY > 80;

  const items = useCartStore((s) => s.items);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const activeOrdersRaw = useOrderStore((s) => s.activeOrders);
  const activeOrderFallback = useOrderStore((s) => s.activeOrder);
  const activeOrders = activeOrdersRaw.filter(
    (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED"
  );
  const activeOrder = activeOrders[0] ?? (activeOrderFallback?.status !== "DELIVERED" && activeOrderFallback?.status !== "CANCELLED" ? activeOrderFallback : null);

  const totalCount = items.reduce((n, i) => n + i.quantity, 0);
  const cartTotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const hasCart = totalCount > 0;
  const hasActiveOrder = activeOrders.length > 0;
  const showDock = hasActiveOrder && (activeOrders.length > 1 || hasCart);

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (hasActiveOrder) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(1);
    }
    return () => {
      pulse.value = 1;
    };
  }, [hasActiveOrder, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const handleCartPress = () => {
    const currentPath = typeof pathname === "string" ? pathname : "";
    if (currentPath.startsWith("/checkout")) return;
    if (isOnRestaurantDetails || isInsideCartRestaurant) {
      router.push(CHECKOUT_PATH as any);
      return;
    }
    if (merchantId) {
      router.push({ pathname: "/home/merchant/[id]", params: { id: merchantId, openCart: "1" } });
    } else {
      router.push(CHECKOUT_PATH as any);
    }
  };

  const visible = (isFoodServicePage || isOnOrdersArea) && (hasCart || hasActiveOrder);
  if (!visible) return null;

  const inTabs = segments[0] === "(tabs)";
  const TAB_BAR_HEIGHT = 56;
  const GAP_ABOVE_NAV = 14;
  const bottomOffset = inTabs
    ? insets.bottom + TAB_BAR_HEIGHT + GAP_ABOVE_NAV
    : insets.bottom + GAP_ABOVE_NAV;

  const slideUpEntering = SlideInUp.duration(250).easing(Easing.out(Easing.ease));

  if (showDock) {
    return (
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, styles.dockWrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dockContent}
          snapToInterval={160}
          snapToAlignment="center"
          decelerationRate="fast"
        >
          {activeOrders.map((ord, idx) => (
            <TrackOrderPill key={ord.orderId} order={ord} index={idx + 1} onPress={() => router.push(`/orders/${ord.orderId}` as const)} pulseStyle={pulseStyle} />
          ))}
          {hasCart && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleCartPress} style={styles.dockPill}>
              <View style={[styles.pill, styles.dockPillInner]}>
                <LinearGradient
                  colors={GatiMitraColors.mintGradient as unknown as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.pillGradient}
                >
                  <View style={styles.glassOverlay} />
                  <View style={styles.pillContent}>
                    <Ionicons name="cart" size={18} color={GatiMitraColors.emerald} />
                    <Text style={styles.cartCount}>{totalCount}</Text>
                    <Text style={styles.cartCta}>Cart →</Text>
                  </View>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
      </Animated.View>
    );
  }

  if (hasActiveOrder && activeOrder) {
    return (
      <Animated.View
        entering={slideUpEntering}
        style={[styles.wrap, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push(`/orders/${activeOrder.orderId}` as const)}
          style={styles.touchable}
        >
          <Animated.View style={[styles.pill, styles.livePill, pulseStyle]}>
            <LinearGradient
              colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.pillGradient}
            >
              <View style={styles.pillContent}>
                <Ionicons name="bicycle" size={22} color="#fff" />
                <Text style={styles.liveText} numberOfLines={1}>
                  Track Order · Arriving in {activeOrder.etaMinutes} mins
                </Text>
                <Text style={styles.liveCta}>Track Live →</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const showStoreName = !isInsideCartRestaurant && !!merchantName;
  const compact = isCartCompact;

  return (
    <Animated.View
      entering={slideUpEntering}
      style={[styles.wrap, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity activeOpacity={0.9} onPress={handleCartPress} style={styles.touchable}>
        <View style={[styles.pill, compact && styles.pillCompact]}>
          <LinearGradient
            colors={GatiMitraColors.mintGradient as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.pillGradient, compact && styles.pillGradientCompact]}
          >
            <View style={styles.glassOverlay} />
            <View style={[styles.pillContent, compact && styles.pillContentCompact]}>
              <Ionicons name="cart" size={compact ? 16 : 18} color={GatiMitraColors.emerald} />
              <Text style={styles.cartCount}>{totalCount} Items</Text>
              <Text style={styles.cartDivider}>|</Text>
              <Text style={styles.cartTotal}>₹{Math.round(cartTotal)}</Text>
              {showStoreName && (
                <>
                  <Text style={styles.cartDivider}>|</Text>
                  <Text style={styles.cartFrom} numberOfLines={1}>{merchantName}</Text>
                </>
              )}
              <Text style={styles.cartCta}>View Cart →</Text>
            </View>
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TrackOrderPill({
  order,
  index,
  onPress,
  pulseStyle,
}: {
  order: ActiveOrder;
  index: number;
  onPress: () => void;
  pulseStyle: { transform: { scale: number }[] };
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.dockPill}>
      <Animated.View style={[styles.pill, styles.livePill, styles.dockPillInner, pulseStyle]}>
        <LinearGradient
          colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.pillGradient}
        >
          <View style={styles.pillContent}>
            <Ionicons name="bicycle" size={20} color="#fff" />
            <Text style={styles.liveText} numberOfLines={1}>
              #{order.orderId.slice(-6)} · {order.etaMinutes}m
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
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
  dockWrap: {
    left: 8,
    right: 8,
    alignItems: "stretch",
  },
  dockContent: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 8,
  },
  dockPill: {
    minWidth: 152,
    maxWidth: 152,
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
