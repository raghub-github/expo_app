/**
 * GatiMitra skeleton system: base shimmer-sweep + card/list/menu skeletons.
 * Use for restaurant list, menu items, search results – no blocking text, instant layout.
 */

import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SHIMMER_DURATION = 1200;
const SHIMMER_LOW = 0.35;
const SHIMMER_HIGH = 0.7;
const GM_SHIMMER_DURATION_MS = 1300;
const GM_STRIP_WIDTH = 120;

/** Base skeleton box: #eceff1, 12px radius, horizontal shimmer sweep (1.3s). Use for all skeleton blocks. */
export function GMSkeleton({
  style,
  children,
}: {
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const translateX = useSharedValue(-GM_STRIP_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(SCREEN_WIDTH + GM_STRIP_WIDTH, {
        duration: GM_SHIMMER_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.gmSkeletonBase, style]}>
      {children}
      <Animated.View style={[styles.gmSkeletonStrip, animatedStyle]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  gmSkeletonBase: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#eceff1",
    borderRadius: 12,
  },
  gmSkeletonStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: GM_STRIP_WIDTH,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});

/** Single shimmer layer – opacity pulse (kept for compatibility). Prefer GMSkeleton for new UI. */
export function ShimmerView({
  style,
  children,
}: {
  style?: object;
  children?: React.ReactNode;
}) {
  const opacity = useSharedValue(SHIMMER_LOW);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(SHIMMER_HIGH, { duration: SHIMMER_DURATION / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(SHIMMER_LOW, { duration: SHIMMER_DURATION / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const CARD_WIDTH = SCREEN_WIDTH - 24 * 2;
const HERO_ASPECT = 9 / 16;
const HERO_HEIGHT = CARD_WIDTH * HERO_ASPECT;
const CARD_BORDER_RADIUS = 18;

const skeletonStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    alignSelf: "center",
    backgroundColor: "#FFF",
    borderRadius: CARD_BORDER_RADIUS,
    overflow: "hidden",
    marginHorizontal: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  heroPlc: {
    width: "100%",
    height: HERO_HEIGHT,
    borderTopLeftRadius: CARD_BORDER_RADIUS,
    borderTopRightRadius: CARD_BORDER_RADIUS,
  },
  content: { padding: 16 },
  line1: { height: 18, borderRadius: 4, width: "70%", marginBottom: 8 },
  line2: { height: 13, borderRadius: 4, width: "50%", marginBottom: 8 },
  line3: { height: 12, borderRadius: 4, width: "40%" },
});

const rowSkeletonStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#F0F0F0",
    borderRadius: 20,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  imagePlc: { width: 110, height: 110 },
  info: { flex: 1, padding: 16, justifyContent: "center" },
});

/** Restaurant card skeleton – hero + content matching new RestaurantCard layout. */
export function RestaurantCardSkeleton() {
  return (
    <ShimmerView style={skeletonStyles.card}>
      <View style={skeletonStyles.heroPlc} />
      <View style={skeletonStyles.content}>
        <View style={skeletonStyles.line1} />
        <View style={skeletonStyles.line2} />
        <View style={skeletonStyles.line3} />
      </View>
    </ShimmerView>
  );
}

/** List of N restaurant skeletons for "Restaurants near you". */
export function RestaurantListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <RestaurantCardSkeleton key={i} />
      ))}
    </>
  );
}

const menuSkeletonStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 18,
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  imagePlc: { width: 96, height: 96, borderRadius: 14 },
  body: { flex: 1, marginLeft: 14, justifyContent: "center" },
  lineA: { height: 14, borderRadius: 4, width: "80%", marginBottom: 8 },
  lineB: { height: 12, borderRadius: 4, width: "60%", marginBottom: 8 },
  lineC: { height: 12, borderRadius: 4, width: "35%" },
});

/** Single menu item row skeleton. */
export function MenuItemRowSkeleton() {
  return (
    <View style={menuSkeletonStyles.card}>
      <GMSkeleton style={menuSkeletonStyles.imagePlc} />
      <View style={menuSkeletonStyles.body}>
        <GMSkeleton style={menuSkeletonStyles.lineA} />
        <GMSkeleton style={menuSkeletonStyles.lineB} />
        <GMSkeleton style={menuSkeletonStyles.lineC} />
      </View>
    </View>
  );
}

/** List of menu item skeletons. */
export function MenuListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MenuItemRowSkeleton key={i} />
      ))}
    </>
  );
}

const headerSkeletonStyles = StyleSheet.create({
  wrap: { height: 220, width: "100%" },
});

/** Merchant header / banner skeleton. */
export function MerchantHeaderSkeleton() {
  return <GMSkeleton style={headerSkeletonStyles.wrap} />;
}

/** Search result card skeleton (grid or list). */
export function SearchResultSkeleton({ type = "card" }: { type?: "card" | "row" }) {
  if (type === "row") {
    return (
      <View style={rowSkeletonStyles.card}>
        <GMSkeleton style={rowSkeletonStyles.imagePlc} />
        <View style={rowSkeletonStyles.info}>
          <GMSkeleton style={skeletonStyles.line1} />
          <GMSkeleton style={skeletonStyles.line2} />
        </View>
      </View>
    );
  }
  const cardWidth = (SCREEN_WIDTH - 16 * 2 - 8 * 2) / 3;
  return (
    <View style={{ width: cardWidth, marginBottom: 8 }}>
      <GMSkeleton style={{ width: cardWidth, height: cardWidth * 0.72, borderRadius: 12 }} />
      <GMSkeleton style={{ height: 12, width: "80%", marginTop: 8 }} />
    </View>
  );
}

export function SearchResultsSkeleton({ count = 6, type = "card" }: { count?: number; type?: "card" | "row" }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SearchResultSkeleton key={i} type={type} />
      ))}
    </>
  );
}
