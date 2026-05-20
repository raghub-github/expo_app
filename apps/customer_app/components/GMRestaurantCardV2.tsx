/**
 * 2025 Premium Discovery Card – edge-to-edge image (220px), bookmark, offer badge,
 * gradient overlay, rating capsule, cuisine • distance • time. Micro-interactions: scale 0.97 on tap.
 * Data: merchant_stores (banner_url / logo_url), real distance, rating from API only.
 */

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import { NearFastDeliveryMeta } from "@/components/NearFastDeliveryMeta";
import {
  buildStoreOpenStatusLabel,
  formatOpenStatusTagText,
} from "@/lib/storeOpenStatusLabel";
import { toTimestamp } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";

const { width } = Dimensions.get("window");
const PAGE_PAD = 16;
const CARD_WIDTH = width - PAGE_PAD * 2;
const IMAGE_HEIGHT = 220;
const CARD_RADIUS = 20;
const CARD_GAP = 18;

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K+`;
  return `${n}+`;
}

function isFreeDeliveryOfferText(text: string | null | undefined): boolean {
  if (!text?.trim()) return true;
  const t = text.trim().toLowerCase();
  return /\bfree\s*delivery\b/.test(t) || /\bfree\s*del\b/.test(t);
}

export type GMRestaurantCardV2Props = {
  merchant: MerchantSummary;
  initialSaved?: boolean;
};

function StoreOpenStatusBadge({
  isOpen,
  nextOpenAt,
  nextCloseAt,
}: {
  isOpen: boolean;
  nextOpenAt?: string | number | null;
  nextCloseAt?: string | number | null;
}) {
  const needsTick = toTimestamp(nextOpenAt) != null || toTimestamp(nextCloseAt) != null;
  const now = useScheduleTick(needsTick);
  const openStatus = buildStoreOpenStatusLabel({
    isOpen,
    nextOpenAt,
    nextCloseAt,
    nowMs: now,
  });

  const isOpenSoon = !isOpen && openStatus.label === "Open soon";
  const isClosingSoon = isOpen && openStatus.isClosingSoon;

  return (
    <View
      style={[
        styles.openClosedTag,
        isClosingSoon
          ? styles.openClosedTagRed
          : isOpenSoon
            ? styles.openClosedTagOpenSoon
            : openStatus.isGreen
              ? styles.openClosedTagGreen
              : styles.openClosedTagRed,
      ]}
    >
      <Text
        style={[
          styles.openClosedTagText,
          (isClosingSoon || !openStatus.isGreen) && styles.openClosedTagTextRed,
        ]}
        numberOfLines={2}
      >
        {formatOpenStatusTagText(openStatus)}
      </Text>
    </View>
  );
}

function GMRestaurantCardV2Inner({ merchant, initialSaved = false }: GMRestaurantCardV2Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [savedLoading, setSavedLoading] = useState(false);
  const scale = useSharedValue(1);
  const enterOpacity = useSharedValue(0);
  const enterTranslateY = useSharedValue(12);
  const didPlayEnter = useRef(false);

  const liveStatusFromStore = useStoreStatusStore((s) => s.getStatus(merchant.id));
  const rawApi = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  const apiStatus: "OPEN" | "CLOSED" | null =
    rawApi === "OPEN" ? "OPEN" : rawApi === "CLOSED" ? "CLOSED" : null;
  const liveStatus = liveStatusFromStore ?? apiStatus ?? "CLOSED";
  const isOpen = liveStatus === "OPEN";
  useEffect(() => {
    if (apiStatus) {
      useStoreStatusStore.getState().setStatusFromApi(merchant.id, apiStatus === "OPEN", apiStatus);
    }
  }, [merchant.id, apiStatus]);

  const bannerUri = useMemo(
    () => toAbsoluteImageUrl(merchant.banner_url ?? merchant.displayImage ?? null),
    [merchant.banner_url, merchant.displayImage]
  );

  const galleryUris = useMemo(() => merchant.galleryImages ?? [], [merchant.galleryImages]);

  useEffect(() => {
    if (didPlayEnter.current) return;
    didPlayEnter.current = true;
    enterOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    enterTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
  }, [enterOpacity, enterTranslateY]);

  const toggleBookmark = useCallback(
    async (e: any) => {
      e?.stopPropagation?.();
      if (savedLoading) return;
      setSavedLoading(true);
      try {
        const res = await setStoreBookmark(merchant.id, !saved);
        setSaved(res.saved);
      } catch {
        // keep state
      } finally {
        setSavedLoading(false);
      }
    },
    [merchant.id, saved, savedLoading]
  );

  const openMerchant = useCallback(() => {
    router.push({ pathname: "/home/merchant/[id]", params: { id: merchant.id } });
  }, [merchant.id, router]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [
      { translateY: enterTranslateY.value },
      { scale: scale.value },
    ],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const hasRating = merchant.avgRating != null && merchant.avgRating >= 0;
  const ratingValue = hasRating ? Number(merchant.avgRating).toFixed(1) : null;
  const reviewLabel =
    merchant.totalReviews != null && merchant.totalReviews > 0
      ? `By ${formatReviewCount(merchant.totalReviews)}`
      : null;
  const rawOffer = merchant.offerText?.trim() || null;
  const primaryOffer =
    rawOffer && !isFreeDeliveryOfferText(rawOffer) ? rawOffer : null;

  return (
    <AnimatedTouchable
      onPress={openMerchant}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      style={[styles.card, animatedCardStyle]}
    >
      {/* Edge-to-edge image with gradient overlay */}
      <View style={styles.imageWrap}>
        <StoreBannerCarousel
          bannerUri={bannerUri}
          galleryUris={galleryUris}
          width={CARD_WIDTH}
          height={IMAGE_HEIGHT}
          borderRadius={CARD_RADIUS}
          initialBannerHoldMs={3000}
          slideIntervalMs={5000}
          slideDurationMs={700}
          dimmed={!isOpen}
          showDots
          hidePlaceholderIcon
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.5)", "transparent", "transparent"]}
          style={styles.gradientOverlay}
        />
        {!isOpen ? <View style={styles.closedOverlay} pointerEvents="none" /> : null}
        {/* Bookmark floating */}
        <TouchableOpacity
          onPress={toggleBookmark}
          style={styles.bookmarkBtn}
          hitSlop={12}
          disabled={savedLoading}
        >
          {savedLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={24}
              color={saved ? GatiMitraColors.primaryMint : "#fff"}
            />
          )}
        </TouchableOpacity>
        {/* Cuisine tag bottom-left */}
        {merchant.cuisines && merchant.cuisines.length > 0 && (
          <View style={styles.cuisineTag}>
            <Text style={styles.cuisineTagText} numberOfLines={1}>
              {merchant.cuisines[0]}
            </Text>
          </View>
        )}
        <StoreOpenStatusBadge
          isOpen={isOpen}
          nextOpenAt={merchant.nextOpenAt}
          nextCloseAt={merchant.nextCloseAt}
        />
      </View>

      {/* Restaurant info */}
      <View style={[styles.content, !isOpen && styles.contentClosed]}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {merchant.name}
          </Text>
          <View style={styles.ratingCol}>
            <View style={[styles.ratingCapsule, !hasRating && styles.ratingCapsuleNew]}>
              {hasRating ? <Ionicons name="star" size={11} color="#fff" /> : null}
              <Text style={styles.ratingText}>{ratingValue ?? "New"}</Text>
            </View>
            {reviewLabel ? <Text style={styles.ratingBy}>{reviewLabel}</Text> : null}
          </View>
        </View>
        <NearFastDeliveryMeta
          deliveryTime={merchant.deliveryTime}
          distanceKm={merchant.distanceKm}
          compact
        />
        {primaryOffer ? (
          <View style={styles.offerRow}>
            <View style={styles.offerPctCircle}>
              <Text style={styles.offerPctSymbol}>%</Text>
            </View>
            <Text style={styles.offerRowText} numberOfLines={2}>
              {primaryOffer}
            </Text>
          </View>
        ) : null}
      </View>
    </AnimatedTouchable>
  );
}

export const GMRestaurantCardV2 = React.memo(GMRestaurantCardV2Inner, (prev, next) => {
  const a = prev.merchant;
  const b = next.merchant;
  return (
    prev.initialSaved === next.initialSaved &&
    a.id === b.id &&
    a.name === b.name &&
    a.liveStatus === b.liveStatus &&
    a.nextOpenAt === b.nextOpenAt &&
    a.nextCloseAt === b.nextCloseAt &&
    a.displayImage === b.displayImage &&
    a.banner_url === b.banner_url &&
    a.offerText === b.offerText &&
    a.avgRating === b.avgRating &&
    a.deliveryTime === b.deliveryTime &&
    a.distanceKm === b.distanceKm
  );
});

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    alignSelf: "center",
    marginBottom: CARD_GAP,
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraColors.restaurantCardShadow,
    ...(Platform.OS === "ios" ? {} : { elevation: 6 }),
  },
  imageWrap: {
    width: "100%",
    height: IMAGE_HEIGHT,
    position: "relative" as const,
    overflow: "hidden",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  image: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  imageOpaque: {
    opacity: 0.9,
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  bookmarkBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  cuisineTag: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "50%",
  },
  cuisineTagText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  openClosedTag: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "75%",
  },
  openClosedTagGreen: {
    backgroundColor: "#16A34A",
  },
  /** Store still closed — softer green until countdown ends. */
  openClosedTagOpenSoon: {
    backgroundColor: "rgba(22, 163, 74, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  openClosedTagRed: {
    backgroundColor: "#FF4D4F",
    borderRadius: 12,
  },
  openClosedTagTextRed: {
    fontWeight: "600",
  },
  contentClosed: {
    opacity: 0.78,
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  imageClosed: {
    opacity: 0.82,
  },
  openClosedTagText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  ratingCol: {
    alignItems: "flex-end",
    gap: 2,
  },
  ratingCapsule: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#24963f",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    minWidth: 46,
    justifyContent: "center",
  },
  ratingBy: {
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
    fontWeight: "500",
    marginTop: 1,
  },
  ratingCapsuleNew: {
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  ratingText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  offerPctCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  offerPctSymbol: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 15,
  },
  offerRowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#4b5563",
    lineHeight: 18,
  },
});
