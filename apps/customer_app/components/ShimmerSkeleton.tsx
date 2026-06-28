/**
 * GatiMitra skeleton system: base shimmer-sweep + card/list/menu skeletons.
 * Use for restaurant list, menu items, search results – no blocking text, instant layout.
 */

import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions, type StyleProp, type ViewStyle } from "react-native";
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
  style?: StyleProp<ViewStyle>;
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

import { MERCHANT_GRID_CARD_W } from "@/components/home/MerchantGridCard";

const LOVED_GRID_PAD = 16;
const LOVED_GRID_GAP = 10;

/** 3-column grid skeleton for Loved by Customers. */
export function LovedMerchantsGridSkeleton({ count = 6 }: { count?: number }) {
  const imageSize = MERCHANT_GRID_CARD_W;
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
        <View key={i} style={{ width: MERCHANT_GRID_CARD_W }}>
          <GMSkeleton style={{ width: imageSize, height: imageSize, borderRadius: 12 }} />
          <GMSkeleton style={{ height: 13, width: "88%", marginTop: 6, borderRadius: 6 }} />
          <GMSkeleton style={{ height: 11, width: "60%", marginTop: 4, marginBottom: 6, borderRadius: 6 }} />
        </View>
      ))}
    </View>
  );
}

/** Featured offer banner skeleton (full width home card). */
export function HomeOfferBannerSkeleton({
  width,
  height = 148,
}: {
  width: number;
  height?: number;
}) {
  return <GMSkeleton style={[offerBannerSkeletonStyles.wrap, { width, height, borderRadius: 12 }]} />;
}

const MERCHANT_HEADER_IMAGE_H = 196;
const MERCHANT_MENU_IMAGE_SIZE = 118;
const MERCHANT_FILTER_BAR_H = 52;

const merchantDetailSkeletonStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  bannerWrap: {
    height: MERCHANT_HEADER_IMAGE_H,
    width: "100%",
    position: "relative",
  },
  banner: {
    width: "100%",
    height: MERCHANT_HEADER_IMAGE_H,
    borderRadius: 0,
  },
  bannerLogo: {
    position: "absolute",
    top: 52,
    left: (SCREEN_WIDTH - 44) / 2,
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  headerControls: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerControlsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  searchPill: {
    width: 88,
    height: 34,
    borderRadius: 18,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  infoTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  infoNameBlock: {
    flex: 1,
    gap: 8,
  },
  infoNameLine1: { height: 22, borderRadius: 8, width: "92%" },
  infoNameLine2: { height: 22, borderRadius: 8, width: "68%" },
  ratingPill: { width: 52, height: 28, borderRadius: 8 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  metaIcon: { width: 15, height: 15, borderRadius: 4 },
  metaLine: { flex: 1, height: 14, borderRadius: 6 },
  metaChevron: { width: 14, height: 14, borderRadius: 4 },
  infoDivider: {
    height: 1,
    backgroundColor: "#E8E8E8",
    marginVertical: 10,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offerIcon: { width: 24, height: 24, borderRadius: 12 },
  offerLine: { flex: 1, height: 14, borderRadius: 6 },
  offerCount: { width: 72, height: 14, borderRadius: 6 },
  filterBar: {
    height: MERCHANT_FILTER_BAR_H,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    width: 72,
    height: 34,
    borderRadius: 8,
  },
  filterChipWide: {
    width: 88,
    height: 34,
    borderRadius: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleBlock: { flex: 1, gap: 6 },
  sectionTitle: { height: 18, borderRadius: 6, width: "72%" },
  sectionSub: { height: 12, borderRadius: 6, width: "58%" },
  sectionChevron: { width: 18, height: 18, borderRadius: 4, marginTop: 2 },
});

const storeMenuRowSkeletonStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
    minHeight: 172,
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
    gap: 8,
  },
  titleLine: { height: 16, borderRadius: 6, width: "88%" },
  titleLineShort: { height: 16, borderRadius: 6, width: "62%" },
  statusLine: { height: 12, borderRadius: 6, width: "54%" },
  priceLine: { height: 14, borderRadius: 6, width: "36%" },
  iconRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  iconBtn: { width: 32, height: 32, borderRadius: 16 },
  rightCol: {
    width: MERCHANT_MENU_IMAGE_SIZE,
    alignItems: "center",
  },
  image: {
    width: MERCHANT_MENU_IMAGE_SIZE,
    height: MERCHANT_MENU_IMAGE_SIZE,
    borderRadius: 12,
  },
  addBtn: {
    width: MERCHANT_MENU_IMAGE_SIZE,
    height: 32,
    borderRadius: 8,
    marginTop: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8E8E8",
    marginTop: 16,
  },
});

