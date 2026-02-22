/**
 * Food-only floating cart. Scope = FOOD_SERVICE_ONLY.
 * Visible ONLY on: /home, /home/merchant/*, /home/category/*, /search.
 * Hidden on: Ride, Parcel, E-com, Wallet, Profile, (tabs) root — no delay, removed from tree.
 * Compact bar: 56–64px height, 28px radius, single-line summary. Auto-hides when cart empty.
 */

import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
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
import { GatiMitraColors } from "@/constants/gatimitra";

const CHECKOUT_PATH = "/checkout";

/** True when current route is restaurant detail (any merchant id). */
function useIsOnRestaurantDetailsPage(): boolean {
  const pathname = usePathname();
  return typeof pathname === "string" && pathname.startsWith("/home/merchant/");
}

/** Cart scope = FOOD only. Show on: /home, /home/merchant/*, /home/category/*, /search. Never on: Ride, Parcel, E-com, Profile, Wallet, (tabs) root. */
function useIsFoodServicePage(): boolean {
  const pathname = usePathname();
  const segments = useSegments();
  if (typeof pathname !== "string") return false;
  const p = pathname as string;
  if (segments[0] === "(auth)" || segments[0] === "(onboarding)") return false;
  if (p.startsWith("/checkout") || p.startsWith("/profile") || p === "/wallet" || p.startsWith("/(tabs)/orders")) return false;
  if (p === "/home" || p.startsWith("/home/merchant") || p.startsWith("/home/category")) return true;
  if (p.startsWith("/home/service") || p.startsWith("/home/shop")) return false;
  if (p === "/search") return true;
  if (p === "/" || p.startsWith("/(tabs)")) return false;
  return false;
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
  const isInsideCartRestaurant = useIsInsideCartRestaurant();
  const isOnRestaurantDetails = useIsOnRestaurantDetailsPage();
  const merchantScrollY = useMerchantScrollStore((s) => s.scrollY);
  const isCartCompact = isInsideCartRestaurant && merchantScrollY > 80;

  const items = useCartStore((s) => s.items);
  const merchantId = useCartStore((s) => s.merchantId);
  const merchantName = useCartStore((s) => s.merchantName);
  const activeOrder = useOrderStore((s) => s.activeOrder);

  const totalCount = items.reduce((n, i) => n + i.quantity, 0);
  const cartTotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const hasCart = totalCount > 0;
  const hasActiveOrder =
    activeOrder != null &&
    activeOrder.status !== "DELIVERED" &&
    activeOrder.status !== "CANCELLED";

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
    const destinationCheckout = CHECKOUT_PATH;

    if (currentPath === destinationCheckout || currentPath.startsWith("/checkout")) {
      return;
    }

    if (isOnRestaurantDetails || isInsideCartRestaurant) {
      router.push(CHECKOUT_PATH as any);
      return;
    }

    if (merchantId) {
      router.push({
        pathname: "/home/merchant/[id]",
        params: { id: merchantId, openCart: "1" },
      });
    } else {
      router.push(CHECKOUT_PATH as any);
    }
  };

  // Cart scope = FOOD_SERVICE_ONLY. Hide on Ride, Parcel, E-com, Profile, etc. No fade delay.
  const visible = isFoodServicePage && (hasCart || hasActiveOrder);
  if (!visible) return null;

  // Bottom offset: when in tabs sit above tab bar; else above safe area only (e.g. merchant, search)
  const inTabs = segments[0] === "(tabs)";
  const TAB_BAR_HEIGHT = 56;
  const GAP_ABOVE_NAV = 14;
  const bottomOffset = inTabs
    ? insets.bottom + TAB_BAR_HEIGHT + GAP_ABOVE_NAV
    : insets.bottom + GAP_ABOVE_NAV;

  const slideUpEntering = SlideInUp.duration(250).easing(Easing.out(Easing.ease));

  if (hasActiveOrder) {
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
                  Order arriving in {activeOrder.etaMinutes} mins
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
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleCartPress}
        style={styles.touchable}
      >
        <View style={[styles.pill, compact && styles.pillCompact]}>
          <LinearGradient
            colors={
              GatiMitraColors.mintGradient as unknown as [string, string]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.pillGradient, compact && styles.pillGradientCompact]}
          >
            <View style={styles.glassOverlay} />
            <View style={[styles.pillContent, compact && styles.pillContentCompact]}>
              <Ionicons
                name="cart"
                size={compact ? 16 : 18}
                color={GatiMitraColors.emerald}
              />
              <Text style={styles.cartCount}>{totalCount} Items</Text>
              <Text style={styles.cartDivider}>|</Text>
              <Text style={styles.cartTotal}>₹{Math.round(cartTotal)}</Text>
              {showStoreName && (
                <>
                  <Text style={styles.cartDivider}>|</Text>
                  <Text
                    style={styles.cartFrom}
                    numberOfLines={1}
                  >{merchantName}</Text>
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

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
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
