/**
 * Compact 3-column grid tile — "Loved by Customers" (Swiggy Recommended-style).
 * Banner carousel on image with manual swipe.
 */

import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useEffect, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { StoreBannerCarousel } from "@/components/StoreBannerCarousel";
import {
  resolveMerchantBannerUri,
  resolveMerchantCarouselBannerUri,
  resolveMerchantCarouselGalleryUris,
} from "@/lib/merchantBanner";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import { formatGridOfferBadge, gridDeliveryLabel } from "@/lib/merchantOfferBadge";
import {
  GridCardImageRatingMask,
  GridCardRatingCutout,
  GRID_RATING_PILL,
} from "@/components/home/GridCardRatingCutout";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PAD = 16;
const GRID_GAP = 10;
export const LOVED_GRID_COLS = 3;
export const MERCHANT_GRID_CARD_W = Math.floor(
  (SCREEN_W - GRID_PAD * 2 - GRID_GAP * (LOVED_GRID_COLS - 1)) / LOVED_GRID_COLS
);
const CARD_RADIUS = 14;

type MerchantGridCardProps = {
  merchant: MerchantSummary;
  onPress: () => void;
  onPressIn?: () => void;
  weatherDelayMinutes?: number;
  /** Override default 3-column tile width (e.g. horizontal loved rail). */
  width?: number;
};

export function MerchantGridCard({
  merchant,
  onPress,
  onPressIn,
  weatherDelayMinutes = 0,
  width = MERCHANT_GRID_CARD_W,
}: MerchantGridCardProps) {
  const bannerUri = useMemo(() => resolveMerchantCarouselBannerUri(merchant), [merchant]);
  const galleryUris = useMemo(() => resolveMerchantCarouselGalleryUris(merchant), [merchant]);
  const fallbackBannerUri = useMemo(() => resolveMerchantBannerUri(merchant), [merchant]);
  const effectiveBannerUri = bannerUri ?? fallbackBannerUri;
  const cardPress = useScrollSafePress(onPress, { onPressIn });

  useEffect(() => {
    warmMerchantHeroImage(merchant.id, effectiveBannerUri ?? galleryUris[0] ?? null);
  }, [merchant.id, effectiveBannerUri, galleryUris]);
  const offerBadge = formatGridOfferBadge(merchant.offerText);
  const { label: baseDeliveryLabel } = gridDeliveryLabel(merchant, weatherDelayMinutes);
  const deliveryLabel =
    weatherDelayMinutes > 0 ? `${baseDeliveryLabel} · Rain Delay` : baseDeliveryLabel;
  const imageSize = width;

  return (
    <View style={[styles.card, { width }]}>
      <View style={[styles.imageStage, { width: imageSize }]}>
        <View style={[styles.imageClip, { width: imageSize, height: imageSize }]}>
          <TouchableOpacity
            onPress={cardPress.onPress}
            onPressIn={cardPress.onPressIn}
            onPressOut={cardPress.onPressOut}
            onTouchMove={cardPress.onTouchMove}
            activeOpacity={0.92}
            style={styles.imageTap}
          >
            <StoreBannerCarousel
              bannerUri={effectiveBannerUri}
              galleryUris={galleryUris}
              width={imageSize}
              height={imageSize}
              borderRadius={CARD_RADIUS}
              hidePlaceholderIcon
              showDots={galleryUris.length > 0}
              enableKenBurns={false}
              enableAutoRotate={galleryUris.length > 0}
              enableSwipe={galleryUris.length > 0}
              deferTapToParent
              onSwipeGesture={cardPress.blockPress}
              onGestureComplete={() => cardPress.releasePressBlock(320)}
            />
            {offerBadge ? (
              <View style={styles.offerImageTag}>
                <Text style={styles.offerImageTagText} numberOfLines={2}>
                  {offerBadge}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <GridCardImageRatingMask imageRadius={CARD_RADIUS} />
        </View>

        <GridCardRatingCutout
          rating={merchant.avgRating}
          totalReviews={merchant.totalReviews}
        />
      </View>

      <TouchableOpacity
        onPress={cardPress.onPress}
        onPressIn={cardPress.onPressIn}
        onPressOut={cardPress.onPressOut}
        onTouchMove={cardPress.onTouchMove}
        activeOpacity={0.7}
        style={styles.body}
      >
        <Text style={styles.name} numberOfLines={1}>
          {merchant.name}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={11} color="#9CA3AF" />
          <Text style={styles.metaText} numberOfLines={1}>
            {deliveryLabel}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
  },
  imageStage: {
    position: "relative",
    overflow: "visible",
    zIndex: 1,
  },
  imageClip: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  imageTap: {
    flex: 1,
  },
  offerImageTag: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 6,
    maxWidth: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 3,
  },
  offerImageTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 12,
  },
  body: {
    paddingTop: GRID_RATING_PILL.overhang + 3,
    paddingHorizontal: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    flex: 1,
  },
});
