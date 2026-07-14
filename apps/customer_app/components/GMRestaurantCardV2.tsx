/**
 * 2025 Premium Discovery Card – edge-to-edge image (220px), bookmark, offer badge,
 * gradient overlay, rating capsule, cuisine • distance • time.
 * Data: merchant_stores (banner_url / logo_url), real distance, rating from API only.
 */

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { View, TouchableOpacity, Pressable, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { useStoreBookmarkMutations } from "@/hooks/useStoreBookmarks";
import { useMerchantLiveStatus } from "@/hooks/useMerchantLiveStatus";
import { StoreBannerCarousel, LIST_CARD_CAROUSEL_HOLD_MS, LIST_CARD_CAROUSEL_SLIDE_MS } from "@/components/StoreBannerCarousel";
import { NearFastDeliveryMeta } from "@/components/NearFastDeliveryMeta";
import { MerchantRatingBadge } from "@/components/home/MerchantRatingBadge";
import { MerchantOfferRow } from "@/components/home/MerchantOfferRow";
import { MerchantRatingExplainerSheet } from "@/components/store/MerchantRatingExplainerSheet";
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
import { AppText } from "@/components/AppText";

const { width } = Dimensions.get("window");
const PAGE_PAD = 16;
const CARD_WIDTH = width - PAGE_PAD * 2;
const IMAGE_HEIGHT = 220;
const CARD_RADIUS = 20;
const CARD_GAP = 18;
/** Name + ETA + offer slots + content padding (stable CLS body). */
const CARD_BODY_HEIGHT = 12 + 22 + 6 + 18 + 6 + 18 + 14;
/** FlashList estimatedItemSize: image + body + bottom gap. */
export const RESTAURANT_CARD_ESTIMATED_SIZE = IMAGE_HEIGHT + CARD_BODY_HEIGHT + CARD_GAP;

export type GMRestaurantCardV2Props = {
  merchant: MerchantSummary;
  initialSaved?: boolean;
  weatherDelayMinutes?: number;
  bottomSpacing?: number;
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
      pointerEvents="none"
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
      <AppText
        style={[
          styles.openClosedTagText,
          (isClosingSoon || !openStatus.isGreen) && styles.openClosedTagTextRed,
        ]}
        numberOfLines={2}
      >
        {formatOpenStatusTagText(openStatus)}
      </AppText>
    </View>
  );
}

