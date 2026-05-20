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

/** Matches GMRestaurantCardV2 (PAGE_PAD 16, image 220, radius 20). */
const HOME_CARD_PAD = 16;
const HOME_CARD_WIDTH = SCREEN_WIDTH - HOME_CARD_PAD * 2;
const HOME_CARD_IMAGE_H = 220;
const HOME_CARD_RADIUS = 20;
const HOME_CARD_GAP = 18;

const skeletonStyles = StyleSheet.create({
  card: {
    width: HOME_CARD_WIDTH,
    alignSelf: "center",
    marginBottom: HOME_CARD_GAP,
    borderRadius: HOME_CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  heroPlc: {
    width: "100%",
    height: HOME_CARD_IMAGE_H,
    borderTopLeftRadius: HOME_CARD_RADIUS,
    borderTopRightRadius: HOME_CARD_RADIUS,
  },
  content: { padding: 16, gap: 10 },
  line1: { height: 18, borderRadius: 8, width: "72%" },
  line2: { height: 14, borderRadius: 8, width: "48%" },
  line3: { height: 12, borderRadius: 8, width: "36%" },
});

const categoryRailSkeletonStyles = StyleSheet.create({
  scroll: {
    paddingLeft: HOME_CARD_PAD,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  column: {
    flexDirection: "column",
    alignItems: "center",
  },
  label: {
    marginTop: 6,
    borderRadius: 6,
  },
});

const offerBannerSkeletonStyles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    overflow: "hidden",
  },
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

/** Restaurant card skeleton — aligned with GMRestaurantCardV2 dimensions. */
export function RestaurantCardSkeleton({ cardWidth = HOME_CARD_WIDTH }: { cardWidth?: number }) {
  return (
    <View style={[skeletonStyles.card, cardWidth != null ? { width: cardWidth } : null]}>
      <GMSkeleton style={skeletonStyles.heroPlc} />
      <View style={skeletonStyles.content}>
        <GMSkeleton style={skeletonStyles.line1} />
        <GMSkeleton style={skeletonStyles.line2} />
        <GMSkeleton style={skeletonStyles.line3} />
      </View>
    </View>
  );
}

/** List of N restaurant skeletons for "Restaurants near you". */
export function RestaurantListSkeleton({
  count = 4,
  cardWidth,
}: {
  count?: number;
  cardWidth?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <RestaurantCardSkeleton key={i} cardWidth={cardWidth} />
      ))}
    </>
  );
}

/** Category rail placeholder — same column/circle sizes as loaded rail. */
export function CategoryRailSkeleton({
  columnCount = 4,
  itemW,
  columnGap,
  circle,
  rowGap = 10,
}: {
  columnCount?: number;
  itemW: number;
  columnGap: number;
  circle: number;
  rowGap?: number;
}) {
  return (
    <View style={[categoryRailSkeletonStyles.scroll, { gap: columnGap }]}>
      {Array.from({ length: columnCount }).map((_, col) => (
        <View key={col} style={[categoryRailSkeletonStyles.column, { gap: rowGap }]}>
          {[0, 1].map((row) => (
            <View key={row} style={{ alignItems: "center", width: itemW }}>
              <GMSkeleton
                style={{
                  width: circle,
                  height: circle,
                  borderRadius: circle / 2,
                }}
              />
              <GMSkeleton
                style={[
                  categoryRailSkeletonStyles.label,
                  { width: Math.max(40, itemW * 0.75), height: 12 },
                ]}
              />
            </View>
          ))}
        </View>
      ))}
      <View style={{ width: HOME_CARD_PAD }} />
    </View>
  );
}

const LOVED_GRID_PAD = 16;
const LOVED_GRID_GAP = 12;
const LOVED_GRID_COLS = 2;
const LOVED_GRID_CARD_W = Math.floor(
  (SCREEN_WIDTH - LOVED_GRID_PAD * 2 - LOVED_GRID_GAP * (LOVED_GRID_COLS - 1)) / LOVED_GRID_COLS
);

/** 2-column grid skeleton for Loved by Customers. */
export function LovedMerchantsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        paddingHorizontal: LOVED_GRID_PAD,
        gap: LOVED_GRID_GAP,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: LOVED_GRID_CARD_W }}>
          <GMSkeleton style={{ width: "100%", height: 132, borderRadius: 12 }} />
          <GMSkeleton style={{ height: 14, width: "90%", marginTop: 8, borderRadius: 6 }} />
          <GMSkeleton style={{ height: 12, width: "65%", marginTop: 6, marginBottom: 8, borderRadius: 6 }} />
        </View>
      ))}
    </View>
  );
}

/** Featured offer banner skeleton (full width home card). */
export function HomeOfferBannerSkeleton({
  width,
  height = 116,
}: {
  width: number;
  height?: number;
}) {
  return <GMSkeleton style={[offerBannerSkeletonStyles.wrap, { width, height, borderRadius: 20 }]} />;
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