/** Single store menu row — text left, image + ADD right (matches StoreMenuItemRow). */
export function StoreMenuItemRowSkeleton({ showDivider = true }: { showDivider?: boolean }) {
  return (
    <View style={storeMenuRowSkeletonStyles.wrap}>
      <View style={storeMenuRowSkeletonStyles.row}>
        <View style={storeMenuRowSkeletonStyles.leftCol}>
          <GMSkeleton style={storeMenuRowSkeletonStyles.titleLine} />
          <GMSkeleton style={storeMenuRowSkeletonStyles.titleLineShort} />
          <GMSkeleton style={storeMenuRowSkeletonStyles.statusLine} />
          <GMSkeleton style={storeMenuRowSkeletonStyles.priceLine} />
          <View style={storeMenuRowSkeletonStyles.iconRow}>
            <GMSkeleton style={storeMenuRowSkeletonStyles.iconBtn} />
            <GMSkeleton style={storeMenuRowSkeletonStyles.iconBtn} />
          </View>
        </View>
        <View style={storeMenuRowSkeletonStyles.rightCol}>
          <GMSkeleton style={storeMenuRowSkeletonStyles.image} />
          <GMSkeleton style={storeMenuRowSkeletonStyles.addBtn} />
        </View>
      </View>
      {showDivider ? <View style={storeMenuRowSkeletonStyles.divider} /> : null}
    </View>
  );
}

/** Full merchant inner page skeleton — banner, info card, filters, section header, menu rows. */
export function MerchantDetailSkeleton({ menuRowCount = 5 }: { menuRowCount?: number }) {
  return (
    <View style={merchantDetailSkeletonStyles.screen}>
      <View style={merchantDetailSkeletonStyles.bannerWrap}>
        <GMSkeleton style={merchantDetailSkeletonStyles.banner} />
        <GMSkeleton style={merchantDetailSkeletonStyles.bannerLogo} />
        <View style={merchantDetailSkeletonStyles.headerControls} pointerEvents="none">
          <GMSkeleton style={merchantDetailSkeletonStyles.circleBtn} />
          <View style={merchantDetailSkeletonStyles.headerControlsRight}>
            <GMSkeleton style={merchantDetailSkeletonStyles.searchPill} />
            <GMSkeleton style={merchantDetailSkeletonStyles.circleBtn} />
            <GMSkeleton style={merchantDetailSkeletonStyles.circleBtn} />
          </View>
        </View>
      </View>

      <View style={merchantDetailSkeletonStyles.infoCard}>
        <View style={merchantDetailSkeletonStyles.infoTopRow}>
          <View style={merchantDetailSkeletonStyles.infoNameBlock}>
            <GMSkeleton style={merchantDetailSkeletonStyles.infoNameLine1} />
            <GMSkeleton style={merchantDetailSkeletonStyles.infoNameLine2} />
          </View>
          <GMSkeleton style={merchantDetailSkeletonStyles.ratingPill} />
        </View>
        <View style={merchantDetailSkeletonStyles.metaRow}>
          <GMSkeleton style={merchantDetailSkeletonStyles.metaIcon} />
          <GMSkeleton style={merchantDetailSkeletonStyles.metaLine} />
          <GMSkeleton style={merchantDetailSkeletonStyles.metaChevron} />
        </View>
        <View style={merchantDetailSkeletonStyles.metaRow}>
          <GMSkeleton style={merchantDetailSkeletonStyles.metaIcon} />
          <GMSkeleton style={merchantDetailSkeletonStyles.metaLine} />
          <GMSkeleton style={merchantDetailSkeletonStyles.metaChevron} />
        </View>
        <View style={merchantDetailSkeletonStyles.infoDivider} />
        <View style={merchantDetailSkeletonStyles.offerRow}>
          <GMSkeleton style={merchantDetailSkeletonStyles.offerIcon} />
          <GMSkeleton style={merchantDetailSkeletonStyles.offerLine} />
          <GMSkeleton style={merchantDetailSkeletonStyles.offerCount} />
        </View>
      </View>

      <View style={merchantDetailSkeletonStyles.filterBar}>
        <GMSkeleton style={merchantDetailSkeletonStyles.filterChipWide} />
        <GMSkeleton style={merchantDetailSkeletonStyles.filterChip} />
        <GMSkeleton style={merchantDetailSkeletonStyles.filterChip} />
        <GMSkeleton style={merchantDetailSkeletonStyles.filterChip} />
      </View>

      <View style={merchantDetailSkeletonStyles.sectionHeader}>
        <View style={merchantDetailSkeletonStyles.sectionHeaderRow}>
          <View style={merchantDetailSkeletonStyles.sectionTitleBlock}>
            <GMSkeleton style={merchantDetailSkeletonStyles.sectionTitle} />
            <GMSkeleton style={merchantDetailSkeletonStyles.sectionSub} />
          </View>
          <GMSkeleton style={merchantDetailSkeletonStyles.sectionChevron} />
        </View>
      </View>

      {Array.from({ length: menuRowCount }).map((_, i) => (
        <StoreMenuItemRowSkeleton key={i} showDivider={i < menuRowCount - 1} />
      ))}
    </View>
  );
}

/** @deprecated Prefer StoreMenuItemRowSkeleton — old left-image card layout. */
export function MenuItemRowSkeleton() {
  return <StoreMenuItemRowSkeleton />;
}

/** List of store menu row skeletons. */
export function MenuListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <StoreMenuItemRowSkeleton key={i} showDivider={i < count - 1} />
      ))}
    </>
  );
}

const headerSkeletonStyles = StyleSheet.create({
  wrap: { height: MERCHANT_HEADER_IMAGE_H, width: "100%" },
});

/** Merchant banner only — prefer MerchantDetailSkeleton for the full inner page. */
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