function GMRestaurantCardV2Inner({
  merchant,
  initialSaved = false,
  weatherDelayMinutes = 0,
  bottomSpacing = CARD_GAP,
}: GMRestaurantCardV2Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { syncBookmark } = useStoreBookmarkMutations();
  const [saved, setSaved] = useState(initialSaved);
  const [savedLoading, setSavedLoading] = useState(false);
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  /** Zomato-style: tap toggles overall ↔ For you / New. */
  const [showForYou, setShowForYou] = useState(false);

  const liveStatus = useMerchantLiveStatus(merchant);
  const isOpen = liveStatus === "OPEN";

  const userHasRatedStore = merchant.userHasRatedStore === true;
  const forYouRating =
    userHasRatedStore && merchant.forYouRating != null && Number.isFinite(Number(merchant.forYouRating))
      ? Number(merchant.forYouRating)
      : null;

  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved, merchant.id]);

  const bannerUri = useMemo(() => resolveMerchantCarouselBannerUri(merchant), [merchant]);

  useEffect(() => {
    warmMerchantHeroImage(merchant.id, bannerUri);
  }, [merchant.id, bannerUri]);

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
    navigateToMerchant(router, queryClient, merchant.id, merchant);
  }, [merchant, queryClient, router]);

  // Shutter is shown inside navigateToMerchant on committed press only.
  const cardPress = useScrollSafePress(openMerchant, {
    onPressIn: () => {
      warmMerchantHeroImage(merchant.id, bannerUri);
    },
  });

  const onCarouselSwipe = useCallback(() => {
    cardPress.blockPress();
  }, [cardPress]);

  const onCarouselGestureComplete = useCallback(() => {
    // Clear immediately — next tap must not wait on a post-swipe latch.
    cardPress.releasePressBlock(0);
  }, [cardPress]);

  return (
    <>
    <Pressable
      style={[styles.card, { marginBottom: bottomSpacing }]}
      onPress={cardPress.onPress}
      onPressIn={cardPress.onPressIn}
      onPressOut={cardPress.onPressOut}
      onTouchMove={cardPress.onTouchMove}
    >
      <View style={styles.imageWrap} collapsable={false}>
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
          onGestureComplete={onCarouselGestureComplete}
        />
          {!isOpen ? <View style={styles.closedOverlay} pointerEvents="none" /> : null}
          <TouchableOpacity
            onPress={() => {
              cardPress.blockPress();
              toggleBookmark();
            }}
            style={styles.bookmarkBtn}
            hitSlop={12}
            disabled={savedLoading}
          >
            {savedLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons
                name={saved ? "bookmark" : "bookmark-outline"}
                size={22}
                color={saved ? GatiMitraColors.primaryMint : "#fff"}
              />
            )}
          </TouchableOpacity>
          <StoreOpenStatusBadge
            isOpen={isOpen}
            nextOpenAt={merchant.nextOpenAt}
            nextCloseAt={merchant.nextCloseAt}
          />
      </View>

      <View style={[styles.content, !isOpen && styles.contentClosed]} pointerEvents="box-none">
          <View style={styles.mainCol}>
            <AppText style={styles.name} numberOfLines={1}>
              {merchant.name}
            </AppText>
            <NearFastDeliveryMeta
              deliveryTime={deliveryTimeLabel}
              distanceKm={merchant.distanceKm}
              compact
            />
            <MerchantOfferRow offerText={merchant.offerText} />
          </View>
          <View style={styles.ratingWrap}>
            <MerchantRatingBadge
              rating={showForYou ? forYouRating : merchant.avgRating}
              totalReviews={merchant.totalReviews}
              showReviewHint
              hintLabel={showForYou ? "For you" : undefined}
              showAsNew={showForYou && !userHasRatedStore}
              onPillPress={() => {
                cardPress.blockPress();
                setShowForYou((prev) => !prev);
              }}
              onReviewHintPress={() => {
                cardPress.blockPress();
                setRatingSheetOpen(true);
              }}
            />
          </View>
        </View>
    </Pressable>
    <MerchantRatingExplainerSheet
      visible={ratingSheetOpen}
      onClose={() => {
        setRatingSheetOpen(false);
        cardPress.releasePressBlock(0);
      }}
      storeName={merchant.name}
      overallRating={merchant.avgRating ?? null}
      totalReviews={merchant.totalReviews ?? null}
      forYouRating={forYouRating}
      userHasRatedStore={userHasRatedStore}
    />
    </>
  );
}

export const GMRestaurantCardV2 = React.memo(GMRestaurantCardV2Inner, (prev, next) => {
  const a = prev.merchant;
  const b = next.merchant;
  return (
    prev.initialSaved === next.initialSaved &&
    prev.weatherDelayMinutes === next.weatherDelayMinutes &&
    prev.bottomSpacing === next.bottomSpacing &&
    a.id === b.id &&
    a.name === b.name &&
    a.liveStatus === b.liveStatus &&
    a.nextOpenAt === b.nextOpenAt &&
    a.nextCloseAt === b.nextCloseAt &&
    a.displayImage === b.displayImage &&
    a.banner_url === b.banner_url &&
    a.offerText === b.offerText &&
    a.avgRating === b.avgRating &&
    a.forYouRating === b.forYouRating &&
    a.userHasRatedStore === b.userHasRatedStore &&
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
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
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
  bookmarkBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  openClosedTag: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "75%",
    zIndex: 4,
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
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  ratingWrap: {
    flexShrink: 0,
    marginTop: 1,
  },
});
