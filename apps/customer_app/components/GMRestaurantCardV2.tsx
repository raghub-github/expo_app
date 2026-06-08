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
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { useStoreBookmarkMutations } from "@/hooks/useStoreBookmarks";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { StoreBannerCarousel, LIST_CARD_CAROUSEL_HOLD_MS, LIST_CARD_CAROUSEL_SLIDE_MS } from "@/components/StoreBannerCarousel";
import { NearFastDeliveryMeta } from "@/components/NearFastDeliveryMeta";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { MerchantOfferRow } from "@/components/home/MerchantOfferRow";
import {
  resolveMerchantCarouselBannerUri,
  resolveMerchantCarouselGalleryUris,
} from "@/lib/merchantBanner";
import { formatMerchantDeliveryTime } from "@/lib/merchantDeliveryTime";
import {
  buildStoreOpenStatusLabel,
  formatOpenStatusTagText,
} from "@/lib/storeOpenStatusLabel";
import { toTimestamp } from "@/lib/storeScheduleUi";
import { useScheduleTick } from "@/hooks/useScheduleTick";

import { GatiMitraColors } from "@/constants/gatimitra";

const { width } = Dimensions.get("window");
const PAGE_PAD = 16;
const CARD_WIDTH = width - PAGE_PAD * 2;
const IMAGE_HEIGHT = 220;
const CARD_RADIUS = 20;
const CARD_GAP = 18;

export type GMRestaurantCardV2Props = {
  merchant: MerchantSummary;
  initialSaved?: boolean;
  weatherDelayMinutes?: number;
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

function GMRestaurantCardV2Inner({
  merchant,
  initialSaved = false,
  weatherDelayMinutes = 0,
}: GMRestaurantCardV2Props) {
  const router = useRouter();
  const { syncBookmark } = useStoreBookmarkMutations();
  const [saved, setSaved] = useState(initialSaved);
  const [savedLoading, setSavedLoading] = useState(false);
  const scale = useSharedValue(1);
  const blockNavRef = useRef(false);

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

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved, merchant.id]);

  const bannerUri = useMemo(() => resolveMerchantCarouselBannerUri(merchant), [merchant]);

  const galleryUris = useMemo(() => resolveMerchantCarouselGalleryUris(merchant), [merchant]);

  const deliveryTimeLabel = useMemo(
    () =>
      formatMerchantDeliveryTime(merchant, {
        weatherDelayMinutes,
        unit: "min",
      }),
    [merchant, weatherDelayMinutes]
  );

  const toggleBookmark = useCallback(
    async (e: any) => {
      e?.stopPropagation?.();
      if (savedLoading) return;
      setSavedLoading(true);
      try {
        const res = await setStoreBookmark(merchant.id, !saved);
        setSaved(res.saved);
        syncBookmark(merchant.id, res.saved);
      } catch {
        // keep state
      } finally {
        setSavedLoading(false);
      }
    },
    [merchant.id, saved, savedLoading, syncBookmark]
  );

  const openMerchant = useCallback(() => {
    if (blockNavRef.current) {
      blockNavRef.current = false;
      return;
    }
    router.push({ pathname: "/home/merchant/[id]", params: { id: merchant.id } });
  }, [merchant.id, router]);

  const onCarouselSwipe = useCallback(() => {
    blockNavRef.current = true;
  }, []);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  return (
    <Animated.View style={[styles.card, animatedCardStyle]}>
      <Pressable
        onPress={openMerchant}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.cardPress}
      >
        <View style={styles.imageWrap} pointerEvents="box-none">
          <StoreBannerCarousel
            bannerUri={bannerUri}
            galleryUris={galleryUris}
            width={CARD_WIDTH}
            height={IMAGE_HEIGHT}
            borderRadius={CARD_RADIUS}
            holdMs={LIST_CARD_CAROUSEL_HOLD_MS}
            slideMs={LIST_CARD_CAROUSEL_SLIDE_MS}
            dimmed={!isOpen}
            showDots={galleryUris.length > 0}
            hidePlaceholderIcon
            enableSwipe
            deferTapToParent
            onSwipeGesture={onCarouselSwipe}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.5)", "transparent", "transparent"]}
            style={styles.gradientOverlay}
            pointerEvents="none"
          />
          {!isOpen ? <View style={styles.closedOverlay} pointerEvents="none" /> : null}
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
          {merchant.cuisines && merchant.cuisines.length > 0 && (
            <View style={styles.cuisineTag} pointerEvents="none">
              <Text style={styles.cuisineTagText} numberOfLines={1}>
                {merchant.cuisines[0]}
              </Text>
            </View>
          )}
          <View pointerEvents="none">
            <StoreOpenStatusBadge
              isOpen={isOpen}
              nextOpenAt={merchant.nextOpenAt}
              nextCloseAt={merchant.nextCloseAt}
            />
          </View>
        </View>

        <View style={[styles.content, !isOpen && styles.contentClosed]} pointerEvents="box-none">
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {merchant.name}
            </Text>
            <View style={styles.ratingWrap}>
              <MerchantRatingBadge
                rating={merchant.avgRating}
                totalReviews={merchant.totalReviews}
                showReviewHint
              />
            </View>
          </View>
          <NearFastDeliveryMeta
            deliveryTime={deliveryTimeLabel}
            distanceKm={merchant.distanceKm}
            compact
          />
          <MerchantOfferRow offerText={merchant.offerText} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const GMRestaurantCardV2 = React.memo(GMRestaurantCardV2Inner, (prev, next) => {
  const a = prev.merchant;
  const b = next.merchant;
  return (
    prev.initialSaved === next.initialSaved &&
    prev.weatherDelayMinutes === next.weatherDelayMinutes &&
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
    a.etaMinMinutes === b.etaMinMinutes &&
    a.etaMaxMinutes === b.etaMaxMinutes &&
    a.avgPreparationTimeMinutes === b.avgPreparationTimeMinutes &&
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
  cardPress: {
    width: "100%",
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
    backgroundColor: "rgba(0,0,0,0.18)",
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
    minWidth: 0,
  },
  ratingWrap: {
    flexShrink: 0,
  },
});
